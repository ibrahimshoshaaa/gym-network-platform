# Remove gym point commerce — 26 October 2026

The platform alone sells/credits trainee points. Gym owners and branch staff operate visits and receive monetary visit entitlements; they have no point purchases, point stock, point sales, stock transfers or stock-transfer delegation.

## Removed implementation

- Inventory service/modules and owner/cashier sale, quote, lookup and history routes.
- Browser/native gateway allowlist entries, hidden inventory/sale screens and forms, and former stock-transfer permissions.
- Gym/branch point-account relations, topup destinations, gym-purchase discount, sale correction workflow and sale reports.
- `PointSale`, inventory account enum values, `BRANCH_STOCK` and `SALE_CORRECTION` from the current Prisma schema/database model. Previous migrations remain unchanged as migration history.

## Existing financial data

Migration `202610260001_remove_gym_point_commerce` snapshots the removed records in `FinancialArchiveRecord`, a sealed, nonoperational financial archive. It preserves original metadata and beneficiary identities needed for accounting. Existing inventory ledger account IDs and balances remain in the double-entry ledger under generic `ARCHIVED` accounts; the old gym/branch scope columns are removed. No transaction/posting or money balance is deleted, zeroed or reissued.

Archived accounts reject creation, identity/balance changes and every new posting. Archive records reject runtime writes. Original receipt-usage claims are relinked to archived records, preserving uniqueness and preventing receipt reuse. Nonzero archived balances and unresolved archived requests continue to block account erasure pending an explicit financial reconciliation; no automatic forfeiture or refund is implied.

Only an administrator can see the existing aggregate accounting reports. Archived balances are excluded from spendable/circulating points and future visit-liability estimates. Historic platform receipts remain part of the accounting totals, separately labeled as archived.

## Validation and rollout

- Typecheck API, test fixtures and web; run API/web unit and gateway security tests.
- Apply all migrations to disposable PostgreSQL and run session, ledger, booking, withdrawal, topup, permission and report regressions.
- Run Flutter analysis/widget tests on the current native code and compile/launch the iOS simulator build.
- Rehearse the migration transaction with existing data, check point/money balance and posting fingerprints plus receipt-usage counts, then roll back the rehearsal completely.
- Coordinate the new server deployment and migration; the new client schema removes columns and expects the archive table. A website build never applies the migration automatically.
- Distribute a fresh Android/iOS build for the removal of unused native screens and changed report fields.

The short Arabic TextBee messages, real OTP verification/recovery, welcome-point policy, trainee recharge, visits/bookings, gym monetary entitlements and withdrawals remain implemented.
