# Cashier sales and QR entry

## Approved decision O01

The project owner chose **one financial wallet per gym with branch reporting**
in the Work conversation on 17 October 2026. Monetary accounts are now constrained
to gym scope (`branchId IS NULL`). Visits retain their hosting branch. The
migration intentionally refuses existing branch-scoped money accounts; reconcile
any such development/imported accounts before migration. It never moves or merges
balances silently. Existing financial fixtures already use gym scope.

## Cashier sales

An active accepted gym, active branch and explicit active CASHIER assignment are
required. Ownership, admin role and BRANCH_MANAGER alone do not permit selling or
confirming visits. `/operations/branches` returns the caller's first 100 active
assignments, merged by branch with `canSell`. Managers can read scoped history.

`POST /cashier/branches/:id/trainee-lookup` accepts a complete phone number in a
JSON body (never a URL). It returns only trainee ID, first-name/initials and last
four phone digits for active trainees. Shared throttles limit lookup enumeration.
`POST …/sale-quotes` accepts `traineeId,points`; the server quotes the latest
platform point price **without the gym stock purchase discount**. `POST …/sales`
requires a UUID Idempotency-Key and `traineeId,points,pricingVersion,
receivedAmountPiasters,fundsReceived:true`. Exact collected amount and current
policy are checked; cashier cannot override rates or issue new points.

A serializable transaction transfers stock → trainee wallet, appends an immutable
sale with price/recipient snapshots, renews wallet expiry, and audits. There is
no platform cash posting or gym visit receivable from a sale. Retries replay the
same sale; changed payload conflicts. Negative inventory/overflow aborts fully.
The provisional 90-day wallet renewal remains; positive expired wallets require
separate expiry reconciliation before recharge/sale. Contact OTP remains deferred.
All sale reversals require a later admin-approved correction workflow; even the
internal generic reversal cannot reverse a linked sale. No refund endpoint exists.

## Trainee QR and visits

Registered trainees can now sign in to the web dashboard to display their wallet,
QR and visit history while Flutter remains pending. No default account or new
web signup was added. Existing public API registration is unchanged.

`POST /trainee/qr` creates a cryptographically random 256-bit ticket, valid for
60 seconds or the remaining auth-session lifetime, whichever is shorter. Only its
hash is stored; it is bound to the issuing auth session and active trainee. The
newest ticket replaces the previous one. QR content is `gymqr:<opaque ticket>`:
no identity, contact, price or balance is embedded. Logout/password revocation
invalidates tickets through the auth-session check. QR creation is throttled.
Browser countdown uses server-provided lifetime and a monotonic local timer;
only the server decides validity. No signing-key configuration is needed.

`POST /cashier/branches/:id/visit-previews` takes `token` and returns masked
identity, price, available balance, session duration, current pricing versions,
and any active session. Preview does not consume points/ticket.
`POST …/visits` requires UUID Idempotency-Key and `token,pricingVersion,
branchPricingVersion,presenceConfirmed:true`. The cashier must verify physical
attendance. Final authorization, ticket, price, wallet and active-session checks
happen inside one serializable transaction. QR row locks, deterministic ledger
locks and the existing unique active-visit index prevent duplicate charges.

On a new visit: wallet → REDEEMED points, PLATFORM_OFFSET → hosting gym AVAILABLE
money, immutable visit snapshots, consumed ticket and entry receipt all commit
together. The gym that sold the points may differ from the hosting gym. Settlement
is `ceil(visit points × point price in piasters × redemptionBps / 10000)` per
visit, up to a whole piaster, with bounded BigInt arithmetic. Minimum positive
values therefore still produce a balanced nonzero money transaction. Old visits
retain their point price, redemption ratio, branch pricing version and duration.
Changing settings never recalculates their receivables.

Re-scan during an active session in the same branch returns that session and no
new charge, including a fresh QR. A consumed ticket cannot start a visit at a
different branch or a new session. An expired QR needs renewal, except that an
exact previously successful idempotency-key retry can return its saved result.
Expired ACTIVE rows are transitioned during the next entry; expiry relies on
server time, not a background job. Session expiration is not proof of departure.
There is no global ban on distinct-branch sessions in this increment; the approved
invariant is one active session per trainee per branch. Point balances still
prevent concurrent overspending across branches.

## Reading and UI

`GET /operations/branches/:id/summary`, `/sales`, `/visits` check actual ownership,
admin access or a live assignment. Histories paginate with limit/cursor. Trainee
history at `/trainee/visits` is self-only. `GET /gyms/:id/receivables` is owner-only;
`/admin/gyms/:id/receivables` is admin-only. The gym-management page shows the
consolidated available receivable separately from branch stock.

The cashier UI includes phone lookup, quote, explicit collection, reference,
QR camera scanner plus manual-token fallback, presence confirmation and history.
Camera is user-triggered, same-origin only, requires HTTPS/browser permission,
and stops on cleanup. It is not a proof of device attestation or actual presence.
No persistent geolocation or biometric data is collected. Strong device enrollment,
fraud monitoring and notification delivery remain separate work.

Ambiguous mutation failures retain the original command and UUID in component
memory, lock edits and retry the same payload. A confirmed new sale gets a new
UUID even when otherwise identical. No Offline posting occurs. If the page is
reloaded or closed during an unknown outcome, review history/reconcile before
starting a new collection; no financial pending payload or QR token is persisted
in browser storage. Changing pages also discards that in-memory draft.

## Validation and remaining scope

CI tests transfers, parallel overselling/scans, scoped authorization, exact price,
expired wallets, QR rotation/session revocation, atomic rollback, expiry with a
mocked clock, rate snapshots and distributor/hosting-gym separation. The live
HTTP suite registers a synthetic trainee, logs in via the gateway, funds branch
stock, sells points, issues QR, confirms/replays entry and checks the consolidated
receivable. No live funds or actual customer records are used.

Production builds and HTTP flows are tested. Physical-camera scan, desktop/mobile
visual QA and real Cloudinary integration still require a supported browser and
server credentials. Flutter, cancellations/refund review (including manager's
first-ten-minute flow), paid-out reversal reconciliation, withdrawals, devices,
fraud review and production rollout are not implemented here. Generic visit
reversals remain blocked, so pending cancellation policies cannot be bypassed.
