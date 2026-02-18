# Spec: Spec Authoring and Structure (The Spec Format)

**Purpose:** Define the canonical structure of a spec package so that authors can create well-formed, machine-readable specifications that AI agents consume.

## Data Model

### Package Directory Structure
```
my-spec-package/
  spec.yaml              # Package manifest (required)
  entities/              # JSON Schema entity definitions
    user.schema.json
    session.schema.json
  states/                # XState-compatible state machines
    auth-flow.json
  constraints/           # Formal constraint definitions
    constraints.yaml
  docs/                  # Markdown semantic specifications
    overview.md
    implementation-notes.md
  examples/              # Example implementations (optional)
    typescript/
    python/
```

### spec.yaml (Package Manifest)
```yaml
name: "@auth/oauth2"
version: "2.1.0"
description: "OAuth 2.0 authentication flow specification"
author: "specpm-community"
license: "MIT"
tags: ["auth", "oauth", "security"]
specpm: ">=0.5.0"              # Minimum specpm version

entities:
  - entities/user.schema.json
  - entities/session.schema.json

states:
  - states/auth-flow.json

constraints: constraints/constraints.yaml

docs:
  - docs/overview.md
  - docs/implementation-notes.md

dependencies:
  "@core/http-client": "^1.0.0"

peerDependencies:
  "@data/user-store": "^2.0.0"

context:
  priority: ["constraints", "entities", "states", "docs"]
  tokenBudget: 8000            # Suggested max tokens for this spec's context
```

### Entity Schema (JSON Schema Draft 2020-12)
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "user",
  "title": "User",
  "type": "object",
  "required": ["id", "email", "role"],
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "email": { "type": "string", "format": "email" },
    "role": { "type": "string", "enum": ["admin", "user", "guest"] }
  }
}
```

### State Machine (XState-compatible JSON)
```json
{
  "id": "authFlow",
  "initial": "idle",
  "states": {
    "idle": { "on": { "LOGIN": "authenticating" } },
    "authenticating": {
      "on": {
        "SUCCESS": "authenticated",
        "FAILURE": "error"
      }
    },
    "authenticated": { "on": { "LOGOUT": "idle" } },
    "error": { "on": { "RETRY": "authenticating" } }
  }
}
```

### Constraints (constraints.yaml)
```yaml
constraints:
  - id: "auth-001"
    description: "All API endpoints must validate authentication token before processing"
    type: "pattern"
    severity: "error"
    check:
      pattern: "function-call-before"
      target: "route-handler"
      required: "validateToken"

  - id: "auth-002"
    description: "OAuth tokens must have expiry handling"
    type: "entity"
    severity: "error"
    check:
      entity: "Session"
      requiredFields: ["expiresAt", "refreshToken"]

  - id: "auth-003"
    description: "Failed auth attempts must be logged"
    type: "pattern"
    severity: "warning"
    check:
      pattern: "catch-block-contains"
      target: "authenticate"
      required: "logger"
```

## Constraints

- `spec.yaml` is the only required file; all other directories are optional
- Entity schemas must be valid JSON Schema Draft 2020-12
- State machines must be valid XState v5 machine config JSON
- Constraint IDs must be unique within a package
- Package names must match pattern: `@<scope>/<name>` where scope and name are `[a-z0-9-]+`
- Version must be valid SemVer
- Total uncompressed package size must not exceed 1MB
- All file paths in spec.yaml must be relative and within the package directory (no `../`)

## Edge Cases

- Package with only constraints and no entities → valid (structural checks only)
- Package with only docs → valid (context-only spec, no checks)
- Entity schema references another entity ($ref) → must resolve within package or dependencies
- State machine with parallel states → must be valid XState
- Empty constraints array → valid (no checks, context only)

## Acceptance Criteria

- [ ] A minimal spec package (spec.yaml only) passes L0 verification
- [ ] Entity schemas validate against JSON Schema meta-schema
- [ ] State machines parse as valid XState configs
- [ ] Constraint IDs are validated for uniqueness
- [ ] Package name format is enforced
- [ ] File path traversal (`../`) is rejected
- [ ] All referenced files must exist in the package
