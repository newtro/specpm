import type { Result } from 'shared'

export interface SearchOptions {
  tag?: string
  sort?: string
  limit?: string
  json?: boolean
  registry?: string
}

interface SearchResult {
  name: string
  version: string
  description: string
  author: string
  downloads: number
  tags: string[]
  updatedAt: string
}

interface SearchResponse {
  results: SearchResult[]
  total: number
  page: number
  pageSize: number
}

export async function searchCommand(query: string, options: SearchOptions): Promise<Result<SearchResponse, string>> {
  if (query.length < 2) {
    return { ok: false, error: 'Search query must be at least 2 characters' }
  }

  const registryUrl = options.registry ?? process.env.SPECPM_REGISTRY ?? 'http://localhost:4873'
  const params = new URLSearchParams({ q: query })
  if (options.tag) params.set('tag', options.tag)
  if (options.sort) params.set('sort', options.sort)
  if (options.limit) params.set('limit', options.limit)

  let response: Response
  try {
    response = await fetch(`${registryUrl}/api/v1/search?${params}`)
  } catch (error) {
    return { ok: false, error: `Failed to connect to registry: ${error}` }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }))
    return { ok: false, error: `Registry error: ${(body as Record<string, string>).error ?? response.statusText}` }
  }

  const data = await response.json() as SearchResponse

  if (options.json) {
    console.log(JSON.stringify(data, null, 2))
  } else {
    if (data.results.length === 0) {
      console.error(`No packages found for "${query}". Try broadening your search.`)
    } else {
      console.error(`\nFound ${data.total} package${data.total !== 1 ? 's' : ''}:\n`)
      for (const result of data.results) {
        const desc = result.description.length > 50
          ? result.description.slice(0, 47) + '...'
          : result.description
        console.error(`  ${result.name}@${result.version}`)
        console.error(`    ${desc}`)
        console.error(`    downloads: ${result.downloads}  tags: ${result.tags.join(', ')}`)
        console.error('')
      }
    }
  }

  return { ok: true, value: data }
}
