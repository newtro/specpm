# SpecPM Implementation Plan

> Each task is one Ralph Loop iteration: read spec → implement → verify → commit.
> Priority: P0 = MVP demo, P1 = v1.0, P2 = future.

---

## Phase 1: Core CLI (MVP)

_Goal: `specpm init` → `specpm install` (from local) → `specpm context` → AI generates code._

| # | Task | Spec | Priority | Depends On |
|---|------|------|----------|------------|
| 1.1 | ✅ Project scaffold: TypeScript, Commander.js CLI, build pipeline | — | P0 | — |
| 1.2 | ✅ Define spec package format: spec.yaml schema, directory structure | 07 | P0 | 1.1 |
| 1.3 | ✅ Create 2-3 example spec packages (auth/oauth2, data/pagination) | 07 | P0 | 1.2 |
| 1.4 | ✅ `specpm init` command: interactive + `--yes` mode | 01 | P0 | 1.1 |
| 1.5 | ✅ Spec loader: read and parse spec packages from `.specpm/specs/` | 07 | P0 | 1.2 |
| 1.6 | ✅ `specpm install` from local path (no registry yet) | 03 | P0 | 1.4, 1.5 |
| 1.7 | ✅ Lockfile generation (`specpm-lock.yaml`) | 03 | P0 | 1.6 |
| 1.8 | ✅ Dependency resolution algorithm (SemVer ranges, flat tree) | 03 | P0 | 1.6 |
| 1.9 | ✅ Context generator core: merge specs into unified markdown | 04 | P0 | 1.5 |
| 1.10 | ✅ Claude target: generate `.specpm/CLAUDE.md` | 04 | P0 | 1.9 |
| 1.11 | ✅ Cursor target: generate `.cursorrules` | 04 | P0 | 1.9 |
| 1.12 | ✅ Copilot target: generate `.github/copilot-instructions.md` | 04 | P0 | 1.9 |
| 1.13 | Override system: entity extend/remove/rename in memory | 06 | P1 | 1.9 |
| 1.14 | Context token counting and size warnings | 04 | P1 | 1.9 |
| 1.15 | `specpm context --watch` mode | 04 | P1 | 1.9 |

**MVP Demo Flow:** init → install local spec → context → show CLAUDE.md → have Claude generate code from it.

---

## Phase 2: Registry

_Goal: Packages come from a real registry. Publish, search, install over HTTP._

| # | Task | Spec | Priority | Depends On |
|---|------|------|----------|------------|
| 2.1 | ✅ Registry server scaffold: Fastify + SQLite | 14 | P0 | — |
| 2.2 | ✅ Publish endpoint: `PUT /packages/:name/:version` | 14 | P0 | 2.1 |
| 2.3 | ✅ Package storage: tarball to filesystem/S3 | 14 | P0 | 2.1 |
| 2.4 | ✅ Download endpoint: `GET /packages/:name/:version/tarball` | 14 | P0 | 2.3 |
| 2.5 | ✅ `specpm install` from registry (HTTP download + integrity check) | 03 | P0 | 2.4, 1.8 |
| 2.6 | ✅ `specpm publish` command | 09 | P0 | 2.2 |
| 2.7 | ✅ Authentication: `specpm login`, token storage, auth middleware | 09, 14 | P0 | 2.1 |
| 2.8 | ✅ Search endpoint: `GET /search` with full-text index | 15 | P1 | 2.1 |
| 2.9 | ✅ `specpm search` command | 02 | P1 | 2.8 |
| 2.10 | Package metadata endpoint and caching (ETags) | 14 | P1 | 2.1 |
| 2.11 | Rate limiting middleware | 14 | P1 | 2.1 |
| 2.12 | ✅ `specpm version` command (bump + changelog) | 10 | P1 | 1.2 |

---

## Phase 3: Verification & Check

_Goal: Specs are verified before publish. Generated code is validated against specs._

