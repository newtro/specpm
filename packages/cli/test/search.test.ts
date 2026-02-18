import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { searchCommand } from '../src/commands/search.js'
import { createServer } from '../../registry/src/server.js'
import type { FastifyInstance } from 'fastify'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { stringify } from 'yaml'

let app: FastifyInstance
let dataDir: string
let registryUrl: string

async function createTarball(manifest: Record<string, unknown>): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), 'specpm-cli-search-'))
  await writeFile(join(tmp, 'spec.yaml'), stringify(manifest))
  const tarballPath = join(tmpdir(), `cli-search-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`)
  execSync(`tar czf ${tarballPath} -C ${tmp} .`, { stdio: 'pipe' })
  const { readFile } = await import('node:fs/promises')
  const tarball = await readFile(tarballPath)
  await rm(tmp, { recursive: true, force: true })
  await rm(tarballPath, { force: true })
  return tarball
}

async function publishPkg(scope: string, name: string, version: string, manifest: Record<string, unknown>, token: string): Promise<void> {
  const tarball = await createTarball(manifest)
  const boundary = '----formdata-' + Date.now() + Math.random()
  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${JSON.stringify(manifest)}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tarball"; filename="package.tgz"\r\nContent-Type: application/gzip\r\n\r\n`))
  parts.push(tarball)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  await app.inject({
    method: 'PUT',
    url: `/api/v1/packages/${scope}/${name}/${version}`,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, authorization: `Bearer ${token}` },
    payload: Buffer.concat(parts),
  })
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'specpm-cli-search-data-'))
  app = await createServer({ dataDir })
  const addr = await app.listen({ port: 0, host: '127.0.0.1' })
  registryUrl = addr

  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { username: 'u1', password: 'pass1234', email: 'u@t.com' } })
  const loginRes = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { username: 'u1', password: 'pass1234' } })
  const token = JSON.parse(loginRes.payload).token

  await publishPkg('auth', 'oauth2', '1.0.0', {
    name: '@auth/oauth2', version: '1.0.0', description: 'OAuth2 authentication', author: 'test', license: 'MIT', tags: ['auth', 'security'],
  }, token)
  await publishPkg('data', 'pagination', '1.0.0', {
    name: '@data/pagination', version: '1.0.0', description: 'Pagination patterns', author: 'test', license: 'MIT', tags: ['data'],
  }, token)
})

afterAll(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('specpm search', () => {
  it('displays search results', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await searchCommand('auth', { registry: registryUrl })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results.length).toBe(1)
      expect(result.value.results[0].name).toBe('@auth/oauth2')
    }
    errSpy.mockRestore()
  })

  it('handles empty results', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await searchCommand('nonexistent', { registry: registryUrl })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results.length).toBe(0)
    }
    errSpy.mockRestore()
  })

  it('outputs JSON with --json flag', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await searchCommand('oauth', { registry: registryUrl, json: true })
    expect(result.ok).toBe(true)
    expect(logSpy).toHaveBeenCalled()
    const output = JSON.parse(logSpy.mock.calls[0][0])
    expect(output.results).toBeDefined()
    logSpy.mockRestore()
  })

  it('rejects short queries', async () => {
    const result = await searchCommand('a', { registry: registryUrl })
    expect(result.ok).toBe(false)
  })

  it('filters by tag', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await searchCommand('auth', { registry: registryUrl, tag: 'security' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.results.length).toBe(1)
    }
    errSpy.mockRestore()
  })
})
