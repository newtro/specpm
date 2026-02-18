# Example Spec Packages

This directory contains example spec packages to demonstrate the SpecPM format and help you get started writing your own.

## `auth-email-password`

**Package:** `@auth/email-password`

A complete email/password authentication specification including:

- **Entities:** `User` (with email, passwordHash, failedLoginAttempts, lockedUntil) and `Session` schemas
- **Constraints:** Password hashing requirements (bcrypt, min cost 10), rate limiting on login attempts, session expiration rules
- **Docs:** Implementation overview and security notes

Great starting point for any app that needs auth.

```bash
specpm install ./examples/auth-email-password
```

## `data-pagination`

**Package:** `@data/pagination`

Cursor-based pagination specification for APIs:

- **Entities:** `Page` response schema (items, cursor, hasMore)
- **Constraints:** Cursor opacity, max page size limits, consistent ordering requirements
- **Docs:** Implementation overview for cursor-based pagination

```bash
specpm install ./examples/data-pagination
```

## Writing Your Own

A spec package is a directory with a `spec.yaml` manifest:

```yaml
name: "@scope/my-spec"
version: "1.0.0"
description: "What this spec defines"
tags: ["category"]

entities:
  - entities/thing.schema.json

constraints: constraints/constraints.yaml

docs:
  - docs/overview.md

context:
  priority: ["constraints", "entities", "docs"]
  tokenBudget: 5000
```

See the [main README](../README.md) for full spec format documentation.
