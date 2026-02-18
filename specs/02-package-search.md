# Spec: Package Search and Discovery (`specpm search`)

**Purpose:** Find spec packages in the registry by keyword, tag, or category so developers can discover relevant specifications.

## Data Model

### SearchResult
```typescript
{
  name: string            // e.g. "@auth/oauth2"
  version: string         // Latest version
  description: string     // One-line summary
  author: string          // Publisher
  downloads: number       // Weekly downloads
  score: number           // Quality score 0-1
  tags: string[]          // e.g. ["auth", "oauth", "security"]
  verified: boolean       // Passed L2+ verification
  updatedAt: string       // ISO date
}
```

### SearchResponse
```typescript
{
  results: SearchResult[]
  total: number
  page: number
  pageSize: number
}
```

## Command

```
specpm search <query> [--tag <tag>] [--sort <field>] [--limit <n>] [--json]
```

| Flag | Description |
|------|-------------|
| `--tag` | Filter by tag |
| `--sort` | Sort by: relevance (default), downloads, score, updated |
| `--limit` | Max results, default 20 |
| `--json` | Output as JSON |

## Behavior

1. Send search query to registry API: `GET /api/v1/search?q=<query>&tag=<tag>&sort=<sort>&limit=<limit>`
2. Display results in table format: name, version, description (truncated), score, downloads
3. Verified packages show ✓ indicator
4. If no results, suggest broadening query

## Constraints

- Query must be at least 2 characters
- Results must render in < 2 seconds for typical queries
- Table output must fit 80-column terminal (truncate description)
- `--json` output must be valid JSON to stdout (no decorative output mixed in)
- Registry errors must show friendly message, not raw HTTP errors

## Edge Cases

- No network connectivity → timeout with offline message
- Registry returns 0 results → helpful suggestions
- Query with special characters → URL-encode properly
- Very long package names → truncate in table view

## Acceptance Criteria

- [ ] `specpm search auth` returns relevant auth-related packages
- [ ] `--json` flag outputs parseable JSON
- [ ] `--tag` correctly filters results
- [ ] Results display in formatted table within 80 columns
- [ ] Network timeout produces user-friendly error
