# Architecture / first sprint

## Runtime components
- Flutter trainee mobile application (planned).
- Next.js Arabic responsive dashboard: admin settings/reviews and gym owner stock requests implemented; other operational screens planned.
- Node.js + Fastify API with a PostgreSQL data store.
- Server-side authoritative mutations, never client-computed balances or client-trusted roles.
- Signed short-lived QR and one-time consumption with anti-replay store (future sprint).
- FCM notifications, mapping and SMS OTP adapters (future sprint).

## Database design
Update 17 October 2026: see [ledger foundation](LEDGER_FOUNDATION.md) for implemented
SQL integrity constraints, internal posting/stock services, sessions and test scope.
Trainee password sign-in is now implemented with contact verification deferred
by the owner; see [password auth](PASSWORD_AUTH.md) and [decisions](DECISIONS.md).
Gym/branch onboarding is implemented; see [gym management](GYM_MANAGEMENT.md).
Configurable pricing, private receipt evidence and manually approved topups are
implemented; see [topups](TOPUPS.md). Visit, cashier-sale and settlement workflows
remain pending. The checklist below tracks the broader sprint.
`apps/api/prisma/schema.prisma` is the first domain-model draft. It separates:
- `PointAccount / PointTransaction / PointPosting` (points).
- `MoneyAccount / MoneyTransaction / MoneyPosting` (gym receivables, held funds, payouts).
- `TopupRequest` (manual evidence + admin review), `Visit` (session lifecycle), `WithdrawalRequest` (payout lifecycle).
- `Gym`, `Branch`, `StaffAssignment` (tenant, branch scoping).

**Important:** Prisma schema alone does not enforce double-entry balance, active-visit uniqueness or per-account ownership invariants. Implement DB transactions, constraints, row locks, ledger balance tests and permission checks *before* releasing ledger endpoints.

## Sprint 1 acceptance
- [x] Private repository and separated development branch
- [x] Workspace and first API scaffold
- [x] Initial schema draft and written accounting requirements
- [x] Review foundation schema relations and test migrations on disposable PostgreSQL
- [x] Test typecheck and health endpoint on CI
- [x] Implement password-authenticated users and staff scoping
- [ ] Implement contact verification/OTP (deferred by owner)
- [x] Implement audited ledger service with transactional tests
- [x] Expose reviewed topup issuance endpoints
- [ ] Implement visits, cashier sales and settlements

Dashboard boundary, operator provisioning and validation: [WEB_DASHBOARD.md](WEB_DASHBOARD.md).

## Pending client/ops decisions
- Whether financial receivables are aggregated per gym or per branch (gym-level draft in schema; **not yet explicitly approved**).
- Business day calendar and time zone for withdrawal deadlines, plus request review SLA.
- Policy for disputed/reversed visits already paid out.
- Detailed pricing/reconciliation rules and treatment of unused, expired, reversed, and refunded points.
- OTP vendor, map provider, hosting and production legal/accounting approval.

