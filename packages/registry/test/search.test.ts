import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../src/server.js'
import type { FastifyInstance } from 'fastify'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { stringify } from 'yaml'

let app: FastifyInstance
let dataDir: string
let authToken: string

async function createTarball(manifest: Record<string, unknown>): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), 'specpm-search-'))
  await writeFile(join(tmp, 'spec.yaml'), stringify(manifest))
  const tarballPath = join(tmpdir(), `search-test-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`)
  execSync(`tar czf ${tarballPath} -C ${tmp} .`, { stdio: 'pipe' })
  const { readFile } = await import('node:fs/promises')
  const tarball = await readFile(tarballPath)
  await rm(tmp, { recursive: true, force: true })
  await rm(tarballPath, { force: true })
  return tarball
}

async function publishPackage(scope: string, name: string, version: string, manifest: Record<string, unknown>): Promise<void> {
  const tarball = await createTarball(manifest)
  const boundary = '----formdata-' + Date.now() + Math.random()
  const manifestStr = JSON.stringify(manifest)
  const parts: Buffer[] = []
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="manifest"\r\n\r\n${manifestStr}\r\n`))
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="tarball"; filename="package.tgz"\r\nContent-Type: application/gzip\r\n\r\n`))
  parts.push(tarball)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const body = Buffer.concat(parts)

  const response = await app.inject({
    method: 'PUT',
    url: `/api/v1/packages/${scope}/${name}/${version}`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${authToken}`,
    },
    payload: body,
  })
  expect(response.statusCode).toBe(201)
}

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'specpm-search-data-'))
  app = await createServer({ dataDir })
  await app.ready()

  // Register user
  await app.inject({
    method: 'POST', url: '/api/v1/auth/register',
    payload: { username: 'searcher', password: 'pass1234', email: 'search@test.com' },
  })
  const loginRes = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { username: 'searcher', password: 'pass1234' },
  })
  authToken = JSON.parse(loginRes.payload).token

  // Publish test packages
  await publishPackage('auth', 'oauth2', '1.0.0', {
    name: '@auth/oauth2', version: '1.0.0', description: 'OAuth2 authentication spec',
    author: 'test', license: 'MIT', tags: ['auth', 'oauth', 'security'],
  })
  await publishPackage('auth', 'jwt', '2.0.0', {
    name: '@auth/jwt', version: '2.0.0', description: 'JWT token handling spec',
    author: 'test', license: 'MIT', tags: ['auth', 'jwt', 'security'],
  })
  await publishPackage('data', 'pagination', '1.0.0', {
    name: '@data/pagination', version: '1.0.0', description: 'Cursor-based pagination patterns',
    author: 'test', license: 'MIT', tags: ['data', 'pagination'],
  })
})

afterAll(async () => {
  await app.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('GET /api/v1/search', () => {
  it('searches by keyword', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=auth' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(2)
    expect(body.results.map((r: any) => r.name)).toContain('@auth/oauth2')
    expect(body.results.map((r: any) => r.name)).toContain('@auth/jwt')
    expect(body.total).toBe(2)
  })

  it('searches by tag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?tag=security' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(2)
  })

  it('searches by keyword + tag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=oauth&tag=auth' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(1)
    expect(body.results[0].name).toBe('@auth/oauth2')
  })

  it('paginates results', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=auth&limit=1&page=1' })
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(1)
    expect(body.total).toBe(2)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(1)

    const res2 = await app.inject({ method: 'GET', url: '/api/v1/search?q=auth&limit=1&page=2' })
    const body2 = JSON.parse(res2.payload)
    expect(body2.results.length).toBe(1)
    expect(body2.results[0].name).not.toBe(body.results[0].name)
  })

  it('returns empty for no matches', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=nonexistent' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(0)
    expect(body.total).toBe(0)
  })

  it('rejects short queries', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=a' })
    expect(res.statusCode).toBe(400)
  })

  it('requires q or tag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search' })
    expect(res.statusCode).toBe(400)
  })

  it('sorts by recent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=auth&sort=recent' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.payload)
    expect(body.results.length).toBe(2)
  })

  it('includes version and tags in results', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/search?q=pagination' })
    const body = JSON.parse(res.payload)
    expect(body.results[0].version).toBe('1.0.0')
    expect(body.results[0].tags).toContain('pagination')
  })
})
