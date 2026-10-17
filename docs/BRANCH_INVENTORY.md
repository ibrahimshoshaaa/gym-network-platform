# Branch inventory and owner transfers

This increment exposes the existing audited owner stock-transfer primitive through an explicit authenticated API and Arabic dashboard. It reuses the sealed points ledger, introduces no migration and never posts money or issues new points during a transfer.

## Permissions

- Only the actual accepted owner can transfer between two different active branches of the same active gym. Both branches, the gym in the URL and the owner's active identity are checked inside the serializable transaction.
- An owner who owns two gyms still cannot transfer between those gyms.
- Cashier/manager assignments grant branch history reading, not transfer authority. Platform admins have oversight reading; their global role does not grant the owner's transfer permission.
- Suspended branch/gym history remains readable under the existing scoped read policy. New transfers require active operating status. Assignment revocation immediately removes staff history access.

## API and records

- POST `/gyms/:gymId/stock-transfers`: strict `{fromBranchId,toBranchId,points}` with distinct canonical UUIDs and a positive whole-point quantity up to 2,147,483,647. A UUID `Idempotency-Key` header is required and namespaced by the server to the actor and action.
- GET `/inventory/branches/:branchId`: scoped branch identity, operating status and current point stock.
- GET `/inventory/branches/:branchId/movements`: at most 100 sealed ledger postings per keyset page, showing signed delta, time, transaction reference, actor ID and operation classification. Transfers show the counterpart branch ID only inside the same gym. Contact details, request hashes, credentials, receipt/payment evidence and free-text reasons are omitted.

The transaction ID is the stable transfer reference shown in both branch histories. There is no separate mutable transfer document or generic ledger-adjustment/reversal endpoint. The operation classification distinguishes branch-to-branch transfers from stock sales into trainee wallets even though both use the existing TRANSFER ledger kind.

Deterministic account locks, serializable retries, balance checks, paired postings and the sealed ledger/audit constraints keep both legs atomic. Concurrent same-key retries return the original result; changing branches/quantity under that key conflicts. Competing different-key transfers cannot overdraw stock. Replays recheck current authorization and operating status before returning a result.

The source and target accounts must already exist; normal branch onboarding provisions them with zero stock. An absent inventory account is a conflict requiring review, not a new source of points. Transfers leave total branch inventory, trainee wallets, issuance and all money accounts unchanged except for the two selected branch point balances.

## Dashboard behavior

The inventory tab uses paginated scoped gym/branch selectors and can show current stock and movement for admins, owners and assigned staff. Owners get a transfer dialog with source, destination and quantity. The dialog fetches both balances, shows projected before/after values, then requires confirmation. These are a preview; the server validates the current state at execution. The transaction reference remains visible after success; refresh updates the current branch history and balance.

A server/network outcome that is uncertain locks editing and reuses the exact original command and key on retry. This state is in memory only: reload/navigation recovery is not a durable outbox. Users must check the movement reference/history before starting another transfer after losing the page. Amounts are points, not cash or hosting-gym receivables.

## Validation

Coverage includes strict payloads/canonical IDs, owner and gym scope, concurrent retries and competing transfers, immutable shared references, insufficient stock, suspended branches, revoked assignments, private paginated history, explicit proxy paths and authenticated HTTP transfer flows through the web gateway and disposable PostgreSQL. No visual browser or live-provider check is claimed.
