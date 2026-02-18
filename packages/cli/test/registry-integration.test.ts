import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { stringify } from 'yaml'

// We test by importing the functions directly, using a real registry server
import { createServer } from '../../registry/src/server.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let registryUrl: string
let dataDir: string
let token: string

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

// Helper: create a valid spec package directory
async function createSpecDir(dir: string, name = '@test/example', version = '1.0.0') {
  await mkdir(dir, { recursive: true })
  const manifest = { name, version, description: 'Test', author: 'test', license: 'MIT' }
  await writeFile(join(dir, 'spec.yaml'), stringify(manifest))
  await writeFile(join(dir, 'README.md'), '# Test')
  return manifest
}

// Helper: create tarball from directory
async function createTarball(dir: string): Promise<Buffer> {
  const tarball = join(tmpdir(), `test-${Date.now()}.tgz`)
  execSync(`tar czf ${tarball} -C ${dir} .`, { stdio: 'pipe' })
  const buf = await readFile(tarball)
  await rm(tarball, { force: true })
  return buf
}

// Helper: publish via API
async function publishViaApi(scope: string, name: string, version: string, tarball: Buffer, manifest: object) {
  const boundary = '----test-' + Date.now()
  const manifestStr = JSON.stringify(manifest)
  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifestStr}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tarball"; filename="package.tgz"\r\nContent-Type: application/gzip\r\n\r\n`))
  parts.push(tarball)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  return app.inject({
    method: 'PUT',
    url: `/api/v1/packages/${scope}/${name}/${version}`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${token}`,
    },
    payload: Buffer.concat(parts),
  })
}

describe('CLI Registry Integration', () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'specpm-cli-reg-'))
    app = await createServer({ dataDir })
    await app.listen({ port: 0 })
    const address = app.server.address()
    const port = typeof address === 'object' ? address!.port : 0
    registryUrl = `http://127.0.0.1:${port}`

    // Create user and get token
    const loginRes = await fetch(`${registryUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'testuser', password: 'testpass' }),
    })
    token = (await loginRes.json() as any).token
  })

  afterAll(async () => {
    await app?.close()
  })

  // Task 2.5: Install from registry
  describe('Task 2.5: Install from registry', () => {
    it('installs a published package from registry', async () => {
      // Publish a package via API
      const specDir = await mkdtemp(join(tmpdir(), 'specpm-spec-'))
      const manifest = await createSpecDir(specDir)
      const tarball = await createTarball(specDir)
      const pubRes = await publishViaApi('test', 'example', '1.0.0', tarball, manifest)
      expect(pubRes.statusCode).toBe(201)

      // Now test install by fetching metadata + tarball manually (simulating installFromRegistry)
      const metaRes = await fetch(`${registryUrl}/api/v1/packages/test/example`)
      expect(metaRes.ok).toBe(true)
      const meta = await metaRes.json() as any
      expect(meta.versions['1.0.0']).toBeDefined()
      expect(meta.versions['1.0.0'].integrity).toMatch(/^sha256-/)

      // Download tarball
      const tarballRes = await fetch(`${registryUrl}${meta.versions['1.0.0'].tarballUrl}`)
      expect(tarballRes.ok).toBe(true)
      const downloadedTarball = Buffer.from(await tarballRes.arrayBuffer())

      // Verify integrity
      const { createHash } = await import('node:crypto')
      const hash = 'sha256-' + createHash('sha256').update(downloadedTarball).digest('hex')
      expect(hash).toBe(meta.versions['1.0.0'].integrity)

      await rm(specDir, { recursive: true, force: true })
    })
  })

  // Task 2.6: Publish command
  describe('Task 2.6: Publish command', () => {
    it('dry-run does not upload', async () => {
      const { publishCommand } = await import('../src/commands/publish.js')
      const specDir = await mkdtemp(join(tmpdir(), 'specpm-pub-'))
      await createSpecDir(specDir)

      const result = await publishCommand(specDir, { dryRun: true })
      expect(result.ok).toBe(true)
      expect(result.value).toContain('dry-run')

      // Verify nothing was published
      const metaRes = await fetch(`${registryUrl}/api/v1/packages/test/example`)
      expect(metaRes.status).toBe(404)

      await rm(specDir, { recursive: true, force: true })
    })
  })

  // Task 2.7: Login/Logout
  describe('Task 2.7: Login and Logout', () => {
    it('login stores credentials', async () => {
      const { loginCommand } = await import('../src/commands/login.js')
      const result = await loginCommand({
        registry: registryUrl,
        username: 'cliuser',
        password: 'clipass',
      })
      expect(result.ok).toBe(true)

      // Verify auth file exists
      const { homedir } = await import('node:os')
      const authPath = join(homedir(), '.specpm', 'auth.json')
      const content = JSON.parse(await readFile(authPath, 'utf-8'))
      expect(content.registry).toBe(registryUrl)
      expect(content.token).toBeDefined()
    })

    it('logout removes credentials', async () => {
      const { loginCommand, logoutCommand } = await import('../src/commands/login.js')
      await loginCommand({ registry: registryUrl, username: 'cliuser2', password: 'pass2' })

      const result = await logoutCommand()
      expect(result.ok).toBe(true)

      const { homedir } = await import('node:os')
      const authPath = join(homedir(), '.specpm', 'auth.json')
      expect(await fileExists(authPath)).toBe(false)
    })

    it('whoami works with valid token', async () => {
      const res = await fetch(`${registryUrl}/api/v1/auth/whoami`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(res.ok).toBe(true)
      const body = await res.json() as any
      expect(body.username).toBe('testuser')
    })
  })
})
