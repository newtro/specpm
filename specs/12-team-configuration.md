# Spec: Team Configuration and Enforcement

**Purpose:** Enable teams to define and enforce a standard set of spec packages and configurations across all team members' projects.

## Data Model

### Team Config (`specpm-team.yaml`, committed to repo)
```yaml
required:
  - "@company/api-standards@^2.0.0"
  - "@company/error-handling@^1.0.0"

recommended:
  - "@company/logging@^1.0.0"

overrides:
  "@auth/oauth2":
    entities:
      User:
        extend:
          tenantId: { type: "string", required: true }

context:
  targets: ["claude", "cursor"]
  enforced: true               # Members cannot change targets

check:
  strict: true                 # All projects must pass check
  required-level: 2            # Min verification level for custom specs
```

## Command

```
specpm team init                    # Create specpm-team.yaml
specpm team check                   # Verify project meets team requirements
specpm team sync                    # Install/update required packages
```

## Behavior

### `specpm team check`
1. Load `specpm-team.yaml`
2. Verify all `required` packages installed at compatible versions
3. Verify enforced settings match project `specpm.yaml`
4. Report missing/outdated packages
5. Exit code 0 if compliant, 1 if not

### `specpm team sync`
1. Install all `required` packages
2. Suggest `recommended` packages not yet installed
3. Apply team overrides

## Constraints

- `specpm-team.yaml` should be committed to version control
- Team requirements must not conflict (e.g., two required packages with incompatible deps)
- `enforced` settings cannot be overridden by individual `specpm.yaml`
- `specpm team check` must work in CI without interactive prompts

## Edge Cases

- No `specpm-team.yaml` in project → `specpm team check` exits 0 with info message
- Team config requires package not in any configured registry → clear error
- Version conflict between team required and project dependencies → report conflict

## Acceptance Criteria

- [ ] `specpm team sync` installs all required packages
- [ ] `specpm team check` detects missing required packages
- [ ] Enforced settings override individual project settings
- [ ] Works in CI (non-interactive)
- [ ] Version conflicts clearly reported
