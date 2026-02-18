# AGENTS.md — SpecPM Development Guidelines

> Operational guidelines for AI agents working on the SpecPM codebase.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | Node.js 22+ | LTS, native ESM, fast startup for CLI |
| Language | TypeScript 5.5+ (strict mode) | Type safety, ecosystem |
| CLI framework | Commander.js | Standard, minimal, well-documented |
| YAML parser | yaml (npm) | YAML 1.2 compliant, preserves comments |
| JSON Schema | ajv + ajv-formats | Fast, draft 2020-12 support |
| State machine validation | xstate (v5) | Validate machine configs |
| AST analysis | ts-morph | TypeScript AST, high-level API |
| HTTP client | undici (built-in) | Node.js native, fast |
| Registry server | Fastify | Fast, schema validation built-in |
| Database | SQLite via better-sqlite3 | Zero-config, embedded, sufficient for v1 |
| Testing | Vitest | Fast, ESM-native, compatible API |
| Build | tsup | Fast, simple bundling for CLI |
| Package manager | pnpm | Fast, strict, workspace support |

## File Structure

```
specpm/
├── AGENTS.md                    # This file
├── IMPLEMENTATION_PLAN.md       # Task list
├── specs/                       # Requirement specs (this drives everything)
│   ├── 01-cli-initialization.md
│   ├── ...
│   └── 16-trust-quality.md
├── packages/
│   ├── cli/                     # CLI package (main entry point)
│   │   ├── src/
│   │   │   ├── index.ts         # Entry: parse args, route to commands
│   │   │   ├── commands/        # One file per command
│   │   │   │   ├── init.ts
│   │   │   │   ├── install.ts
│   │   │   │   ├── context.ts
│   │   │   │   ├── check.ts
│   │   │   │   ├── verify.ts
│   │   │   │   ├── publish.ts
│   │   │   │   ├── search.ts
│   │   │   │   └── team.ts
│   │   │   ├── lib/             # Shared logic
│   │   │   │   ├── config.ts    # Load/save specpm.yaml
│   │   │   │   ├── resolver.ts  # Dependency resolution
│   │   │   │   ├── loader.ts    # Spec package loader/parser
│   │   │   │   ├── context/     # Context generators per agent
│   │   │   │   ├── checker/     # AST checkers per constraint type
│   │   │   │   └── registry.ts  # Registry HTTP client
│   │   │   └── types.ts         # Shared TypeScript types
│   │   ├── test/
│   │   └── package.json
│   ├── registry/                # Registry server
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   ├── storage/
│   │   │   └── search/
│   │   └── package.json
│   └── shared/                  # Shared types and utils
│       ├── src/
│       │   ├── types.ts         # SpecYaml, VerificationResult, etc.
│       │   ├── semver.ts        # SemVer parsing/comparison
│       │   └── schema.ts        # JSON Schema utilities
│       └── package.json
├── examples/                    # Example spec packages
│   ├── auth-oauth2/
│   └── data-pagination/
├── pnpm-workspace.yaml
├── tsconfig.json
└── vitest.config.ts
```

## Code Conventions

### General
- **ESM only** — use `import`/`export`, never `require()`
- **Strict TypeScript** — `strict: true`, no `any` unless absolutely necessary
- **No classes** — prefer functions and plain objects
- **Explicit return types** on exported functions
- **Errors as values** — return `Result<T, E>` types for expected failures, throw only for bugs
- **No abbreviations** in names — `configuration` not `cfg`, `package` not `pkg` (except well-known: `src`, `config`)

### Result Type Pattern
```typescript
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

function parseSpec(path: string): Result<SpecYaml, ValidationError[]> {
  // ...
}
```

### File Naming
- `kebab-case.ts` for all files
- One primary export per file
- Test files: `*.test.ts` co-located in `test/` directory

### CLI Output
- Use `console.error` for progress/status (stderr)
- Use `console.log` for data output (stdout) — important for `--json` piping
- Colors via `chalk` — always check `NO_COLOR` env var
- Spinners via `ora` for long operations

