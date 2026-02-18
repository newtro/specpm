# Spec: Publishing Workflow (`specpm publish`)

**Purpose:** Package and upload a verified spec package to the registry so other developers can install it.

## Data Model

### PublishPayload
```typescript
{
  tarball: Buffer             // gzipped tar of package directory
  manifest: SpecYaml          // Parsed spec.yaml
  verification: VerificationResult  // Must be L2+ passed
  readme: string              // README.md content (optional)
}
```

### PublishResponse
```typescript
{
  name: string
  version: string
  url: string                 // Package URL on registry
  publishedAt: string
}
```

## Command

```
specpm publish [<path>] [--tag <tag>] [--dry-run] [--access public|restricted]
```

| Flag | Description |
|------|-------------|
| `<path>` | Package directory, default "." |
| `--tag` | Dist-tag (default: "latest") |
| `--dry-run` | Run verification and show what would publish |
| `--access` | Public (default) or restricted (private registry) |

## Behavior

1. Run `specpm verify --level 2` → must pass
2. Check user is authenticated (`specpm login` must have been run)
3. Check version doesn't already exist in registry
4. Build tarball: include only spec files (not node_modules, .git, etc.)
5. Upload to registry: `PUT /api/v1/packages/<name>/<version>`
6. Registry runs its own L0 verification (defense in depth)
7. Print success with package URL

## Constraints

- Must pass L2 verification before publishing
- Authentication required (API token stored in `~/.specpm/auth.json`)
- Package tarball must not exceed 1MB compressed
- Cannot overwrite published version (immutable releases)
- Must include `.specpmignore` or default ignore patterns (.git, node_modules, .DS_Store)
- `--dry-run` must not make any network requests to publish endpoint

## Edge Cases

- Version already published → error with "use a new version"
- Not authenticated → error with "run specpm login"
- Network failure during upload → no partial publish (server-side atomicity)
- Package name already owned by different user → 403 error
- Very first publish of a scope → auto-claim scope for user

## Acceptance Criteria

- [ ] `specpm publish` verifies, packages, and uploads successfully
- [ ] Unauthenticated publish fails with clear message
- [ ] Duplicate version publish is rejected
- [ ] `--dry-run` shows what would publish without uploading
- [ ] Tarball excludes non-spec files
- [ ] Published package is immediately installable