| # | Task | Spec | Priority | Depends On |
|---|------|------|----------|------------|
| 3.1 | ✅ L0 verification: YAML parse, schema validate, file existence | 08 | P0 | 1.2 |
| 3.2 | ✅ L1 verification: cross-reference checks, constraint consistency | 08 | P1 | 3.1 |
| 3.3 | L2 verification: dependency resolution check | 08 | P1 | 3.2, 2.5 |
| 3.4 | ✅ `specpm verify` command | 08 | P0 | 3.1 |
| 3.5 | Require L2 before publish (gate in publish flow) | 08, 09 | P1 | 3.3, 2.6 |
| 3.6 | ✅ AST parser setup: ts-morph for TypeScript/JavaScript | 05 | P1 | — |
| 3.7 | ✅ Entity checker: validate interfaces match JSON Schema | 05 | P1 | 3.6 |
| 3.8 | ✅ Pattern checker: AST pattern matching for constraints | 05 | P1 | 3.6 |
| 3.9 | Structural checker: export/file existence | 05 | P1 | 3.6 |
| 3.10 | ✅ `specpm check` command with report output | 05 | P1 | 3.7, 3.8, 3.9 |
| 3.11 | `--json` and `--fix` flags for check | 05 | P1 | 3.10 |
| 3.12 | Quality scoring engine | 16 | P2 | 3.3 |
| 3.13 | L3 verification: LLM-based semantic review | 08 | P2 | 3.3 |

---

## Phase 4: Enterprise & Teams

_Goal: Teams enforce standards. CI integration. Private registries._

| # | Task | Spec | Priority | Depends On |
|---|------|------|----------|------------|
| 4.1 | `specpm-team.yaml` schema and loader | 12 | P1 | 1.4 |
| 4.2 | `specpm team check` command | 12 | P1 | 4.1 |
| 4.3 | `specpm team sync` command | 12 | P1 | 4.1, 2.5 |
| 4.4 | `specpm ci` command (non-interactive pipeline) | 13 | P1 | 3.10 |
| 4.5 | JUnit reporter for CI output | 13 | P1 | 4.4 |
| 4.6 | GitHub Actions reporter (annotations) | 13 | P1 | 4.4 |
| 4.7 | Private registry: scoped registry config | 11 | P2 | 2.1 |
| 4.8 | Private registry: auth token from env vars | 11 | P2 | 4.7 |
| 4.9 | `specpm registry add/list/remove` commands | 11 | P2 | 4.7 |

---

## Phase 5: ESLint Plugin (The Killer Feature)

_Goal: Spec violations surface as lint errors in existing ESLint pipelines. Zero new CI steps._

| # | Task | Spec | Priority | Depends On |
|---|------|------|----------|------------|
| 5.1 | Plugin scaffold: eslint-plugin-specpm package, flat config + legacy support | 17 | P0 | 3.6 |
| 5.2 | Spec discovery: find specpm.yaml, load installed specs, cache for lint run | 17 | P0 | 5.1, 1.5 |
| 5.3 | `specpm/entity-match` rule: validate TS interfaces against entity schemas | 17 | P0 | 5.2, 3.6 |
| 5.4 | `specpm/constraint-pattern` rule: check required function call patterns | 17 | P0 | 5.2, 3.8 |
| 5.5 | `specpm/endpoint-shape` rule: validate route handler response shapes | 17 | P1 | 5.2, 3.6 |
| 5.6 | `specpm/state-coverage` rule: warn on unhandled state machine states | 17 | P1 | 5.2 |
| 5.7 | Framework auto-detection (Next.js, Express, Fastify) for endpoint rules | 17 | P1 | 5.5 |
| 5.8 | Recommended and strict config presets | 17 | P0 | 5.3, 5.4 |
| 5.9 | Auto-fix support for entity-match (stub missing fields) | 17 | P2 | 5.3 |
| 5.10 | Performance optimization: lazy ts-morph loading, file pattern filtering | 17 | P1 | 5.3 |

---

## Milestone Summary

| Milestone | Tasks | Target |
|-----------|-------|--------|
| **MVP Demo** | 1.1–1.12, 2.1–2.7, 3.1, 3.4 | Week 4 |
| **v1.0** | All P1 tasks | Week 10 |
| **ESLint Plugin** | 5.1–5.8 (P0+P1) | Week 12 |
| **v2.0** | All P2 tasks | Future |
