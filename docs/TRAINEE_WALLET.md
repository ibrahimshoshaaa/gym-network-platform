# Trainee wallet and activity

The trainee web wallet now loads independently of QR generation and shows booked points, spendable points, validity, sealed point movements and active sessions. All reads are restricted to the authenticated active trainee; callers cannot supply another user/account ID.

## Availability without forfeiture

GET `/trainee/wallet` preserves the existing `balance` and `expiresAt` fields and adds `status`, `spendablePoints`, `unavailablePoints` and `serverTime`:

| Status | Meaning |
| --- | --- |
| EMPTY | Booked balance is zero |
| VALID | Positive balance with expiry strictly after the server snapshot |
| EXPIRED | Positive balance whose validity has elapsed, including the exact expiry instant |
| REVIEW_REQUIRED | Positive balance without recorded expiry |

Only VALID points are displayed as spendable. Expired or missing-expiry balances remain recorded and unavailable. Reads do not delete points, create expiry postings, renew validity or change the approved expiry/refund policies. Existing topup/sale/cancellation services remain authoritative: a new charge cannot silently revive expired positive points, and cancellation does not renew validity. No cash withdrawal/conversion is introduced for trainees.

The UI also stops showing VALID points as spendable when the last known deadline passes, using server time anchored before the request to a monotonic client clock. This is a conservative display estimate, not authorization to spend. Actual balance and validity are rechecked server-side for every mutation.

## Point movement history

GET `/trainee/wallet/movements` supports `limit` (1–100, default 25), UUID posting `cursor` and an optional operation filter: TOPUP, SALE, VISIT, VISIT_CANCELLATION, EXPIRY or ADJUSTMENT. Unknown selectors/filters are rejected.

Only sealed postings on the caller's TRAINEE_WALLET account are returned. The response contains signed delta, event time, transaction ID, original operation reference and relevant business branch/gym names. It omits actor/contact identities, other wallets, receiving payment accounts, receipts, request hashes, free-text ledger reasons and gym settlement amounts. Pending/rejected topup requests do not appear as point movements. Approved direct topups reference their request; cashier purchases reference their sale; visit consumption and its cancellation reference the same original visit. Internal postings without a matching domain record are labelled adjustments rather than falsely claiming a topup or sale.

Pages sort by immutable ledger posting time descending and posting UUID descending as a tie-breaker. The server resolves cursors only from the caller's own sealed postings. Event time can differ from posting time for a recorded cancellation; no per-row historical running balance is invented. Each request is an independent live snapshot. Posted movements persist even if the gym/branch later stops operating.

## Visits and session clocks

GET `/trainee/active-visits` returns only the caller's still-active, unexpired sessions. GET `/trainee/visits` now provides a minimal trainee-specific projection with business branch/gym names, charged points, start/end, derived status and own cancellation reason. It no longer exposes gym settlement amounts, cashier IDs or policy snapshots. Branch/staff operational endpoints keep their existing authorized views. This deliberate tightening of the earlier trainee response is relevant to future API/mobile clients.

Visit pages use start time descending plus UUID, with own-visit cursor checks. At the exact expiry instant, an ACTIVE database row is returned as EXPIRED in history and excluded from active sessions; reads do not mutate it. Existing entry processing owns any required status updates. Historical visits remain accessible after branch suspension.

The UI refreshes wallet/session snapshots every 30 seconds while visible and upon returning to the page. Manual refresh/QR renewal also refresh histories. Paginated history is not continuously reset by background refresh. Active countdowns use server deadlines and elapsed monotonic time, avoiding a wrong device date; request delay is conservatively subtracted. They are estimates, and elapsed session time is not evidence of physical exit. Cancellation elsewhere appears at the next refresh.

## Controls and validation

Reads use repeatable-read transactions, five-second statement timeouts and ten-second transaction timeouts. Wallet, movement and visit reads are separately rate-limited at 120 requests per 15 minutes (active/history share the visit allowance). Web proxy routes are explicit, read-only, authenticated and non-cacheable. No schema migration or public ledger mutation endpoint is added.

Coverage includes availability/expiry boundaries, missing validity, safe server clocks, approved versus pending topups, sale/visit/reversal references, signed conservation, own-data/cursor isolation, exact active-session expiry, no read-side ledger/status mutation, private API projections, proxy paths and authenticated HTTP wallet/history/session flows. No visual browser or live-provider verification is claimed.
