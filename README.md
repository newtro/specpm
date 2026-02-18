# SpecPM

**The package manager for AI coding specifications.**

SpecPM lets teams define, share, and enforce coding specifications that AI coding assistants actually follow. Instead of hoping Claude/Cursor/Copilot generates correct code, you give it precise specs — entity schemas, constraints, state machines — and SpecPM generates the right context files automatically.

```bash
npx specpm init --yes
npx specpm install @auth/email-password
npx specpm context
# → .specpm/CLAUDE.md generated. Claude now knows your auth spec.
```

## The Problem

AI coding assistants are powerful but inconsistent. You tell Claude "add auth" and get a different implementation every time. Password hashing might use bcrypt one day, argon2 the next. Session tokens might expire in 1 hour or never.

**SpecPM solves this by making specifications packageable, installable, and enforceable.**

- **Packageable:** Specs are versioned packages with schemas, constraints, and docs
- **Installable:** `specpm install @auth/email-password` — like npm, but for specs
- **Enforceable:** ESLint plugin validates your code against installed specs in real-time

## Quick Start

### 1. Initialize

```bash
specpm init
# or non-interactive:
specpm init --name my-app --targets claude,cursor --yes
```

Creates `specpm.yaml`:

```yaml
name: my-app
context:
  targets: [claude, cursor]
```

### 2. Install Specs

```bash
# From a local path
specpm install ./specs/auth-email-password

# From the registry
specpm install @auth/email-password
```

### 3. Generate Context

```bash
specpm context                    # Claude (default)
specpm context --target cursor    # Cursor
specpm context --target copilot   # GitHub Copilot
specpm context --target all       # All targets
```

Output files:
- **Claude:** `.specpm/CLAUDE.md`
- **Cursor:** `.cursorrules`
- **Copilot:** `.github/copilot-instructions.md`

### 4. Check Your Code

```bash
specpm check
```

Validates your source code against installed specs using AST analysis.

## CLI Reference

### `specpm init`

Initialize a new SpecPM project.

```bash
specpm init [options]
```

| Flag | Description |
|------|-------------|
| `--name <name>` | Project name |
| `--targets <targets>` | AI targets (comma-separated: `claude,cursor,copilot`) |
| `--yes` | Accept all defaults, no prompts |
| `--force` | Overwrite existing `specpm.yaml` |

### `specpm install <source>`

Install a spec package.

```bash
specpm install ./path/to/spec        # Local path
specpm install @auth/email-password  # From registry
```

| Flag | Description |
|------|-------------|
| `--save-dev` | Add to devDependencies |
| `--dry-run` | Show what would install |
| `--force` | Re-install even if present |
| `--registry <url>` | Registry URL |

### `specpm context`

Generate AI context files from installed specs.

```bash
specpm context [options]
```

| Flag | Description |
|------|-------------|
| `--target <target>` | Target: `claude`, `cursor`, `copilot`, `all` (default: `claude`) |

Outputs estimated token count and warns if context is very large (>50K tokens).

### `specpm check`

Validate source code against spec constraints via AST analysis.

```bash
specpm check [options]
```

| Flag | Description |
|------|-------------|
| `--spec <package>` | Check against specific spec only |
| `--json` | Output as JSON |
| `--strict` | Treat warnings as errors |

### `specpm verify [path]`

Verify a spec package is well-formed.

```bash
specpm verify                  # Current directory
specpm verify ./my-spec        # Specific path
```

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

Runs L0 (schema validation, file existence) and L1 (cross-reference, constraint consistency) checks.

### `specpm publish [path]`

Publish a spec package to the registry.

```bash
specpm publish              # Current directory
specpm publish ./my-spec    # Specific path
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Show what would publish |
| `--registry <url>` | Registry URL |
| `--tag <tag>` | Dist-tag (default: `latest`) |

### `specpm login`

Authenticate with a spec registry.

```bash
specpm login --registry https://registry.specpm.dev
```

| Flag | Description |
|------|-------------|
| `--registry <url>` | Registry URL (required) |
| `--token <token>` | API token |
| `--username <user>` | Username |
| `--password <pass>` | Password |

### `specpm logout`

Remove stored authentication.

### `specpm search <query>`

Search for spec packages in the registry.

```bash
specpm search auth
specpm search pagination --sort downloads --limit 5
```

| Flag | Description |
|------|-------------|
| `--tag <tag>` | Filter by tag |
| `--sort <sort>` | Sort by: `relevance`, `downloads`, `recent` |
| `--limit <n>` | Max results |
| `--json` | Output as JSON |
| `--registry <url>` | Registry URL |

### `specpm version <bump>`

Bump package version and update changelog.

```bash
specpm version patch
specpm version minor --message "Added rate limiting"
```

| Flag | Description |
|------|-------------|
| `--message <msg>` | Changelog message |
| `--preid <id>` | Prerelease identifier (e.g., `beta`) |

Bump must be `major`, `minor`, or `patch`.

### `specpm ci`

Run all checks for CI pipelines.

```bash
specpm ci --check --team --verify --reporter junit
```

| Flag | Description |
|------|-------------|
| `--check` | Run code validation |
| `--team` | Run team compliance |
| `--verify` | Verify local specs |
| `--reporter <fmt>` | Output: `text`, `json`, `junit`, `github` |
| `--strict` | Treat warnings as errors |

### `specpm team check`

Verify project meets team requirements defined in `specpm-team.yaml`.

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

### `specpm team sync`

Install/update required team packages.

| Flag | Description |
|------|-------------|
| `--registry <url>` | Registry URL |

### `specpm registry add <scope> <url>`

Add a scoped registry for private packages.

### `specpm registry remove <scope>`

Remove a scoped registry.

### `specpm registry list`

List configured registries.

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

## Spec Package Format

A spec package is a directory with a `spec.yaml` manifest:

```yaml
name: "@scope/package-name"
version: "1.0.0"
description: "What this spec defines"
author: "your-name"
license: "MIT"
tags: ["auth", "security"]
specpm: ">=0.1.0"

