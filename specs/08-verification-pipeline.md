# Spec: Spec Verification Pipeline (`specpm verify`)

**Purpose:** Validate a spec package through four progressive verification levels to ensure correctness before publishing or installation.

## Data Model

### Verification Levels
| Level | Name | Description |
|-------|------|-------------|
| L0 | Well-formed | All files parse, schema valid, required fields present |
| L1 | Internally consistent | Cross-references resolve, no contradictions within package |
| L2 | Compositionally sound | Works with declared dependencies, no conflicts |
| L3 | Semantically reviewed | Human or LLM review of intent clarity and completeness |

### VerificationResult
```typescript
{
  level: 0 | 1 | 2 | 3
  passed: boolean
  issues: VerificationIssue[]
  timestamp: string
  specpmVersion: string
  signature?: string          // Signed result for L2+
}
```

### VerificationIssue
```typescript
{
  level: number
  severity: "error" | "warning" | "info"
  code: string               // e.g. "L0-YAML-PARSE", "L1-REF-MISSING"
  message: string
  file?: string
  path?: string              // JSON path within file
  suggestion?: string
}
```

## Command

```
specpm verify [<path>] [--level <0-3>] [--json] [--fix]
```

| Flag | Description |
|------|-------------|
| `<path>` | Package directory, default "." |
| `--level` | Max verification level to run, default 2 |
| `--json` | Output as JSON |
| `--fix` | Auto-fix L0 issues where possible |

## Behavior

### L0: Well-formed
1. `spec.yaml` exists and parses as valid YAML
2. Required fields present: name, version, description
3. Name matches `@scope/name` pattern
4. Version is valid SemVer
5. All referenced files exist
6. Entity schemas validate against JSON Schema meta-schema
7. State machines parse as valid JSON
8. Constraints YAML parses with required fields (id, description, type, severity)

### L1: Internally Consistent
1. Constraint `entity` references match declared entity schema names
2. Constraint `target` patterns reference valid state machine states or entity names
3. No duplicate constraint IDs
4. State machine transitions reference only declared states
5. Entity `$ref` references resolve within the package
6. `context.priority` only lists valid section types

### L2: Compositionally Sound
1. All `dependencies` are resolvable from registry
2. `peerDependencies` constraints are satisfiable
3. No entity name collisions with dependencies
4. No constraint ID collisions with dependencies
5. Cross-package `$ref` in entities resolve

### L3: Semantically Reviewed
1. Run LLM-based review (or flag for human review)
2. Check: are constraints unambiguous?
3. Check: do entity schemas cover the domain adequately?
4. Check: are state machines complete (no dead-end states)?
5. Produce quality score

## Constraints

- Each level must pass before the next runs (L0 → L1 → L2 → L3)
- L0-L1 must run locally without network
- L2 requires registry access (to check dependencies)
- L3 is optional and may require API key for LLM review
- `--fix` only applies to L0 (formatting, missing optional fields with defaults)
- Verification must complete L0-L1 in < 5 seconds for typical packages

## Edge Cases

- Package with no entities → skip entity-related L1 checks
- Dependency not in registry → L2 fails with "dependency not found"
- Circular dependency chain → L2 detects and reports
- L3 LLM service unavailable → skip L3, report as "not verified"
- Very large state machine (100+ states) → performance consideration, still must complete

## Acceptance Criteria

- [ ] `specpm verify` runs L0-L2 by default
- [ ] L0 catches missing required fields, invalid YAML, missing files
- [ ] L1 catches dangling entity references in constraints
- [ ] L2 catches unresolvable dependencies
- [ ] `--fix` repairs common L0 issues (e.g., adds missing optional fields)
- [ ] `--json` outputs structured verification report
- [ ] Each level only runs if previous passed
- [ ] Clear error codes for every issue type
