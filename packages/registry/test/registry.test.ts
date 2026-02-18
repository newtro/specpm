import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from '../src/server.js'
import type { FastifyInstance } from 'fastify'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { stringify } from 'yaml'

let app: FastifyInstance
let dataDir: string
let authToken: string

// Helper to create a valid spec tarball
async function createTestTarball(): Promise<{ tarball: Buffer; manifest: object }> {
  const tmp = await mkdtemp(join(tmpdir(), 'specpm-test-pkg-'))
  const manifest = {
    name: '@test/example',
    version: '1.0.0',
    description: 'Test package',
    author: 'test',
    license: 'MIT',
  }
  await writeFile(join(tmp, 'spec.yaml'), stringify(manifest))
  await writeFile(join(tmp, 'README.md'), '# Test')

  const tarballPath = join(tmpdir(), `test-${Date.now()}.tgz`)
  execSync(`tar czf ${tarballPath} -C ${tmp} .`, { stdio: 'pipe' })
  const { readFile } = await import('node:fs/promises')
  const tarball = await readFile(tarballPath)
  await rm(tmp, { recursive: true, force: true })
  await rm(tarballPath, { force: true })
  return { tarball, manifest }
}

// Helper for multipart publish
async function publishPackage(
  app: FastifyInstance,
  token: string,
  scope: string,
  name: string,
  version: string,
  tarball: Buffer,
  manifest: object
) {
  const boundary = '----formdata-' + Date.now()
  const manifestStr = JSON.stringify(manifest)

  const parts: Buffer[] = []
  // manifest field
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifestStr}\r\n`
  ))
  // tarball file
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="tarball"; filename="package.tgz"\r\nContent-Type: application/gzip\r\n\r\n`
  ))
  parts.push(tarball)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  return app.inject({
    method: 'PUT',
    url: `/api/v1/packages/${scope}/${name}/${version}`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${token}`,
    },
    payload: body,
  })
}

describe('Registry', () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'specpm-reg-'))
    app = await createServer({ dataDir })

    // Create test user and get token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'testuser', password: 'testpass' },
    })
    authToken = JSON.parse(loginRes.body).token
  })

  // Task 2.1: Health check
  describe('Task 2.1: Server scaffold', () => {
    it('health check returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.status).toBe('ok')
      expect(body.timestamp).toBeDefined()
    })
  })

  // Task 2.2: Publish endpoint
  describe('Task 2.2: Publish endpoint', () => {
    it('publishes a package successfully', async () => {
      const { tarball, manifest } = await createTestTarball()
      const res = await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('@test/example')
      expect(body.version).toBe('1.0.0')
      expect(body.integrity).toMatch(/^sha256-/)
    })

    it('rejects duplicate version with 409', async () => {
      const { tarball, manifest } = await createTestTarball()
      await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)
      const res = await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)
      expect(res.statusCode).toBe(409)
    })

    it('rejects unauthenticated with 401', async () => {
      const { tarball, manifest } = await createTestTarball()
      const res = await publishPackage(app, 'invalid-token', 'test', 'example', '1.0.0', tarball, manifest)
      expect(res.statusCode).toBe(401)
    })
  })

  // Task 2.3: Package storage
  describe('Task 2.3: Package storage', () => {
    it('stores tarball and integrity matches', async () => {
      const { tarball, manifest } = await createTestTarball()
      const res = await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)
      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)

      const expectedHash = 'sha256-' + createHash('sha256').update(tarball).digest('hex')
      expect(body.integrity).toBe(expectedHash)

      // Verify file exists on disk
      const { access } = await import('node:fs/promises')
      const tarballPath = join(dataDir, 'packages', '@test', 'example', '1.0.0.tgz')
      await expect(access(tarballPath)).resolves.toBeUndefined()
    })
  })

  // Task 2.4: Download endpoint
  describe('Task 2.4: Download endpoint', () => {
    it('downloads tarball', async () => {
      const { tarball, manifest } = await createTestTarball()
      await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/test/example/1.0.0/tarball',
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/gzip')
      expect(res.headers['etag']).toBeDefined()
    })

    it('returns package metadata', async () => {
      const { tarball, manifest } = await createTestTarball()
      await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/test/example',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('@test/example')
      expect(body.versions['1.0.0']).toBeDefined()
      expect(res.headers['etag']).toBeDefined()
    })

    it('returns version metadata', async () => {
      const { tarball, manifest } = await createTestTarball()
      await publishPackage(app, authToken, 'test', 'example', '1.0.0', tarball, manifest)

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/test/example/1.0.0',
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.name).toBe('@test/example')
      expect(body.version).toBe('1.0.0')
      expect(body.integrity).toMatch(/^sha256-/)
    })

    it('returns 404 for missing package', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/packages/test/nonexistent',
      })
      expect(res.statusCode).toBe(404)
    })
  })

  // Task 2.7: Authentication
  describe('Task 2.7: Authentication', () => {
    it('login returns token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'newuser', password: 'pass123' },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.token).toBeDefined()
      expect(body.username).toBe('newuser')
    })

    it('whoami returns authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/whoami',
        headers: { authorization: `Bearer ${authToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.username).toBe('testuser')
    })

    it('whoami rejects invalid token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/whoami',
        headers: { authorization: 'Bearer invalid-token' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('wrong password rejected', async () => {
      // First create the user
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'existinguser', password: 'correctpass' },
      })
      // Try wrong password
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { username: 'existinguser', password: 'wrongpass' },
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
