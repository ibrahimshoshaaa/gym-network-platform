# Visit cancellation and operation reviews

This increment implements master spec §§12.3–12.4. It depends on the unmerged
cashier/visit stack; its draft PR targets develop and does not merge earlier PRs.

## Direct cancellation

`POST /operations/branches/:branchId/visits/:visitId/cancel` requires a UUID
Idempotency-Key and `{reason}` (5–1000 characters). Only an active, explicitly
assigned BRANCH_MANAGER in the hosting branch may cancel, with active branch/gym
and accepted active owner. Ownership, admin role and cashier assignment do not
implicitly grant manager permission. The server permits at most 600,000 ms from
stored startedAt, including the boundary. Exact successful retries still replay
after the deadline; permission is checked on every retry.

A serializable transaction locks the visit and posts exact opposite entries for
both original transactions, with unique reversalOfId links. It records an immutable
VisitCancellation, changes the visit to CANCELLED with actor/reason/time and
appends audit entries. Original visit pricing, sales, entry receipts and ledger
history stay immutable. Different keys cannot refund the same visit twice. Used
QR tickets cannot start a new visit after cancellation. A new attendance requires
a fresh ticket and the normal entry flow.

Cancellation does not renew wallet expiry. Expired/missing wallet expiry blocks
execution and leaves any review pending. New pricing never changes a reversal.

## Request and review

`POST /operation-reviews` requires UUID Idempotency-Key and
`{kind: VISIT_CANCEL|SALE_CORRECTION,targetId,reason,evidenceText,evidenceId?}`.
The authenticated trainee who owns the target, its gym's accepted owner, active
staff assigned to its branch, or admin may request review. Requests remain possible
for historical/inactive branches. A supporting image is optional; narrative
supporting evidence is required. An attached image must belong to the requestor;
existing private Cloudinary receipt validation/access applies. No external URL is
fetched. Actual Cloudinary credentials are still required for real image upload.

There is one durable review case per target, including after rejection. A second
case never overwrites evidence. Once a case exists, direct manager cancellation
is blocked and it must be handled through admin review. GET /operation-reviews
is requestor-only and paginated; staff do not gain access to another requestor's
narrative/evidence just because they share a branch. Admin reads use
GET /admin/operation-reviews and /admin/operation-reviews/:id, with a whitelisted
original operation, hosting branch/gym and original amount snapshots.

`POST /admin/operation-reviews/:id/review` accepts
`{decision: APPROVE|REJECT,reason}`. Only active admins may decide. Visit approval
executes the same exact reversal atomically with the terminal decision; rejection
changes no balance. Replaying the same decision/reason by the same admin returns
the saved result. Changed or conflicting decisions fail. Approval/rejection races
produce one result. Requestors can see the decision and reason in their history.

## Open commercial decisions remain open

- **O05 sale refunds:** SALE_CORRECTION requests can be recorded, inspected and
  rejected. Approval is blocked in the service and database pending the decision
  about who returns cash, confirmation/proof, partial refunds and consumed points.
  No cash refund or sale reversal is created automatically.
- **O07 previously settled visits:** aggregate available cash is not evidence that
  a specific visit was unpaid. Any non-visit-reversal debit from the hosting gym's
  AVAILABLE account at or after the original settlement timestamp blocks automatic
  cancellation, even if later earnings refilled its balance. Insufficient available
  balance also blocks. This deliberately conservative guard leaves reviews pending;
  it does not invent debt or debit future earnings. Later withdrawals need explicit
  allocation/provenance and an approved paid-out correction policy.
- Withdrawal request/reserve/approval/payment/dispute execution is still pending.
  Three business days from acceptance is approved, but workdays, holidays, cutoff
  rules and payout destination validation must remain configurable or be decided.

## Database and web guarantees

Foreign keys, target checks and guards protect review facts, require initial
PENDING state and one terminal decision, and make cancellation receipts immutable.
Deferred constraints require the CANCELLED visit and receipt to accompany exact
opposite posted point/money legs for the original transactions. Approved reviews
must own that cancellation receipt. Missing metadata or orphan approval fails the
whole transaction. The application runtime remains CRUD-only, not schema owner.

The Arabic dashboard adds cancellation actions for managers, review requests on
sales/visits, a trainee request action, and a shared request history/admin review
panel. Admin detail shows original points/money/time and private supporting image.
Same-origin BFF allowlists are explicit. Private reads are no-store; bodies and
pagination are bounded; shared database throttles apply to mutation endpoints.
Unknown financial responses retain the original command/key in memory, lock edits
and retry the same command. Reload/navigation still requires history reconciliation.

## Validation

PostgreSQL integration tests cover exact reversal, concurrent same/different keys,
manager scopes, inactive assignments, the ten-minute boundary, late admin review,
request/evidence privacy, terminal decision races, expiry, post-reservation
refilled balances, immutable receipts, forged metadata/approval, original pricing
and the blocked sale refund policy. Live HTTP tests exercise manager onboarding,
BFF CSRF/idempotency, cancellation, trainee review, admin detail/decision replay,
sale correction rejection and resulting balances. No real funds are transferred.
Browser visual/physical-camera QA and live Cloudinary remain unverified.
