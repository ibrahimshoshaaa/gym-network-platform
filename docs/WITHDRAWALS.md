# Gym withdrawals and manual transfer recording

This increment implements the approved request → reserve → review → manual
transfer/proof → receipt/dispute flow in master spec §13, on the one-wallet-per-gym
foundation. It is stacked on draft PR #9 and its prerequisites. No automated bank
or wallet transfer, deployment, merge, real funds or production migration runs.

## Request and balances

An active accepted gym's current active owner submits any positive whole-piaster
amount up to AVAILABLE; there is no minimum. The request snapshots InstaPay or
Egyptian wallet destination and beneficiary name. InstaPay identifiers are plain
text for manual verification, not an asserted provider-side validation. Bank
payouts are not enabled. Owner must confirm the destination before requesting;
admin must independently verify it on approval.

A serializable transaction reserves AVAILABLE → RESERVED immediately, stores the
immutable request, and audits. UUID idempotency keys bind actor, gym and canonical
payload. Duplicate retries replay; changed payload conflicts; simultaneous requests
cannot over-reserve. No points or external funds move on request or acceptance.
Owner can cancel REQUESTED only, including while the gym is suspended. Admin can
reject REQUESTED or APPROVED before payment. Both release the exact reservation
once. Accepted deadlines/reviewer snapshots survive rejection as historical facts.

## Calendar and acceptance

No operating calendar is seeded. Admin must explicitly publish workdays (ISO
Monday=1 through Sunday=7), holiday dates, whether to include the acceptance day,
and a Cairo local cutoff hour/minute. These are operational settings to be reviewed
by the platform owner, not a claimed official Egyptian holiday calendar.

The confirmed SLA is three working days **from acceptance**, not submission.
With acceptance-day inclusion enabled, that day counts only when it is a workday,
is not a holiday and its cutoff has not passed. Otherwise count starts on the next
qualifying workday. Deadlines use IANA Africa/Cairo rules. A repeated cutoff during
a clock change uses its later instant; a nonexistent cutoff fails closed for review.
The accepted request stores immutable calendar ID, acceptedAt and calculated dueAt;
future calendar updates never recalculate it. Approval requires the viewed latest
calendar version, independent destination confirmation, current accepted requestor
ownership and active gym, plus reserved balance. Calendar editors use version
checks so conflicting updates cannot overwrite settings. Review latency before
acceptance and automatic notifications/escalation are not given invented SLAs.

## Payment and evidence

Admin records a transfer already executed outside the application, with exact
amount, reference, a private owned image, explicit funds-transferred and
proof-reviewed confirmations, and reason. Late recording additionally needs a
delay reason without moving the original deadline. RESERVED → PAID, transfer
metadata, immutable action and audit commit atomically. The app does not contact
or initiate a payment provider. A paid request cannot be rejected, cancelled,
reset to REQUESTED or paid again. Competing pay/reject commands yield one outcome.
Recording an actual completed transfer remains possible after gym suspension;
approval checks eligibility first and the destination remains its original snapshot.

Proof images use existing private Cloudinary upload/cleanup and expiring URLs.
They are globally unique financial evidence across incoming topups and withdrawals;
receipt row locks, a shared immutable FinancialEvidenceUse primary key, serializable
checks and deferred cross-table claims prevent reuse. Transfer references are normalized to uppercase and
unique across withdrawals. Evidence is owned by the recording admin. Read access
extends only to active admins and the actual accepted gym owner for the linked
PAID/DISPUTED request; unrelated owners, trainees and branch staff remain denied.
Raw provider object keys and idempotency hashes are never returned in request views.
Real upload/download still needs server Cloudinary credentials and provider testing.

## Owner acknowledgement and dispute

After PAID the current accepted owner may confirm receipt or record a reasoned
dispute, with one immutable feedback and a command receipt. A dispute changes the
request to DISPUTED but leaves the money already sent in PAID. It never debits
unrelated available earnings, replenishes available cash or sends another payout.
A received/disputed race accepts one outcome. Admin can see the evidence and
chronological action history. Dispute resolution that changes money, repayments,
debts, per-visit payout allocation and pre-payment fraud holds remain separate
policy/workflows; the dispute stays visible for human investigation.

Existing visit-cancellation safeguards still block aggregate reversals after an
intervening reservation/settlement, even if later earnings refill AVAILABLE. No
unapproved legal debt or future-earnings deduction is introduced. Sale cash refunds
remain blocked pending O05, and paid-out visit correction remains pending O07.

## API and UI

- GET/POST /admin/withdrawal-calendar
- GET/POST /gyms/:gymId/withdrawals (actual owner)
- GET /admin/withdrawals
- GET /withdrawals/:id (actual owner or admin; includes feedback/actions)
- POST /withdrawals/:id/cancel and /feedback (actual owner)
- POST /admin/withdrawals/:id/review and /payment

Every financial mutation requires a UUID Idempotency-Key, including decisions and
feedback. Saved immutable commands allow exact retry after an ambiguous response;
changed action/payload conflicts. Authorization is checked again on every replay.
Lists paginate with bounded limits/cursors. Financial actions are rate limited,
private responses are no-store and the same-origin web BFF has explicit paths and
forwards idempotency headers. Pending commands stay in component memory only;
closing/reloading requires history reconciliation before a new action.

Arabic UI shows AVAILABLE/RESERVED/PAID separately, preserved receiving details,
acceptance/deadline/late status, proof, owner response and action history. Admin
configures the calendar explicitly before acceptance and records manual proof.
The app supplies no seeded destination/account, commercial fee, minimum withdrawal,
automatic holiday list or default business-week policy.

## Database and validation

Migration refuses any legacy skeleton withdrawal rows for explicit reconciliation;
it never backfills imaginary reservations. Deferred checks require exact posted
same-gym reservation/release/payment legs, matching actors, amounts and references.
Requests preserve immutable financial/destination facts; allowed transitions have
strict metadata. Calendars, actions and owner feedback are append-only. Missing
payment proof, forged PAID state, partial reservations or mutated history fail.

Unit tests cover calendar rules, real Cairo local cutoffs and invalid settings.
Restricted PostgreSQL tests cover oversubscription, retries, actor/gym scopes,
cancel/reject release, acceptance snapshots, exact proof/amount/reference, late
reasons, pay/reject and receipt/dispute races, proof privacy/cross-domain reuse and
forged state/ledger guards. The HTTP flow earns actual synthetic visit receivables,
reserves/cancels/retries, accepts with a calendar, records a synthetic proof,
opens a dispute and checks balances/cancellation protection through the BFF.
No live funds, real customer records, provider upload or physical browser QA used.

## Withdrawal detail balance snapshot

Authorized owners and admins now receive one RepeatableRead snapshot of current
available/reserved/disputed/paid accounts alongside the immutable request and its
state. Posted ledger totals are compared with cached balances, and aggregate open
withdrawals must equal RESERVED. The screen distinguishes this request's existing
reservation from other reservations. It never subtracts the request again on
approval or payment: payment moves RESERVED to PAID, leaving AVAILABLE unchanged.
Net accumulated entitlements include recorded adjustments/reversals and prior
payments; they are not asserted to be gross visit revenue or bank cash. The view
is current at asOf, not a reconstruction of balances at submission. Explicit refresh
reloads status and balances. Existing atomic server checks remain authoritative.
No debt policy, refund, dispute-hold mutation or external transfer is introduced.

The snapshot also separates non-cancelled visit earnings from net recorded other
adjustments, with the latest five visit references, hosting branch, points and
historical settlement amount. It does not invent per-visit payout allocation.
