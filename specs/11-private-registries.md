# Spec: Private Registries

**Purpose:** Allow organizations to host internal spec packages on private registry instances that restrict access to authorized users.

## Data Model

### Registry Configuration (in `specpm.yaml` or `~/.specpm/config.yaml`)
```yaml
registries:
  "@company": "https://specs.company.internal"
  "@team": "https://specs.company.internal"
  default: "https://registry.specpm.dev"

auth:
  "https://specs.company.internal":
    token: "${SPECPM_COMPANY_TOKEN}"
```

### Scoped Resolution
- `@company/auth` → resolves from `https://specs.company.internal`
- `@auth/oauth2` → resolves from default registry
- Scope-to-registry mapping is explicit

## Command

```
specpm registry add <scope> <url>
specpm registry list
specpm registry remove <scope>
specpm login [--registry <url>]
```

## Behavior

1. Scoped packages resolve to their configured registry
2. Authentication tokens stored in `~/.specpm/auth.json`
3. Token can come from environment variable (${VAR} syntax)
4. All existing commands (install, search, publish) route to correct registry based on scope
5. `specpm login` authenticates via token or browser-based OAuth flow

## Constraints

- Private registry must implement the same API as public registry
- Tokens must never be stored in project-level files (only user-level `~/.specpm/`)
- HTTPS required for all private registries
- Environment variable substitution for tokens in CI environments

## Edge Cases

- Registry unreachable → timeout with which registry failed
- Scope configured but registry doesn't have the package → clear error
- Multiple registries for same scope → error, must be unique
- Token expired → 401 with "run specpm login" message

## Acceptance Criteria

- [ ] Scoped packages resolve to configured private registry
- [ ] `specpm login` stores credentials in `~/.specpm/auth.json`
- [ ] Environment variable tokens work for CI
- [ ] HTTPS enforced for private registries
- [ ] Token never written to `specpm.yaml` or lockfile
