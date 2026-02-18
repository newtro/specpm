import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'

interface SearchParams {
  q?: string
  tag?: string
  sort?: string
  limit?: string
  page?: string
}

export function registerSearchRoutes(app: FastifyInstance, db: Database.Database): void {

  // GET /api/v1/search
  app.get('/api/v1/search', async (request, reply) => {
    const { q, tag, sort = 'relevance', limit: limitStr = '20', page: pageStr = '1' } = request.query as SearchParams

    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100)
    const page = Math.max(parseInt(pageStr, 10) || 1, 1)
    const offset = (page - 1) * limit

    if (!q && !tag) {
      return reply.status(400).send({ error: 'Query parameter q or tag is required' })
    }

    if (q && q.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' })
    }

    let results: unknown[]
    let total: number

    if (q) {
      // Full-text search
      const searchTerm = q.replace(/['"]/g, '').trim()

      let baseQuery: string
      let countQuery: string
      let params: unknown[]

      if (tag) {
        baseQuery = `
          SELECT p.id, p.name, p.description, p.author, p.updated_at,
                 COALESCE(dc.count, 0) as downloads
          FROM package_search ps
          JOIN packages p ON p.id = ps.rowid
          JOIN package_tags pt ON pt.package_id = p.id AND pt.tag = ?
          LEFT JOIN download_counts dc ON dc.package_id = p.id
          WHERE package_search MATCH ?
        `
        countQuery = `
          SELECT COUNT(*) as total
          FROM package_search ps
          JOIN packages p ON p.id = ps.rowid
          JOIN package_tags pt ON pt.package_id = p.id AND pt.tag = ?
          WHERE package_search MATCH ?
        `
        params = [tag, searchTerm]
      } else {
        baseQuery = `
          SELECT p.id, p.name, p.description, p.author, p.updated_at,
                 COALESCE(dc.count, 0) as downloads
          FROM package_search ps
          JOIN packages p ON p.id = ps.rowid
          LEFT JOIN download_counts dc ON dc.package_id = p.id
          WHERE package_search MATCH ?
        `
        countQuery = `
          SELECT COUNT(*) as total
          FROM package_search ps
          JOIN packages p ON p.id = ps.rowid
          WHERE package_search MATCH ?
        `
        params = [searchTerm]
      }

      const orderClause = getOrderClause(sort)
      const totalRow = db.prepare(countQuery).get(...params) as { total: number }
      total = totalRow.total

      results = db.prepare(`${baseQuery} ${orderClause} LIMIT ? OFFSET ?`)
        .all(...params, limit, offset) as unknown[]
    } else {
      // Tag-only filter
      const baseQuery = `
        SELECT p.id, p.name, p.description, p.author, p.updated_at,
               COALESCE(dc.count, 0) as downloads
        FROM packages p
        JOIN package_tags pt ON pt.package_id = p.id AND pt.tag = ?
        LEFT JOIN download_counts dc ON dc.package_id = p.id
      `
      const countQuery = `
        SELECT COUNT(*) as total
        FROM packages p
        JOIN package_tags pt ON pt.package_id = p.id AND pt.tag = ?
      `
      const orderClause = getOrderClause(sort)
      const totalRow = db.prepare(countQuery).get(tag) as { total: number }
      total = totalRow.total

      results = db.prepare(`${baseQuery} ${orderClause} LIMIT ? OFFSET ?`)
        .all(tag, limit, offset) as unknown[]
    }

    // Enrich with latest version and tags
    const enriched = results.map((row: any) => {
      const latestVersion = db.prepare(
        'SELECT version FROM versions WHERE package_id = ? ORDER BY published_at DESC LIMIT 1'
      ).get(row.id) as { version: string } | undefined

      const tags = db.prepare(
        'SELECT tag FROM package_tags WHERE package_id = ?'
      ).all(row.id) as { tag: string }[]

      return {
        name: row.name,
        version: latestVersion?.version ?? '0.0.0',
        description: row.description ?? '',
        author: row.author ?? '',
        downloads: row.downloads,
        tags: tags.map(t => t.tag),
        updatedAt: row.updated_at,
      }
    })

    return reply.send({
      results: enriched,
      total,
      page,
      pageSize: limit,
    })
  })
}

function getOrderClause(sort: string): string {
  switch (sort) {
    case 'downloads': return 'ORDER BY downloads DESC'
    case 'recent': return 'ORDER BY p.updated_at DESC'
    case 'relevance':
    default: return 'ORDER BY p.name ASC'
  }
}

/**
 * Index a package in the FTS search table. Call after publish.
 */
export function indexPackageForSearch(db: Database.Database, packageId: number, name: string, description: string, tags: string[]): void {
  // Update FTS index
  // Delete old entry if exists
  try {
    db.prepare('DELETE FROM package_search WHERE rowid = ?').run(packageId)
  } catch {
    // ignore if not exists
  }
  db.prepare('INSERT INTO package_search(rowid, name, description, tags) VALUES (?, ?, ?, ?)')
    .run(packageId, name, description, tags.join(' '))

  // Update tags
  db.prepare('DELETE FROM package_tags WHERE package_id = ?').run(packageId)
  const insertTag = db.prepare('INSERT OR IGNORE INTO package_tags (package_id, tag) VALUES (?, ?)')
  for (const tag of tags) {
    insertTag.run(packageId, tag)
  }

  // Ensure download_counts row exists
  db.prepare('INSERT OR IGNORE INTO download_counts (package_id, count) VALUES (?, 0)').run(packageId)
}
