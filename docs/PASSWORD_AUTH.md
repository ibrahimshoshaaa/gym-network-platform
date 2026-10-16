# Trainee password authentication

Implements the [17 October 2026 approved decision](DECISIONS.md) using the existing
Fastify/Prisma identity and hashed bearer sessions. This is backend functionality;
Flutter and Next.js applications are still planned and do not yet have login UI.

## Endpoints

| Method / route | Input | Success |
| --- | --- | --- |
| POST `/auth/register` | `displayName`, `phone`, `email`, `password` | 201: user, accessToken, tokenType, expiresAt |
| POST `/auth/login` | `identifier` (phone or email), `password` | 200: same session envelope |
| GET `/me` | `Authorization: Bearer <token>` | 200: current user's public identity |
| POST `/auth/password/change` | Bearer token; `currentPassword`, `newPassword` | 200: new session; all old sessions revoked |
| POST `/auth/logout` | Bearer token | 204: current session revoked |

`user` contains `id`, `displayName`, `role`, own `phone`, own `email`,
`emailVerified`, and `phoneVerified`. It never contains credential/session hashes.
All auth responses and `/me` have `Cache-Control: no-store`. Tokens are returned
in JSON for a future Flutter client; no cookie-based auth is enabled. Clients must
use HTTPS and secure platform storage. Web cookie/BFF integration is a later task.

Email is trimmed/lowercased. Egyptian local mobile numbers, `+20`/`0020` formats,
and Arabic digits normalize to the same E.164 number. Other international numbers
must use `+` E.164 syntax. Validation checks number format, not ownership.
Passwords preserve exact spaces and Unicode, with 15–128 code points. Register,
login and change-password bodies reject unknown fields and are limited to 8 KiB.

## Storage and consistency

- `User.email` is nullable/unique for legacy compatibility, and normalized at the
  database boundary. Existing users are not assigned passwords or verified flags.
- `UserPassword` is separate from public user data. Node's asynchronous native
  scrypt uses N=32768, r=8, p=3 with a random 16-byte salt, a 64-byte hash and a
  versioned encoding. This is one of the OWASP recommended scrypt parameter sets.
  Parameters are bounded in code, and comparison uses `timingSafeEqual`.
- No new auth service/vendor is provisioned. Native scrypt extends the existing
  working bearer-session implementation without migrating existing identities.
- A public registration creates the TRAINEE, password hash, one empty wallet,
  hashed session and audit event in one database transaction. Uniqueness races
  return `ACCOUNT_UNAVAILABLE` and roll back everything from the losing request.
  Existing passwordless identities cannot be claimed by supplying their contact.
- Login checks the password outside the transaction, then locks the user row and
  rechecks account status and credential hash before issuing a session. Password
  changes take the same lock, recheck the requesting session, change the hash,
  revoke every previous session, issue one new session and append audit atomically.
- Sessions last seven days; expiry, logout and disabled users are checked against
  the database on each request. There is no refresh-token mechanism in this scope.

## Abuse controls

`AuthThrottle` stores hash keys rather than raw IP/contact values. An atomic
PostgreSQL UPSERT shares fixed-window counters across workers and restarts.
Attempt counters are outside auth transactions, so failures consume allowance.

| Scope | Allowance |
| --- | --- |
| Registration per IP | 5 / hour |
| Login per IP | 30 / 15 minutes |
| Login per normalized identifier | 10 / 15 minutes |
| Password change per IP | 10 / 15 minutes |
| Password change per authenticated user | 5 / 15 minutes |

Successful attempts count too. `429 RATE_LIMITED` includes `Retry-After`.
Up to four KDF operations run concurrently per process; extra requests receive
`503 AUTH_BUSY` and `Retry-After: 1`. Expired throttle rows are reused atomically;
deployment housekeeping should periodically delete expired rows to bound storage.

`trustProxy` remains false: spoofed X-Forwarded-For headers do not bypass limits.
Before putting the API behind a proxy, configure only the actual trusted proxy
chain and test the resulting client IP. Do not turn on blanket proxy trust.

Unknown, wrong-password, inactive, passwordless and non-trainee identities all
receive `401 INVALID_CREDENTIALS`; ineligible users still perform a dummy KDF.
Public registration never selects which contact caused an availability conflict.
Request bodies, bearer headers and Prisma argument dumps are excluded from logs.
Audits contain action/reason/actor references, never a password or token.

## Deferred functionality

There are no OTP, verification or password-reset endpoints. Reset by an
unverified email/phone would permit account takeover; implement reset only after
a proof-of-possession channel or an approved recovery process exists. No profile
contact-changing endpoint, privileged signup, staff password authentication,
financial mutation endpoint or production deployment is added here.

The earlier ledger test document is a historical description of that increment;
this document and DECISIONS.md describe the newer password sign-in behavior.

## Validation and migration

Run the standard generate, validate, typecheck, build, `test`, `db:deploy`, and
`test:db` commands from [LEDGER_FOUNDATION.md](LEDGER_FOUNDATION.md). Existing
ledger tests continue to run. New tests cover normalization, role/verification
injection, password hashing, registration and login, duplicate/racing signup,
shared IP/identity rate limiting, reset of expired counters, password changes,
revocation and unavailable verification/reset routes.

`202610170003_trainee_password_auth` is additive. Previous application versions
can run with the extra nullable user fields/tables; roll back the application
commit if needed and retain data. Never remove credential tables or rewrite
deployed migrations as an automatic rollback.

References: [Node crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
