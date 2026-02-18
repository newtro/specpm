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