## Testing

### Strategy
- **Unit tests** for all `lib/` modules (pure logic, no I/O)
- **Integration tests** for commands (temporary directories, real file I/O)
- **No mocks** of internal modules — mock only external boundaries (HTTP, filesystem at edges)
- **Snapshot tests** for context generation output

### Running
```bash
pnpm test              # All tests
pnpm test -- --watch   # Watch mode
pnpm test -- path      # Specific test
```

### Test Structure
```typescript
import { describe, it, expect } from 'vitest'

describe('resolveDepencies', () => {
  it('resolves flat dependency tree', () => {
    // Arrange
    const manifest = { dependencies: { '@auth/oauth2': '^2.0.0' } }
    // Act
    const result = resolveDependencies(manifest, registry)
    // Assert
    expect(result.ok).toBe(true)
  })
})
```

## Specs → Implementation Mapping

The `specs/` directory is the **source of truth** for requirements. When implementing:

1. **Read the spec first** — every task in IMPLEMENTATION_PLAN.md references a spec number
2. **Implement what the spec says** — data models, commands, constraints, edge cases
3. **Check acceptance criteria** — each spec has checkboxes; your code should pass them all
4. **Don't over-build** — if the spec doesn't mention it, don't add it

| Spec | Implements As |
|------|---------------|
| 01 (init) | `commands/init.ts` |
| 02 (search) | `commands/search.ts` + `lib/registry.ts` |
| 03 (install) | `commands/install.ts` + `lib/resolver.ts` |
| 04 (context) | `commands/context.ts` + `lib/context/*.ts` |
| 05 (check) | `commands/check.ts` + `lib/checker/*.ts` |
| 06 (overrides) | `lib/overrides.ts` (used by context + check) |
| 07 (format) | `shared/types.ts` + `lib/loader.ts` |
| 08 (verify) | `commands/verify.ts` + `lib/verifier/*.ts` |
| 09 (publish) | `commands/publish.ts` |
| 10 (version) | `commands/version.ts` |
| 11 (private reg) | `lib/registry.ts` (multi-registry support) |
| 12 (team) | `commands/team.ts` |
| 13 (ci) | `commands/ci.ts` + `lib/reporters/*.ts` |
| 14 (registry API) | `registry/routes/*.ts` |
| 15 (search/discovery) | `registry/search/*.ts` |
| 16 (trust/quality) | `registry/scoring.ts` |

## Do's and Don'ts

### Do
- ✅ Read the relevant spec before writing any code
- ✅ Write tests alongside implementation (same PR)
- ✅ Handle errors gracefully — CLI must never show stack traces to users
- ✅ Use exit codes correctly (0 success, 1 failure, 2 config error)
- ✅ Make commands idempotent where possible
- ✅ Keep the CLI fast — lazy-load heavy modules (ts-morph, xstate)
- ✅ Log to stderr, data to stdout
- ✅ Support `--json` flag on every command that outputs data

### Don't
- ❌ Don't add features not in the specs
- ❌ Don't use `any` types — use `unknown` and narrow
- ❌ Don't mutate installed spec packages (`.specpm/specs/` is read-only at runtime)
- ❌ Don't require global installation — must work via `npx`
- ❌ Don't hardcode the registry URL — always read from config
- ❌ Don't store credentials in project files — user-level `~/.specpm/` only
- ❌ Don't block the event loop — use async I/O for file operations
- ❌ Don't add dependencies without justification — keep the CLI lean

## Ralph Loop Workflow

Each implementation task follows this cycle:

1. **📖 Read** — Open the spec, understand the requirement
2. **💻 Code** — Implement the minimal solution that satisfies the spec
3. **✅ Test** — Write tests, run them, ensure acceptance criteria pass
4. **📝 Commit** — One atomic commit per task: `feat(init): implement specpm init command`
5. **🔄 Next** — Pick the next task from IMPLEMENTATION_PLAN.md

Commit message format: `<type>(<scope>): <description>`
- Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`
- Scope: command name or module name
