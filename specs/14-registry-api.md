# Spec: Registry API and Storage

**Purpose:** Provide the HTTP API and storage backend that serves spec packages to the CLI for installation, search, and publishing.

## Data Model

### API Endpoints
```
GET    /api/v1/packages/:name                    # Package metadata
GET    /api/v1/packages/:name/versions            # All versions
GET    /api/v1/packages/:name/:version            # Specific version metadata
GET    /api/v1/packages/:name/:version/tarball    # Download tarball
PUT    /api/v1/packages/:name/:version            # Publish (authenticated)
GET    /api/v1/search?q=&tag=&sort=&limit=&page=  # Search
POST   /api/v1/auth/login                         # Get token
GET    /api/v1/auth/whoami                         # Check auth
```

### Package Metadata (stored)
```typescript
{
  name: string
  description: string
  author: string
  createdAt: string
  versions: {
    [version: string]: {
      publishedAt: string
      integrity: string         // sha256 of tarball
      tarballUrl: string
      manifest: SpecYaml        // Parsed spec.yaml
      verification: VerificationResult
      size: number              // bytes
      distTags: string[]
    }
  }
  tags: string[]
  downloads: { weekly: number, total: number }
  score: number                  // Trust/quality score
}
```

### Storage Layout (S3/filesystem)
```
packages/
  @auth/oauth2/
    metadata.json
    2.1.0.tgz
    2.0.0.tgz
```

## Behavior

### Publish Flow
1. Authenticate request (Bearer token)
2. Verify version doesn't exist (409 if duplicate)
3. Run L0 verification on tarball contents
4. Store tarball to storage backend
5. Update metadata
6. Update search index

### Install Flow
1. `GET /packages/:name/:version` → returns metadata with tarball URL and integrity
2. `GET /packages/:name/:version/tarball` → stream tarball
3. Client verifies integrity hash

## Constraints

- All writes require authentication
- Reads are public (for public packages) or authenticated (for private)
- Published versions are immutable (no overwrite, only deprecate)
- Rate limiting: 100 requests/min unauthenticated, 1000 authenticated
- Tarball max size: 1MB
- API must return proper HTTP status codes and JSON error bodies
- Must support ETags for caching

## Edge Cases

- Concurrent publish of same version → first wins, second gets 409
- Package name with special characters → URL encoding
- Very large metadata (1000+ versions) → paginate versions endpoint
- Storage backend failure → 503 with retry-after header

## Acceptance Criteria

- [ ] Full CRUD lifecycle: publish → list → download → verify
- [ ] Authentication required for publish
- [ ] Immutable versions (no overwrite)
- [ ] Search returns relevant results
- [ ] Rate limiting enforced
- [ ] Proper HTTP status codes for all error cases
