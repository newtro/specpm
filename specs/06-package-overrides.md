# Spec: Package Overrides and Customization

**Purpose:** Allow developers to customize installed spec packages by overriding specific fields, excluding sections, or extending entities without modifying the original package.

## Data Model

### Override Configuration (in `specpm.yaml`)
```yaml
overrides:
  "@auth/oauth2":
    entities:
      User:
        extend:
          tenantId: { type: "string", required: true }
        remove: ["legacyField"]
        rename: { email: "emailAddress" }
    constraints:
      skip: ["constraint-id-3"]
    context:
      prepend: "All auth uses our internal SSO provider."
      exclude-sections: ["External Provider Setup"]
  "@data/pagination":
    replace: "./local-specs/custom-pagination/"
```

### Resolved Spec (internal)
After applying overrides, a spec is a merged view: original + overrides. The original package files are never modified.

## Command

No dedicated command. Overrides are declared in `specpm.yaml` and applied during:
- `specpm context` (affects generated context)
- `specpm check` (affects which constraints run)

```
specpm overrides [--validate] [--show <package>]
```

| Flag | Description |
|------|-------------|
| `--validate` | Check that overrides reference valid fields/constraints |
| `--show` | Display resolved spec after overrides |

## Behavior

1. On `specpm context` or `specpm check`, load overrides from `specpm.yaml`
2. For each overridden package:
   - `extend`: Add fields to entity schemas (merged via JSON Schema allOf)
   - `remove`: Remove fields from entity schemas
   - `rename`: Rename fields (old name → new name mapping)
   - `skip` constraints: Exclude from check runs
   - `prepend`/`append` context: Add custom text to generated context
   - `exclude-sections`: Remove named sections from context output
   - `replace`: Use local directory instead of installed package entirely
3. Validate override targets exist in the original spec (warn if not)
4. Apply overrides in deterministic order: remove → rename → extend

## Constraints

- Must never modify files in `.specpm/specs/` (overrides are applied in memory)
- Invalid override targets (nonexistent field/constraint) → warning, not error
- `replace` path must contain valid spec structure (same as installed package)
- Overrides must be composable: multiple overrides on same package merge cleanly
- Override validation must catch typos in field/constraint names

## Edge Cases

- Override references field that was removed in newer package version → warn on install
- `replace` path doesn't exist → error on context/check
- Conflicting overrides: extend adds field that remove tries to delete → extend wins (add after remove)
- Override on uninstalled package → ignore with warning

## Acceptance Criteria

- [ ] Entity field extension appears in generated context
- [ ] Skipped constraints don't run during `specpm check`
- [ ] `replace` fully substitutes local specs for package
- [ ] `--validate` catches references to nonexistent fields
- [ ] `--show` displays final merged spec
- [ ] Original package files are never modified
