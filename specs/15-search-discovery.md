# Spec: Registry Search and Discovery

**Purpose:** Enable developers to find relevant spec packages through full-text search, tag filtering, and curated categories in the registry.

## Data Model

### SearchIndex Entry
```typescript
{
  name: string
  description: string
  tags: string[]
  category: string          // "auth", "data", "ui", "infra", "testing"
  readme: string            // Indexed for full-text search
  entityNames: string[]     // Indexed entity names
  constraintCount: number
  score: number
  downloads: number
  updatedAt: string
}
```

### Categories (curated)
```
auth        - Authentication and authorization
data        - Data modeling and persistence
ui          - User interface patterns
infra       - Infrastructure and deployment
testing     - Testing patterns
api         - API design and contracts
security    - Security patterns
```

## API

```
GET /api/v1/search?q=<query>&tag=<tag>&category=<cat>&sort=<sort>&limit=<n>&page=<n>
GET /api/v1/categories
GET /api/v1/categories/:name/packages
GET /api/v1/tags/popular
```

## Behavior

1. Full-text search across: name, description, readme, entity names, tags
2. Boost: exact name match > tag match > description match > readme match
3. Filter by tag and/or category (combinable)
4. Sort options: relevance (default), downloads, score, updated
5. Paginate results (default 20 per page)

## Constraints

- Search must return results in < 500ms for typical queries
- Search index updated within 60 seconds of new publish
- Minimum query length: 2 characters
- Results must exclude deprecated packages unless explicitly requested

## Edge Cases

- Misspelled queries → suggest corrections ("did you mean?")
- Empty category → return empty list, not error
- Special characters in query → sanitize, don't crash

## Acceptance Criteria

- [ ] Full-text search returns relevant packages
- [ ] Tag filtering works alone and combined with text search
- [ ] Category browsing returns packages in that category
- [ ] Results sorted correctly by each sort option
- [ ] Performance < 500ms for search queries
