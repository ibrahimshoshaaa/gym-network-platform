# Gym, branch and staff management

This increment follows the trainee password-authentication work. PR #3 was
merged into develop before this feature branch was created. It implements
backend workflows plus Arabic dashboard management screens; Flutter UI remains planned.
See [WEB_DASHBOARD.md](WEB_DASHBOARD.md) for operator setup and UI validation.

## Onboarding and access

1. A platform administrator calls `POST /admin/gyms` with name and owner contact
   (`displayName`, `phone`, `email`). The new gym is PENDING. A new owner identity
   is inactive/passwordless; an existing matching identity keeps its credentials
   and original global role label.
2. The response returns a one-time invitation token to the authenticated creator.
   Only its SHA-256 hash is stored. It expires after 48 hours. No SMS/email is
   sent, no provider is provisioned and no fixed password is created. The future
   dashboard must disclose this token only to its creator for secure manual
   delivery, and never put it in logs, public URLs or analytics.
3. The invitee calls `POST /auth/invitations/accept` with token and password. For
   a new identity this sets their chosen password; for an existing credential it
   must confirm the existing password and never resets it. Owner consent is
   recorded as `Gym.ownerAcceptedAt`; ownership access is denied until consent.
   Acceptance creates a bearer session but does not verify phone/email ownership.
4. The administrator approves/rejects the gym. ACTIVE requires an active owner
   who accepted. ACTIVE can be SUSPENDED, then reactivated. REJECTED has no
   implicit reopen transition. An accepted, active existing GYM_OWNER identity
   can be explicitly reused by the administrator via `ownerId` instead of contact.
5. The owner completes gym/branch metadata and invites staff. Branch invitations
   grant only CASHIER or BRANCH_MANAGER in the chosen branch after acceptance.
   Only the gym owner creates staff invitations; manager delegation remains open.

`POST /auth/staff/login` accepts phone/email and password after checking a live
accepted ownership or active staff assignment. Pending gym owners can log in to
complete onboarding. Ordinary trainees without staff/owner access cannot use this
route. PLATFORM_ADMIN password sign-in is deliberately excluded: initial admin
identity/session provisioning is a trusted operations step, and the admin
sign-in/MFA deployment flow still needs implementation before a real deployment.

The existing `/auth/password/change` also supports active non-admin staff and
owners; it requires the current password and revokes all previous sessions.
Public signup still always creates a trainee and cannot grant privileged roles.
No public admin-signup or password-reset shortcut is introduced.

Staff/owner passwords extend the existing identity system; they do not mark the
open admin MFA decision as settled. Stronger administrative authentication is
still required before production.

## Branch lifecycle and pricing

An owner creates a branch with name, governorate, city, address, paired coordinates,
optional contact/opening-hours text, proposed visit price and session minutes.
The branch and its independent zero-balance, non-expiring inventory are created
atomically with an initial pending pricing request. Its status remains PENDING.
The stored initial price is a proposal, not an operational approved tariff.

The administrator first activates the gym, then reviews the initial price and
explicitly activates the branch after checking complete metadata. Branch activation
requires approved pricing/version, active gym, accepted active owner, location and
address fields. Suspension preserves historical data and point inventory.

For an active branch, `POST .../price-change-requests` records a proposal and a
snapshot of current price/session/version. It does not alter the approved price.
Only one pending request per branch is allowed. Platform approval uses a branch
row lock and a pricing version check; duplicate/concurrent approvals apply once
and return the original review. Rejection keeps the old price; stale proposals
may be rejected but cannot be approved. Each accepted proposal increments the
version and records reviewer, time and reason. Database triggers prevent editing
proposal contents and changing/deleting reviewed history.

The API cannot update price, status, gym ownership or approval fields through
owner metadata patches. Visit/session endpoints now implement this requirement; see
[CASHIER_VISITS.md](CASHIER_VISITS.md). The original rule is that services must snapshot terms
added they must snapshot the approved terms at visit start and preserve old visits
when a tariff changes. Opening-hours text is display data and is not an approved
outside-hours entry restriction.

## Endpoint catalog

| Endpoint | Access |
| --- | --- |
| `POST /admin/gyms`, `GET /admin/gyms` | Platform admin |
| `PATCH /admin/gyms/:gymId/status` | Platform admin; status and reason |
| `POST /admin/gyms/:gymId/owner-invitations` | Admin; replace unaccepted invitation |
| `PATCH /admin/branches/:branchId/status` | Platform admin; status and reason |
| `GET /admin/price-change-requests` | Admin; pending queue |
| `POST /admin/price-change-requests/:requestId/review` | Admin; decision and reason |
| `GET /gyms`, `PATCH /gyms/:gymId` | Accepted owner; profile patches only |
| `GET/POST /gyms/:gymId/branches` | Accepted owner |
| `PATCH /gyms/:gymId/branches/:branchId` | Owner of that exact gym/branch |
| `POST /gyms/:gymId/branches/:branchId/price-change-requests` | Owner |
| `GET /gyms/:gymId/branches/:branchId/pricing-history` | Owner |
| `POST /gyms/:gymId/staff-invitations` | Owner; contact, branchId, scoped role |
| `GET /gyms/:gymId/staff`, `PATCH .../staff/:assignmentId` | Owner; active toggle only |
| `GET /gyms/:gymId/invitations` | Owner; no tokens/hashes |
| `POST /invitations/:invitationId/revoke` | Admin or staff-invitation's gym owner |
| `POST /auth/invitations/accept` | Possession of valid token and password proof |
| `POST /auth/staff/login` | Accepted owner / active assigned staff |
| `GET /me/access` | Own memberships, capped at 100 per category |
| `GET /branches/:branchId/manage` | Admin, accepted owner, or active branch staff |
| `GET /branches` | Public active/approved directory; no private user data |

