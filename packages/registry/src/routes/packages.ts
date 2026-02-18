import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { getUserFromToken } from './auth.js'

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

export function registerPackageRoutes(app: FastifyInstance, db: Database.Database, dataDir: string): void {

  // PUT /api/v1/packages/:scope/:name/:version - Publish
  app.put('/api/v1/packages/:scope/:name/:version', async (request, reply) => {
    const user = getUserFromToken(db, request.headers.authorization)
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' })
    }

    const { scope, name, version } = request.params as { scope: string; name: string; version: string }
    const packageName = `@${scope}/${name}`

    // Parse multipart
    let tarballBuffer: Buffer | null = null
    let manifestJson: string | null = null

    const parts = request.parts()
    for await (const part of parts) {
      if (part.type === 'file') {
        if (part.fieldname === 'tarball') {
          tarballBuffer = await part.toBuffer()
        }
      } else {
        if (part.fieldname === 'manifest') {
          manifestJson = part.value as string
        }
      }
    }

    if (!tarballBuffer || !manifestJson) {
      return reply.status(400).send({ error: 'tarball and manifest fields required' })
    }

    const manifest = JSON.parse(manifestJson)

    // Check version doesn't exist
    const existing = db.prepare('SELECT id FROM packages WHERE name = ?').get(packageName) as { id: number } | undefined
    if (existing) {
      const versionExists = db.prepare('SELECT id FROM versions WHERE package_id = ? AND version = ?')
        .get(existing.id, version)
      if (versionExists) {
        return reply.status(409).send({ error: `Version ${version} already exists. Use a new version.` })
      }
    }

    // L0 verification on tarball contents
    const tempDir = await mkdtemp(join(tmpdir(), 'specpm-verify-'))
    try {
      // Extract tarball to temp dir
      const tarballTempPath = join(tempDir, 'package.tgz')
      await writeFile(tarballTempPath, tarballBuffer)
      const extractDir = join(tempDir, 'package')
      await mkdir(extractDir, { recursive: true })
      execSync(`tar xzf ${tarballTempPath} -C ${extractDir}`, { stdio: 'pipe' })

      // Run L0 verification
      const { verifyL0 } = await import('../../node_modules/cli/src/lib/verifier/l0.js').catch(() => ({ verifyL0: null }))
      // For now, basic check: spec.yaml must exist in extracted contents
      if (!(await fileExists(join(extractDir, 'spec.yaml')))) {
        return reply.status(400).send({ error: 'Tarball must contain spec.yaml at root' })
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }

    // Compute integrity
    const integrity = 'sha256-' + createHash('sha256').update(tarballBuffer).digest('hex')

    // Store tarball
    const tarballDir = join(dataDir, 'packages', `@${scope}`, name)
    await mkdir(tarballDir, { recursive: true })
    const tarballPath = join(tarballDir, `${version}.tgz`)
    await writeFile(tarballPath, tarballBuffer)

    // Store metadata in SQLite
    let packageId: number
    if (existing) {
      packageId = existing.id
      db.prepare('UPDATE packages SET updated_at = datetime("now") WHERE id = ?').run(packageId)
    } else {
      const result = db.prepare(
        'INSERT INTO packages (name, description, author, owner_id) VALUES (?, ?, ?, ?)'
      ).run(packageName, manifest.description ?? '', manifest.author ?? '', user.id)
      packageId = Number(result.lastInsertRowid)
    }

    db.prepare(
      'INSERT INTO versions (package_id, version, manifest, integrity, tarball_path, size) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(packageId, version, manifestJson, integrity, tarballPath, tarballBuffer.length)

    return reply.status(201).send({
      name: packageName,
      version,
      integrity,
      publishedAt: new Date().toISOString(),
    })
  })

  // GET /api/v1/packages/:scope/:name - Package metadata
  app.get('/api/v1/packages/:scope/:name', async (request, reply) => {
    const { scope, name } = request.params as { scope: string; name: string }
    const packageName = `@${scope}/${name}`

    const pkg = db.prepare('SELECT * FROM packages WHERE name = ?').get(packageName) as any
    if (!pkg) {
      return reply.status(404).send({ error: 'Package not found' })
    }

    const versions = db.prepare('SELECT * FROM versions WHERE package_id = ? ORDER BY published_at DESC')
      .all(pkg.id) as any[]

    const versionMap: Record<string, any> = {}
    for (const v of versions) {
      versionMap[v.version] = {
        version: v.version,
        manifest: JSON.parse(v.manifest),
        integrity: v.integrity,
        size: v.size,
        publishedAt: v.published_at,
        tarballUrl: `/api/v1/packages/${scope}/${name}/${v.version}/tarball`,
      }
    }

    const etag = createHash('md5').update(JSON.stringify(versionMap)).digest('hex')
    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send()
    }

    return reply
      .header('etag', etag)
      .send({
        name: packageName,
        description: pkg.description,
        author: pkg.author,
        versions: versionMap,
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
      })
  })

  // GET /api/v1/packages/:scope/:name/:version - Version metadata
  app.get('/api/v1/packages/:scope/:name/:version', async (request, reply) => {
    const { scope, name, version } = request.params as { scope: string; name: string; version: string }
    const packageName = `@${scope}/${name}`

    const pkg = db.prepare('SELECT id FROM packages WHERE name = ?').get(packageName) as { id: number } | undefined
    if (!pkg) {
      return reply.status(404).send({ error: 'Package not found' })
    }

    const v = db.prepare('SELECT * FROM versions WHERE package_id = ? AND version = ?')
      .get(pkg.id, version) as any
    if (!v) {
      return reply.status(404).send({ error: 'Version not found' })
    }

    const etag = createHash('md5').update(v.manifest + v.integrity).digest('hex')
    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send()
    }

    return reply
      .header('etag', etag)
      .send({
        name: packageName,
        version: v.version,
        manifest: JSON.parse(v.manifest),
        integrity: v.integrity,
        size: v.size,
        publishedAt: v.published_at,
        tarballUrl: `/api/v1/packages/${scope}/${name}/${v.version}/tarball`,
      })
  })

  // GET /api/v1/packages/:scope/:name/:version/tarball - Download tarball
  app.get('/api/v1/packages/:scope/:name/:version/tarball', async (request, reply) => {
    const { scope, name, version } = request.params as { scope: string; name: string; version: string }
    const packageName = `@${scope}/${name}`

    const pkg = db.prepare('SELECT id FROM packages WHERE name = ?').get(packageName) as { id: number } | undefined
    if (!pkg) {
      return reply.status(404).send({ error: 'Package not found' })
    }

    const v = db.prepare('SELECT tarball_path, integrity FROM versions WHERE package_id = ? AND version = ?')
      .get(pkg.id, version) as { tarball_path: string; integrity: string } | undefined
    if (!v) {
      return reply.status(404).send({ error: 'Version not found' })
    }

    if (!(await fileExists(v.tarball_path))) {
      return reply.status(404).send({ error: 'Tarball file missing' })
    }

    const tarball = await readFile(v.tarball_path)
    const etag = v.integrity
    if (request.headers['if-none-match'] === etag) {
      return reply.status(304).send()
    }

    return reply
      .header('content-type', 'application/gzip')
      .header('etag', etag)
      .send(tarball)
  })
}
