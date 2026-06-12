# Admin Auth

## Routes

- Admin login route: `/admin/login`
- Admin console route: `/admin`

## Authentication Model

Admin login reuses the existing user authentication system. A user signs in with the same auth flow used by the main app, then the frontend checks admin access by calling backend admin APIs.

Backend admin endpoints are the source of truth for authorization. The frontend route guard only improves the user experience by redirecting unauthenticated sessions to `/admin/login`; it is not the security boundary.

Authenticated non-admin users can still have a valid app session, but backend admin endpoints must return `403` when the account is not authorized for admin access. Expired or invalid sessions should return `401`.

Admin logout clears the current token/session and returns the user to `/admin/login`.

## Future Hardening

- 2FA/OTP for admin login
- IP allowlist for admin routes and APIs
- Shorter admin session TTL
- Admin login audit events
- Separate admin app or domain if needed later
