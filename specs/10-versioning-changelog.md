# Spec: Versioning and Changelog

**Purpose:** Manage semantic versioning of spec packages and maintain changelogs so consumers understand what changed between versions.

## Data Model

### Version Semantics for Specs
| Change Type | SemVer Bump | Examples |
|-------------|-------------|----------|
| New entity/constraint added | Minor | Add `Session` entity, add new constraint |
| Entity field added (optional) | Minor | Add optional `avatar` field to `User` |
| Entity field added (required) | Major | Add required `tenantId` to `User` |
| Entity field removed | Major | Remove `legacyField` from `User` |
| Constraint severity increased | Major | warning → error |
| Constraint severity decreased | Minor | error → warning |
| Constraint removed | Minor | Remove a check |
| State added to machine | Minor | Add `suspended` state |
| State removed from machine | Major | Remove `error` state |
| Docs-only change | Patch | Fix typo, clarify wording |

### CHANGELOG.md
```markdown
# Changelog

## [2.1.0] - 2026-02-18
### Added
- `Session.refreshToken` entity field
- Constraint auth-004: refresh token rotation

### Changed
- Constraint auth-002 severity: warning → error

## [2.0.0] - 2026-01-15
### Breaking
- `User.tenantId` is now required
- Removed `User.legacyToken` field
```

## Command

```
specpm version <major|minor|patch> [--message <msg>]
specpm changelog [--from <version>] [--to <version>]
```

## Behavior

### `specpm version`
1. Validate current package is clean (no uncommitted changes if in git)
2. Bump version in `spec.yaml`
3. Prompt for changelog entry (or use `--message`)
4. Prepend entry to `CHANGELOG.md`
5. If git repo: create commit and tag

### `specpm changelog`
1. Display changelog entries, optionally filtered by range

## Constraints

- Version bumps must follow the semantic rules above
- `specpm verify` should warn if changes don't match version bump (e.g., breaking change with minor bump)
- Changelog must follow Keep a Changelog format
- Version tags in git must be `v<semver>` format

## Edge Cases

- No CHANGELOG.md exists → create one
- Non-git project → skip git commit/tag steps
- Pre-release versions (1.0.0-beta.1) → supported

## Acceptance Criteria

- [ ] `specpm version minor` bumps version and updates changelog
- [ ] Breaking entity changes detected and flagged if minor bump attempted
- [ ] CHANGELOG.md follows Keep a Changelog format
- [ ] Git tag created if in a git repository
