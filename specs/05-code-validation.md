# Spec: Code Validation Against Specs (`specpm check`)

**Purpose:** Validate that generated source code satisfies the constraints and structural requirements defined in installed spec packages.

## Data Model

### Check Configuration (in `specpm.yaml`)
```yaml
check:
  include: ["src/**/*.ts"]        # Files to check
  exclude: ["src/**/*.test.ts"]   # Files to skip
  strict: false                    # Fail on warnings
  rules:
    "@auth/oauth2":
      skip: ["constraint-5"]      # Skip specific constraints
```

### CheckResult
```typescript
{
  package: string          // "@auth/oauth2"
  constraint: string       // Constraint ID
  description: string      // What was checked
  status: "pass" | "fail" | "warn" | "skip"
  file?: string            // Source file path
  line?: number            // Line number
  message: string          // Human-readable explanation
  suggestion?: string      // How to fix
}
```

### CheckReport
```typescript
{
  timestamp: string
  summary: { pass: number, fail: number, warn: number, skip: number }
  results: CheckResult[]
  specs: string[]          // Which specs were checked against
}
```

## Command

```
specpm check [--spec <package>] [--fix] [--json] [--strict]
```

| Flag | Description |
|------|-------------|
| `--spec` | Check against specific spec only |
| `--fix` | Auto-fix where possible (add missing imports, etc.) |
| `--json` | Output as JSON |
| `--strict` | Treat warnings as errors |

## Behavior

1. Load installed specs and their constraints
2. Discover source files matching `check.include` glob patterns
3. Parse source files into AST (TypeScript AST via ts-morph)
4. For each spec constraint, run the corresponding checker:
   - **Entity constraints**: Verify interfaces/types match JSON Schema (required fields, types)
   - **State machine constraints**: Verify state transitions are handled (switch/if patterns)
   - **Pattern constraints**: AST pattern matching (e.g., "must call validateToken before accessing user")
   - **Structural constraints**: File/export existence checks
5. Collect all results
6. Print formatted report (grouped by spec, colored pass/fail)
7. Exit code 0 if all pass, 1 if any fail

## Constraint Types and AST Checks

### Entity Check
Spec defines: `User { id: string, email: string, role: enum[admin,user] }`
Check: Find TypeScript interface/type `User`, verify fields match.

### State Machine Check
Spec defines states: `idle → loading → success | error`
Check: Find state management code, verify all transitions handled.

### Pattern Check
Spec defines: `"HTTP requests must include error handling"`
Check: AST-match `fetch`/`axios` calls, verify they're in try/catch or .catch().

### Structural Check
Spec defines: `"Must export authenticate function from auth module"`
Check: Find file, verify named export exists with expected signature.

## Constraints

- Must not modify source files unless `--fix` is specified
- AST parsing failures on a file → skip file with warning, don't crash
- Check must complete in < 30 seconds for typical projects (< 1000 files)
- Results must be deterministic (same code + same specs → same results)
- Must support TypeScript and JavaScript source files
- `--fix` must only make safe, non-destructive changes

## Edge Cases

- No source files match include patterns → warn, exit 0
- Spec has no checkable constraints → skip with info message
- Source file has syntax errors → skip file, report as warning
- Constraint references entity not found in code → fail with "entity not implemented"
- Mixed JS/TS project → handle both

## Acceptance Criteria

- [ ] `specpm check` runs all constraint checks against source files
- [ ] Entity constraints detect missing/wrong fields
- [ ] Pattern constraints detect missing error handling
- [ ] JSON output is valid and contains all results
- [ ] Exit code 1 when any constraint fails
- [ ] Syntax-error files are skipped gracefully
- [ ] `--spec` flag limits checking to one package
- [ ] Report shows file path and line number for failures
