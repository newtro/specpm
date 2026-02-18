# Spec: CI/CD Integration

**Purpose:** Provide commands and configuration for running SpecPM validation in continuous integration pipelines to enforce spec compliance on every commit.

## Data Model

### CI Configuration (in `specpm.yaml`)
```yaml
ci:
  check: true               # Run specpm check in CI
  team: true                # Run specpm team check in CI
  verify: true              # Verify local specs
  failOn: "error"           # "error" | "warning"
```

### CI Exit Codes
| Code | Meaning |
|------|---------|
| 0 | All checks pass |
| 1 | Check failures |
| 2 | Configuration error |
| 3 | Network/registry error |

## Command

```
specpm ci [--check] [--team] [--verify] [--reporter <format>]
```

| Flag | Description |
|------|-------------|
| `--check` | Run code validation |
| `--team` | Run team compliance |
| `--verify` | Verify local specs |
| `--reporter` | Output format: text (default), json, junit, github-actions |

## Behavior

1. Install dependencies from lockfile (`specpm install` with lockfile only)
2. Generate context (`specpm context`)
3. Run enabled checks in order: verify → team → check
4. Output results in requested format
5. Exit with appropriate code

### GitHub Actions Reporter
```
::error file=src/auth.ts,line=42::Constraint auth-001 failed: missing token validation
::warning file=src/user.ts,line=10::Constraint auth-003: logging recommended in catch block
```

### JUnit Reporter
Standard JUnit XML for integration with any CI system.

## Constraints

- Must work without TTY (no interactive prompts, no color codes unless `--color`)
- Must respect `CI=true` environment variable (auto non-interactive)
- `--reporter github-actions` uses GitHub annotation format
- All output to stdout (structured) and stderr (progress/logs)
- Must not require global installation (npx support)

## Edge Cases

- No lockfile → error code 2 (must commit lockfile for reproducible CI)
- Registry unreachable in CI → error code 3 with cached-install fallback hint
- GitHub Actions annotations exceed limit → truncate, summarize

## Acceptance Criteria

- [ ] `specpm ci` runs full pipeline non-interactively
- [ ] JUnit output is valid XML parseable by CI tools
- [ ] GitHub Actions annotations appear on PR files
- [ ] Exit codes are correct per scenario
- [ ] Works with `npx specpm ci`
