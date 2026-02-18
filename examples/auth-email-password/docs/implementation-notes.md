# Implementation Notes

## Registration Flow
1. Validate email format and uniqueness
2. Hash password with bcrypt (cost 12+)
3. Create User record with emailVerified=false
4. Send verification email
5. Return session token

## Login Flow
1. Find user by email
2. Check if account is locked (lockedUntil > now)
3. Compare password with bcrypt
4. On failure: increment failedLoginAttempts, lock if >= 5
5. On success: reset failedLoginAttempts, create Session
6. Return session token

## Session Management
- Tokens should be cryptographically random (min 32 bytes)
- Store session server-side, return opaque token to client
- Validate session on each authenticated request
- Delete session on logout
