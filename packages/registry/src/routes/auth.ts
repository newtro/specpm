import { randomBytes, createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function getUserFromToken(db: Database.Database, authHeader?: string): { id: number; username: string } | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const row = db.prepare(`
    SELECT u.id, u.username FROM users u
    JOIN tokens t ON t.user_id = u.id
    WHERE t.token = ? AND (t.expires_at IS NULL OR t.expires_at > datetime('now'))
  `).get(token) as { id: number; username: string } | undefined
  return row ?? null
}

export function registerAuthRoutes(app: FastifyInstance, db: Database.Database): void {
  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', async (request, reply) => {
    const { username, password } = request.body as { username: string; password: string }
    if (!username || !password) {
      return reply.status(400).send({ error: 'username and password required' })
    }

    const hash = hashPassword(password)
    let user = db.prepare('SELECT id, username FROM users WHERE username = ? AND password_hash = ?')
      .get(username, hash) as { id: number; username: string } | undefined

    // Auto-create user if not exists (simple for MVP)
    if (!user) {
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username)
      if (existing) {
        return reply.status(401).send({ error: 'Invalid credentials' })
      }
      const result = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash)
      user = { id: Number(result.lastInsertRowid), username }
    }

    const token = generateToken()
    db.prepare('INSERT INTO tokens (user_id, token) VALUES (?, ?)').run(user.id, token)

    return { token, username: user.username }
  })

  // GET /api/v1/auth/whoami
  app.get('/api/v1/auth/whoami', async (request, reply) => {
    const user = getUserFromToken(db, request.headers.authorization)
    if (!user) {
      return reply.status(401).send({ error: 'Not authenticated' })
    }
    return { username: user.username, id: user.id }
  })
}
