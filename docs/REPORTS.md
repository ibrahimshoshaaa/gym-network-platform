# Reports and monitoring

Reports are read-only and available to platform admins, accepted gym owners and active assigned staff. They do not create, reverse or adjust ledger entries. This feature builds on the withdrawals branch; it introduces no database migration.

## Scope and privacy

- Admins can select the whole platform, one gym or one branch.
- Owners can select their own accepted gyms, including suspended gyms for historical reading.
- Staff must select an actively assigned branch. They can read branch sales, visits, cancellations, inventory and pending operation-review counts. They cannot read stock purchases, consolidated gym money, withdrawals or global ledger reconciliation.
- The gym and branch selectors return only accessible IDs and names. All summary, detail and export requests recheck scope on the server.
- Detail and CSV columns contain record/reference IDs, event time, gym/branch IDs and names, current status, points, piasters and actor ID. They omit contact information, beneficiary details, receipt images/keys, transfer references, free-text reasons, secrets and request hashes.

## Date and amount semantics

Required `from` and `to` are inclusive calendar dates in `Africa/Cairo`, with a maximum of 366 days. The server converts each boundary to the first real local minute, including Cairo daylight-saving midnight gaps and repeated hours. Storage and exported event times remain UTC. Aggregate integers are calculated in PostgreSQL and returned as decimal strings without JavaScript floating-point conversion.

| Figure | Event date | Meaning |
| --- | --- | --- |
| Approved top-ups | Approval time | Sealed point issuance and recorded platform collection; scoped gyms include only their branch stock requests |
| Cash sales | Sale creation | Cash collected by the distributing branch; separate from platform collection and hosting receivables |
| Gross visits | Visit start | Original points and hosting receivable, including visits subsequently cancelled |
| Cancellations | Cancellation time | Exact original points/money reversal, even when the visit occurred before the selected period |
| Net visit movement | Visit movement minus cancellation movement | May be negative when an older visit is cancelled in the selected period |
| Paid withdrawals | Recorded payment time | Includes paid transfers whose receipt was later disputed; a dispute does not create a second payment |

Detail rows for top-ups and withdrawals use request creation time and their current status. Consequently, approved top-up or paid-withdrawal cards may differ from request rows in the same date range. Type/status filters affect detail and CSV only; the summary always shows all movement categories in the selected period and scope. Visit status is derived as expired at query time when its session has elapsed.

Current inventory, consolidated gym balances and ledger reconciliation are explicitly labelled **current**, not historical closing balances. Platform collection, cash sales and hosting receivables are distinct and are not a calculated profit figure. Expired but unsettled trainee wallet balances remain part of the ledger reconciliation, not spendable points. Reconciliation checks net point and money account sums, not a full event-by-event financial audit.

## Monitoring

The current backlog is independent of the selected historical dates: pending top-ups, pending operation reviews, requested/accepted withdrawals, accepted withdrawals past their stored deadline and paid-transfer disputes. Withdrawal lateness uses the previously accepted calendar deadline. No new review deadline or financial consequence is invented. These are on-demand dashboard counts, not push notifications or a background scheduler.

## Delivery and limits

- GET `/reports/gyms`, `/reports/gyms/:gymId/branches`: scoped keyset-paginated selectors.
- GET `/reports/summary`: movement cards, current balances and scoped backlog.
- GET `/reports/rows`: at most 100 rows, UUID keyset pagination.
- GET `/reports/export`: all matching rows up to 5,000; refuses larger exports rather than truncating. The page-size argument does not restrict export; cursors are rejected. Narrow the dates/scope/status when needed.

Each data request uses a repeatable-read transaction, a five-second statement timeout and a fifteen-second transaction timeout. Summary, detail and later pages are independent live snapshots; concurrent changes can affect later requests. The UI retains the applied query for pagination and export and displays the returned period and snapshot time.

Summary/detail/export are rate-limited per authenticated user. Responses are private and non-cacheable. CSV uses UTF-8 BOM, quoted RFC4180 fields, escaped quotes and formula neutralization. The authenticated web proxy preserves CSV download headers, bounds the response to 8 MiB and keeps the bearer token in its server-side session cookie flow.

## Validation

Unit coverage includes input boundaries, Cairo DST transitions, CSV escaping and exact large amounts. Disposable PostgreSQL integration coverage includes tenant/staff isolation, current versus period figures, cancellation-date reversals, keyset pagination/full export, read-only ledger behavior, large balances, reconciliation, pending/late withdrawal alerts and disputed paid transfers. The live HTTP suite covers authenticated web-proxy summary, privacy, CSV headers/full export and validation errors.

No visual browser, camera, real payment transfer or live Cloudinary verification is claimed by these tests.
