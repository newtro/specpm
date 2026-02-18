import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { createDatabase } from './db.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerPackageRoutes } from './routes/packages.js'
import { registerSearchRoutes } from './routes/search.js'
import type Database from 'better-sqlite3'

export interface RegistryOptions {
  port?: number
  host?: string
  dbPath?: string
  dataDir?: string
}

export async function createServer(options: RegistryOptions = {}) {
  const app = Fastify({ logger: false })
  const db = createDatabase(options.dbPath)
  const dataDir = options.dataDir ?? 'data'

  await app.register(multipart, { limits: { fileSize: 1_048_576 } }) // 1MB

  // Decorate with db and dataDir
  app.decorate('db', db)
  app.decorate('dataDir', dataDir)

  // Rate limiting
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
  const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
  const RATE_LIMIT_MAX = 60 // requests per window

  app.addHook('onRequest', async (request, reply) => {
    const ip = request.ip
    const now = Date.now()
    let entry = rateLimitMap.get(ip)
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
      rateLimitMap.set(ip, entry)
    }
    entry.count++
    reply.header('x-ratelimit-limit', RATE_LIMIT_MAX)
    reply.header('x-ratelimit-remaining', Math.max(0, RATE_LIMIT_MAX - entry.count))
    reply.header('x-ratelimit-reset', Math.ceil(entry.resetAt / 1000))
    if (entry.count > RATE_LIMIT_MAX) {
      return reply.status(429).send({ error: 'Too many requests. Try again later.' })
    }
  })

  // Health check
  app.get('/api/v1/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Register routes
  registerAuthRoutes(app, db)
  registerPackageRoutes(app, db, dataDir)
  registerSearchRoutes(app, db)

  return app
}

// Direct run
const isMain = process.argv[1]?.endsWith('server.js')
if (isMain) {
  const app = await createServer({
    port: Number(process.env.PORT) || 4873,
    dataDir: process.env.DATA_DIR || 'data',
  })
  await app.listen({ port: Number(process.env.PORT) || 4873, host: '0.0.0.0' })
  console.log(`Registry listening on port ${Number(process.env.PORT) || 4873}`)
}