entities:
  - entities/user.schema.json
  - entities/session.schema.json

states:
  - states/auth-flow.yaml

constraints: constraints/constraints.yaml

docs:
  - docs/overview.md
  - docs/implementation-notes.md

dependencies:
  "@data/pagination": "^1.0.0"

context:
  priority: ["constraints", "entities", "docs"]
  tokenBudget: 6000
```

### Entities

JSON Schema files defining your data models:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "user",
  "title": "User",
  "type": "object",
  "required": ["id", "email", "passwordHash"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "passwordHash": { "type": "string", "minLength": 60 }
  }
}
```

### Constraints

Rules the AI (and your code) must follow:

```yaml
constraints:
  - id: password-hashing
    description: "Passwords must be hashed with bcrypt, minimum cost factor 10"
    type: pattern
    severity: error
    check:
      functionCall: "bcrypt.hash"
      requiredArgs: ["password", "saltRounds"]

  - id: session-expiry
    description: "Sessions must expire within 24 hours"
    type: entity
    severity: warning
    check:
      entity: Session
      field: expiresAt
      required: true
```

### State Machines

Define valid state transitions:

```yaml
id: auth-flow
initial: unauthenticated
states:
  unauthenticated:
    transitions:
      - to: authenticated
        on: login_success
  authenticated:
    transitions:
      - to: unauthenticated
        on: logout
```

## Overrides

Customize installed specs in your `specpm.yaml` without forking:

```yaml
name: my-app
overrides:
  "@auth/email-password":
    extend:
      User:
        displayName: { "type": "string" }
        avatarUrl: { "type": "string", "format": "uri" }
    remove:
      - Session  # We use JWTs instead
```

- **extend:** Add properties to an entity by title
- **remove:** Remove entities by title

## ESLint Plugin

The ESLint plugin surfaces spec violations as lint errors — no new CI steps needed.

### Setup

```bash
npm install eslint-plugin-specpm --save-dev
```

### Configuration (Flat Config)

```js
// eslint.config.js
import specpm from 'eslint-plugin-specpm'

export default [
  specpm.configs.recommended,
  // or specpm.configs.strict for all rules as errors
]
```

### Rules

| Rule | Description | Recommended | Strict |
|------|-------------|:-----------:|:------:|
| `specpm/entity-match` | Validate TS interfaces match entity schemas | error | error |
| `specpm/constraint-pattern` | Check required function call patterns | error | error |
| `specpm/endpoint-shape` | Validate route handler response shapes | warn | error |
| `specpm/state-coverage` | Warn on unhandled state machine states | warn | error |

The plugin auto-detects your framework (Next.js, Express, Fastify) for endpoint rules.

## Team / Enterprise Usage

Define team-wide spec requirements in `specpm-team.yaml`:

```yaml
team: my-org
description: "Backend service standards"

required:
  - name: "@auth/email-password"
    version: "^1.0.0"
  - name: "@data/pagination"
    version: "^1.0.0"

settings:
  strictMode: true
  context:
    targets: [claude, cursor]
```

Then enforce:

```bash
specpm team check    # Verify compliance
specpm team sync     # Auto-install missing required specs
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Spec Check
on: [push, pull_request]

jobs:
  spec-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npx specpm ci --check --team --verify --reporter github
```

The `--reporter github` flag outputs GitHub Actions annotations so spec violations appear inline on PRs.

Other reporters:
- `--reporter text` — Human-readable (default)
- `--reporter json` — Machine-readable JSON
- `--reporter junit` — JUnit XML for CI systems

## Registry

### Publishing

```bash
specpm login --registry https://registry.specpm.dev
specpm publish
```

### Searching

```bash
specpm search auth
specpm search "rate limiting" --sort downloads
```

### Private Registries

```bash
specpm registry add @myorg https://specs.myorg.com
specpm login --registry https://specs.myorg.com --token $SPEC_TOKEN
specpm install @myorg/internal-auth
```

## Contributing

1. Clone: `git clone https://github.com/newtro/specpm.git`
2. Install: `pnpm install`
3. Build: `pnpm build`
4. Test: `pnpm test`

This is a pnpm monorepo with four packages:
- `packages/cli` — The main CLI (`specpm`)
- `packages/registry` — The registry server
- `packages/eslint-plugin` — ESLint plugin
- `packages/shared` — Shared types and schemas

PRs welcome. Please include tests.

## License

MIT © [Newtro Studios](https://github.com/newtro)
