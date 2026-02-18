# Email/Password Authentication

This spec defines a standard email and password authentication system.

## Features
- User registration with email and password
- Login with email and password
- Session management with token-based auth
- Account lockout after failed attempts
- Password reset flow

## Security Requirements
- Passwords are never stored in plaintext
- bcrypt with cost factor >= 12 for hashing
- Sessions expire after 24 hours maximum
- Account locks after 5 failed login attempts
