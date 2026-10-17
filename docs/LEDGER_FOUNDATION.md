# Ledger foundation — 17 October 2026

Current status: cashier sales and QR visits now use this foundation, and O01 is approved as one wallet per gym. See [CASHIER_VISITS.md](CASHIER_VISITS.md); the scope described below records the original foundation milestone.

## Implemented scope

This increment adds an initial Prisma migration and a hand-written integrity
migration, internal point/money posting and exact reversal primitives, an
owner-only stock transfer service, scoped authorization checks, hashed bearer
sessions, `GET /me`, and `POST /auth/logout`. The test suite uses synthetic users
and points only. There is no public endpoint for posting arbitrary ledger entries,
creating sessions by user ID, issuing points, selling points, or accepting QR visits.

`postLedger` is an **internal platform-admin primitive**, not a receipt approval
workflow. `reverseLedger` is not a sales/visit cancellation workflow. It blocks
visit/expiry/payout transaction kinds and requires both legs of a bundle.
Production approval workflows must call purpose-built domain services instead of
exposing these primitives to HTTP clients.

## Database guarantees

- Each point/money transaction has at least two non-zero entries totaling zero.
- Transaction headers start unsealed and must be sealed before commit. Entries
  cannot be appended after sealing. Posted headers, entries and audit records
  cannot be updated or deleted by normal DML.
- Posting triggers, rather than application updates, own the cached balances.
  Deferred constraints reconcile cached balances with all postings at commit.
- Only the issuance and platform-offset system accounts may carry negative
  balances. Trainee wallets, branch inventories and receivables may not.
- New accounts start at zero; account identity and ownership cannot be edited.
- One wallet per user, one stock account per branch and singleton technical
  accounts are enforced. Money accounts have optional branch attribution with
  a composite FK preventing cross-gym assignment.
- Transaction/visit links are FKs. Only one ACTIVE visit row per trainee/branch
  is allowed; a future entry service must expire elapsed rows within its entry
  transaction before inserting the next visit.
- App transactions use serializable isolation with bounded retries, an advisory
  lock on the request key, deterministic account locks, and a hash binding actor,
  reason, reference, transaction kinds and both posting sets to the key.
- Both ledgers and their audit event commit or roll back together.

The technical offset balance is the inverse of issued points or posted
receivables; it is not spendable stock, negative customer debt, cash received or
recognized revenue. These are operational ledgers, not a complete general ledger.

Use separate migration-owner and runtime database credentials. The runtime role
must not own tables or have DDL, TRUNCATE, superuser or trigger-disable privileges.
CI uses a restricted runtime role for its database tests. Database owners can
always override SQL controls and must be operationally protected.

## Authorization and sessions

`User.role` remains the draft global identity label. Ownership and explicit active
staff assignments determine tenant permissions: owners do not automatically get
cashier/manager rights. Only owners can transfer stock, and only between branches
of the **same gym**. Manager/cashier permissions require the matching assignment.
Inactive users fail all checks. Session tokens contain 256 bits of randomness and
only their SHA-256 hashes are stored; every authenticated request checks account,
expiry and revocation again. `/me` omits the phone number.

Session creation is internal and must be wired to a verified identity provider.
OTP delivery, self-registration, admin MFA and staff onboarding are not yet
implemented. No test OTP, fixed admin password or development sign-in bypass is
exposed.

## Running and testing

Use Node 22+ and the repository's `pnpm@9.15.9` via Corepack.

```bash
pnpm install --frozen-lockfile
pnpm --filter @gym/api db:generate
pnpm --filter @gym/api db:validate
pnpm --filter @gym/api typecheck
pnpm --filter @gym/api build
pnpm --filter @gym/api test
# Set DATABASE_URL to a disposable local PostgreSQL gym_ci or gym_test database.
pnpm --filter @gym/api db:deploy
pnpm --filter @gym/api test:db
```

Use `prisma migrate deploy`, never `prisma db push`: the integrity triggers and
partial indexes are hand-written migration SQL, not fully represented by Prisma.
The suite refuses non-local databases and database names other than `gym_ci` or
`gym_test`. It creates synthetic records without truncating existing tables. CI
creates a fresh PostgreSQL 16 service for each run.

Tests cover simultaneous retries, changed-key payloads, competing stock transfers,
scope and revocation, point/money atomicity, BigInt precision, reversal, malformed
postings, direct database tampering, unbalanced/unsealed transactions, session
expiry/logout, health and unavailable financial routes.

## Open decisions and next increment

MoneyAccount/WithdrawalRequest support optional branch scope so the draft schema
does not settle O01. No financial account provisioning or withdrawal API chooses
gym-level vs branch-level policy. Commercial rates, OTP vendor, expiry policy,
refund policy and business-day calendar remain open as in the master spec.

Next: verified identity onboarding, top-up evidence/review and domain issuance,
then cashier sales and QR/visit posting. Price approval history, wallet expiry
behavior, replay-safe top-up approvals and session lifecycle need their own tests.
No production database or real transaction has been created by this increment.

## Rollback

The migrations target a previously unprovisioned development database. Existing
ad-hoc `db push` databases require an explicit baseline/data review before use.
For a disposable test database, discard and recreate it. For any persistent
database, take a verified backup and design a forward corrective migration;
do not delete ledger rows or edit deployed migration checksums. Roll back the
application commit separately if necessary. Neither main nor deployment changes
are part of this increment.
