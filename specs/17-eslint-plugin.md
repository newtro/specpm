# Spec: ESLint Plugin (`eslint-plugin-specpm`)

**Purpose:** Surface spec constraint violations as ESLint errors so teams can enforce spec compliance through their existing lint pipeline without adding a separate tool or CI step.

## Data Model

### Plugin Structure
```
packages/eslint-plugin/
  src/
    index.ts              # Plugin entry: exports rules and configs
    rules/
      entity-match.ts     # Interfaces must match entity schemas
      constraint-pattern.ts  # Required patterns from constraints
      endpoint-shape.ts   # API route shapes match spec contracts
      state-coverage.ts   # State machine transitions covered
    lib/
      spec-loader.ts      # Loads installed specs from .specpm/
      schema-compare.ts   # Compares TS interfaces to JSON Schema
  configs/
    recommended.ts        # Default rule config (all errors)
    strict.ts             # All rules as errors, no warnings
```

### ESLint Config Integration
```javascript
// eslint.config.js (flat config)
import specpm from 'eslint-plugin-specpm'

export default [
  specpm.configs.recommended,
  // or individual rules:
  {
    plugins: { specpm },
    rules: {
      'specpm/entity-match': 'error',
      'specpm/constraint-pattern': 'error',
      'specpm/endpoint-shape': 'warn',
      'specpm/state-coverage': 'warn',
    }
  }
]
```

## Rules

### `specpm/entity-match`
Validates that TypeScript interfaces/types that correspond to spec entities match the JSON Schema definition.

- Scans for interfaces/types whose names match entity names from installed specs
- Compares required fields, field types, enum values
- Reports missing fields, type mismatches, extra required fields not in schema

Example violation:
```
error  Interface 'User' is missing required field 'role' defined in @auth/oauth2 entity schema  specpm/entity-match
```

### `specpm/constraint-pattern`
Checks that code patterns required by spec constraints are present.

- Reads constraint check definitions (type: "pattern") from installed specs
- Validates required function calls, middleware usage, error handling patterns
- Reports missing patterns with constraint ID and description

Example violation:
```
error  Route handler at line 47 missing required 'validateToken' call before processing (constraint auth-001)  specpm/constraint-pattern
```

### `specpm/endpoint-shape`
Validates API route handlers match spec API contracts.

- Detects route definitions (Express, Next.js App Router, Fastify)
- Checks response shapes match spec (status codes, body structure)
- Checks request validation matches spec input schemas

Example violation:
```
error  POST /api/auth/login returns { message: string } but spec requires { error: { code, message, request_id } } for 4xx responses  specpm/endpoint-shape
```

### `specpm/state-coverage`
Checks that state machine transitions defined in specs are handled in code.

- Finds switch/case or if/else blocks that handle state values
- Compares handled states against spec state machine definition
- Reports unhandled states or transitions

Example violation:
```
warn  State 'refreshing' from authFlow state machine is not handled in src/auth/handler.ts  specpm/state-coverage
```

## Behavior

### Spec Discovery
1. Plugin looks for `specpm.yaml` in project root (walks up from linted file)
2. Loads installed specs from `.specpm/specs/`
3. Caches loaded specs for the lint run (no re-reading per file)
4. If no specpm.yaml found, all rules silently pass (no-op in non-specpm projects)

### Framework Detection
- Auto-detects framework from package.json (next, express, fastify, etc.)
- Adjusts route/endpoint detection patterns per framework
- Extensible: users can configure framework in eslint config

### Performance
- Spec loading happens once per lint run, cached in memory
- AST traversal is per-file (standard ESLint model)
- Heavy rules (endpoint-shape, state-coverage) only run on files matching configurable patterns (default: `**/api/**`, `**/routes/**`)

## Constraints

- Must work with ESLint flat config (ESLint 9+)
- Must also support legacy .eslintrc config
- Must not crash or error if .specpm/ directory is missing (graceful no-op)
- Must support --fix for auto-fixable violations (entity-match can add missing fields as stubs)
- Rules must be individually configurable (error/warn/off)
- Must lazy-load ts-morph only when TypeScript rules are enabled (keep startup fast)
- Plugin must work without a running registry (reads local .specpm/ only)

## Edge Cases

- Project with specs installed but no source code yet (no violations, clean pass)
- Spec entity name doesn't match any interface (no violation, rule only checks matching names)
- Multiple specs define entities with the same name (report which spec each rule references)
- JavaScript files (no interfaces) with constraint-pattern rules (still check function call patterns)
- Monorepo with multiple specpm.yaml files (each package linted against its own specs)

## Acceptance Criteria

- [ ] `eslint-plugin-specpm` installs as standard ESLint plugin
- [ ] `specpm/entity-match` catches missing and mistyped entity fields
- [ ] `specpm/constraint-pattern` catches missing required patterns
- [ ] `specpm/endpoint-shape` catches wrong response shapes on route handlers
- [ ] `specpm/state-coverage` warns on unhandled state machine states
- [ ] Recommended config enables all rules at sensible defaults
- [ ] Plugin is no-op in projects without specpm.yaml (safe to include globally)
- [ ] Works with ESLint flat config and legacy config
- [ ] Performance: adds less than 500ms to a 1000-file lint run
