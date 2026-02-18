# Spec: CLI Initialization (`specpm init`)

**Purpose:** Initialize a new SpecPM project by creating the configuration file and directory structure in the current working directory.

## Data Model

### `specpm.yaml` (Project Manifest)
```yaml
name: string                  # Project name (defaults to directory name)
version: string               # SemVer, defaults to "0.1.0"
description: string           # Optional
specs:
  directory: string           # Where specs live, default ".specpm/specs"
context:
  targets: string[]           # AI agent targets: ["claude", "cursor", "copilot"]
  output: string              # Context output dir, default ".specpm"
registry: string              # Registry URL, default "https://registry.specpm.dev"
overrides: Record<string, OverrideConfig>  # Per-package overrides
dependencies: Record<string, string>       # package -> version range
```

### Directory Structure Created
```
.specpm/
  specs/          # Installed spec packages
  context/        # Generated context files
  cache/          # Local cache
specpm.yaml       # Project manifest
```

## Command

```
specpm init [--name <name>] [--targets <agents>] [--yes]
```

| Flag | Description |
|------|-------------|
| `--name` | Project name (skip prompt) |
| `--targets` | Comma-separated: claude,cursor,copilot |
| `--yes` | Accept all defaults, no prompts |

## Behavior

1. Check if `specpm.yaml` already exists → error with `--force` override option
2. Interactive mode (default): prompt for name, description, targets
3. Create `specpm.yaml` with answers
4. Create `.specpm/` directory structure
5. Add `.specpm/cache` to `.gitignore` (create or append)
6. Print success message with next steps

## Constraints

- Must not overwrite existing `specpm.yaml` without `--force`
- Must work in empty directories and existing projects
- `specpm.yaml` must be valid YAML parseable by any YAML 1.2 parser
- Directory name fallback must sanitize to valid package-name characters (`[a-z0-9-]`)
- Exit code 0 on success, 1 on error

## Edge Cases

- Running in a git repo root vs subdirectory (warn if not root)
- Running where `.specpm/` already exists but no `specpm.yaml` (recover gracefully)
- No TTY available (non-interactive) without `--yes` → error with hint
- Permission denied on directory creation → clear error message

## Acceptance Criteria

- [ ] `specpm init --yes` in empty dir creates valid `specpm.yaml` and `.specpm/` structure
- [ ] `specpm init` without flags launches interactive prompts
- [ ] Running twice without `--force` exits with error, no file corruption
- [ ] `.gitignore` updated to exclude `.specpm/cache`
- [ ] Generated `specpm.yaml` passes YAML lint