Collection endpoints use `limit` (default 25, maximum 100) and UUID `cursor`, and
return `items` and `nextCursor`. The public directory requires active gym/branch,
accepted active owner, approved pricing and coordinates, and omits staff/ownership
details. A map frontend, images/uploads, hours validation and advanced geographic
filters are future work. Private endpoints and invitation responses are no-store.

## Revocation and identity boundaries

An owner can toggle only assignments in their gym; this never disables another
tenant's membership or the global identity. Disabling a branch assignment blocks
branch access immediately, including existing sessions, by live authorization
checks. Personal `/me` can remain accessible; sessions are not globally revoked
by a single gym. A user's global disable blocks all sessions. Gym/branch suspension
blocks operational access and hides that branch from the public directory while
owner history remains readable. Inventory operations now also check parent gym
status and active accepted ownership.

The original `User.role` remains a label, while ownership and assignments are
authoritative. An existing trainee may explicitly accept a staff/owner invitation
without losing their trainee account/password. `/me/access` identifies the actual
membership contexts; this preserves identity rather than creating conflicting
duplicate accounts. No shared-gym partnership model or delegated manager
recruitment policy is introduced.

Login throttles share the same IP/normalized-identity counters as trainee login,
so changing login routes does not evade limits. Invitation acceptance is limited
to 20/IP and 10/token per 15 minutes. Password bodies and invitation tokens are
redacted and KDF work remains bounded. Expired/revoked/consumed tokens fail, and
reissuing an invitation revokes the previous pending token in the same scope.

## Migration, tests and rollback

Migration `202610170004_gym_management` adds gym state/consent/profile fields,
branch metadata/pricing stamps, invitation and pricing-request tables, scoped
FKs, one-pending indexes and immutable-history triggers. Existing gyms start
PENDING with no acceptance timestamp; do not silently auto-approve imported gyms.
Existing branch pricing stamps remain empty until reviewed. The previous ledger
test fixtures explicitly represent approved gyms, rather than relying on defaults.

Tests use synthetic data and restricted PostgreSQL credentials, covering the full
onboarding flow, tenant isolation, staff consent/disable, invitation lifecycle and
concurrency, approved pricing history and concurrent reviews, suspension,
pagination, private data and prior ledger/auth regressions. Standard commands are
in [LEDGER_FOUNDATION.md](LEDGER_FOUNDATION.md).

No financial balances are changed, no monetary accounts are provisioned, and the
gym-vs-branch financial scope was open in the foundation increment; O01 is now resolved
as one wallet per gym (see CASHIER_VISITS.md). No receipt review, point sale, visit,
withdrawal, interactive map UI, Flutter app or production deployment is added.
The subsequent management dashboard adds the existing onboarding and staff workflows to Next.js.

For rollback, revert the application commit while retaining the additive schema.
Do not delete pricing/invitation/audit history or rewrite deployed migrations.
Before deploying over a persistent development database, review the pending gym
and unapproved branch states and plan explicit onboarding of existing records.


## Management dashboard read increment

The dashboard now includes paginated admin/owner gym lists, admin status changes,
owner profile/branch edits, independent stock balances, admin branch activation,
visit-price requests and history, staff assignments and invitations. No existing
ledger migration or visit settlement rule changes.

New private reads are `GET /admin/gyms/:gymId`,
`GET /admin/gyms/:gymId/branches`, `GET /admin/gyms/:gymId/invitations`
(owner invitations only), and `GET /gyms/:gymId` (accepted owner only).
Admin routes require active PLATFORM_ADMIN; owner routes recheck actual ownership.
Private branch list responses include only the branch inventory balance rather
than raw ledger accounts. Staff/invitation lists include scoped display names,
contacts and branch names, with no token/hash fields. Optional gym/branch contact
phones can be cleared with `null` in an owner metadata PATCH; create validation
and immutable pricing review remain unchanged.

Invitation tokens appear only in the create/reissue response, stay in component
memory, and are manually copied. They never appear in list responses, URLs or
browser persistence. Issuing a new token invalidates prior unused invitations
in the same scope. No email/SMS/other person-directed message is sent by the UI.
