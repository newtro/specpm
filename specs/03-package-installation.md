# Spec: Package Installation and Dependency Resolution (`specpm install`)

**Purpose:** Download and install spec packages and their transitive dependencies into the local project from the registry.

## Data Model

### Lockfile (`specpm-lock.yaml`)
```yaml
lockfileVersion: 1
packages:
  "@auth/oauth2@2.1.0":
    resolved: "https://registry.specpm.dev/packages/@auth/oauth2/2.1.0"
    integrity: "sha256-abc123..."
    dependencies:
      "@core/http-client": "^1.0.0"
  "@core/http-client@1.2.3":
    resolved: "https://registry.specpm.dev/packages/@core/http-client/1.2.3"
    integrity: "sha256-def456..."
    dependencies: {}
```

### Installed Package Structure
```
.specpm/specs/@auth/oauth2/
  spec.yaml          # Package manifest
  entities/           # JSON Schema files
  states/             # XState state machines
  constraints/        # Formal constraints
  docs/               # Markdown semantic specs
```

## Command

```
specpm install [<package>[@<version>]] [--save-dev] [--dry-run] [--force]
```

| Flag | Description |
|------|-------------|
| (no args) | Install all dependencies from specpm.yaml |
| `<package>` | Install specific package and add to specpm.yaml |
| `@<version>` | Specific version or range |
| `--save-dev` | Add to devDependencies |
| `--dry-run` | Show what would install without doing it |
| `--force` | Re-download even if cached |

## Behavior

1. Resolve the package version against the registry (`GET /api/v1/packages/<name>/versions`)
2. Build full dependency tree (breadth-first resolution)
3. Detect version conflicts → use highest compatible version (npm-style)
4. Download packages not in cache (`GET /api/v1/packages/<name>/<version>/tarball`)
5. Verify integrity (SHA-256 hash from registry)
6. Extract to `.specpm/specs/<scope>/<name>/`
7. Update `specpm.yaml` dependencies
8. Write/update `specpm-lock.yaml`
9. Run L0 verification (well-formed check) on installed specs
10. Print summary: installed N packages

## Dependency Resolution

- Version ranges use SemVer (^, ~, >=, exact)
- Flat installation (no nested node_modules-style duplication)
- Conflict: if A requires `foo@^1.0` and B requires `foo@^2.0` → error with explanation
- Circular dependency → error at resolution time
- `peerDependencies` supported for specs that expect certain other specs present

## Constraints

- Must verify SHA-256 integrity of every downloaded package
- Must not modify files outside `.specpm/` and `specpm.yaml`/`specpm-lock.yaml`
- Lockfile must be deterministic (same input → same output)
- Installation must be atomic: if any package fails, roll back all changes
- Must work offline if all packages are in cache

## Edge Cases

- Package not found in registry → clear error with "did you mean?"
- Network failure mid-install → rollback, suggest retry
- Lockfile exists but specpm.yaml changed → reconcile (add new, keep locked versions)
- Disk full → graceful error before corrupting state
- Installing same package twice → idempotent (no-op if same version)
- Version range resolves to no available versions → error with available versions listed

## Acceptance Criteria

- [ ] `specpm install @auth/oauth2` downloads package and all dependencies
- [ ] `specpm-lock.yaml` created with integrity hashes
- [ ] `specpm.yaml` updated with new dependency
- [ ] `specpm install` (no args) restores from lockfile
- [ ] `--dry-run` shows plan without modifying anything
- [ ] Conflicting version ranges produce clear error
- [ ] Integrity check failure aborts install with warning
- [ ] Repeated install is idempotent
