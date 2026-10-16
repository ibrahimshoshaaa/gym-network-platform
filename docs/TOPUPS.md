# Manual topups and platform settings

The platform owner configures all commercial values. Nothing is seeded as a
commercial default. Values in tests are synthetic examples only.

## Admin configuration

`GET /admin/topup-settings` shows the latest policy, channels and first 100
packages. `POST /admin/pricing-policies` accepts `expectedVersion` (0 initially),
`pointPricePiasters` as a positive integer string, `gymDiscountBps` (0–9999) and
`redemptionBps` (1–10000). Basis points mean 10000 = 100%; 1500 = 15%.
Each change appends an immutable version; competing saves reject stale versions.

`redemptionBps` means the share of point face value payable by the platform to
the gym when the gym redeems points consumed by visits. It is independent of
the discount at which a gym buys branch stock. This PR records the configuration;
visit redemption and settlement posting remain a later workflow. A future visit
must save the policy used for that visit, so changing rates cannot recalculate
existing receivables. A topup's redemption snapshot is informational, not a
promise to fix the rate for all future visits using those points.

`PUT /admin/payment-methods/INSTAPAY` or `/WALLET` accepts `expectedVersion`,
`account`, `accountName`, `enabled`. These are destination details, never bank
login credentials. The owner can change both account identifiers and names.
`POST /admin/topup-packages` and `PUT /admin/topup-packages/:id` accept
`expectedVersion`, `label`, `kind` (`TRAINEE` or `BRANCH_STOCK`), `points`,
`enabled`. Packages contain quantities; prices derive from current policy.

## Customer and gym owner flow

All routes require an active bearer session. `GET /topup-options?kind=TRAINEE`
(or `BRANCH_STOCK`) returns current policy, enabled channel details with their
versions, and enabled packages (first 100). Never show account details from a
cached page as the latest destination.

`POST /topup-quotes` accepts `kind`, `receivingBranchId` for branch stock only,
and exactly one of `points`, `amountPiasters`, or `packageId` + `packageVersion`.
Only trainees can request their own wallet topups; only the accepted owner of an
active gym can buy for an active branch of that gym. Staff cannot buy stock.
Quotes use exact BigInt arithmetic: price × quantity × (10000 − discount) / 10000,
rounded up to a whole piaster. Amount-based quotes return whole points and the
unallocated amount. The actual transfer must match `chargePiasters`, rather
than including the unallocated remainder. All monetary API fields are strings
of integer piasters, never floating EGP numbers.

Upload a binary JPEG, PNG or WebP to `POST /receipts` with its image Content-Type
and authorization. No multipart form or remote URL is accepted. The response
contains only `id`. `POST /topups` accepts the quote selection plus
`pricingVersion`, `paymentMethod`, `paymentMethodVersion`, `receiptId`; send a
UUID `Idempotency-Key` header. The server recalculates the price and rejects
stale prices, packages or receiver versions. Old requests keep their snapshots.
Replaying the same key and payload returns the original request; changing the
payload with that key fails. Submission does not issue any points.

`GET /topups?limit=25&cursor=<uuid>` lists only the caller's requests.
`GET /trainee/wallet` returns the caller's wallet balance and expiry.
`GET /admin/topups` paginates pending requests; `POST /admin/topups/:id/review`
accepts either `{decision:"REJECTED",reason}` or
`{decision:"APPROVED",reason,paymentReference,receivedAmountPiasters,
fundsReceived:true,receiptReviewed:true}`. A reviewer must independently check
the actual receiving account, transfer reference and funds received. An image
is evidence for manual review, never automatic proof of payment. The normalized
external reference is globally unique. Match the received amount exactly;
over/under-payments need rejection and separate reconciliation.

Approval locks the request, rechecks active recipient/branch ownership and
status, posts one balanced issuance, stores its transaction ID, audits and marks
approved in one serializable transaction. Repeating approval cannot issue again.
Rejection issues nothing. Generic reversals cannot bypass approved-topup history;
refunds/reversals need their own later approval workflow. No gym monetary
receivable is created by stock purchase or wallet recharge.

Successful wallet recharge currently renews expiry to 90 days, a provisional
rule from the master spec. Approval blocks an expired wallet with positive
points until expiry reconciliation is implemented, avoiding accidental revival.
Legacy topups without complete snapshots can only be rejected by this workflow.

## Receipt privacy and operational setup

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` only
in the server secret store. Missing credentials fail closed. The Cloudinary
adapter uploads using authenticated delivery, rather than public assets.
`GET /receipts/:id/access` is available only to uploader and platform admin and
creates a signed download link valid for 60 seconds. Treat the link as a short
lived bearer capability; do not log, cache or share it. Access responses use
`Cache-Control: no-store`; permanent asset keys are not returned in API views.

Uploads are capped at 5 MiB and 20 million pixels. SVG, corrupt files and animated
images are rejected. Sharp re-encodes JPEG, stripping metadata. A unique hash of
normalized bytes rejects cross-account reuse and makes retries return the same
evidence ID for the same uploader. One evidence ID can support only one request,
including rejected requests. An edited receipt may have a different hash, which
is why independent bank verification and unique payment references are mandatory.
Uploads are limited per authenticated user and IP in shared database counters.
A failed DB save attempts deletion of the new Cloudinary asset. A crash between
provider upload and DB save can leave an orphan: reconcile private assets against
evidence rows operationally; retention/deletion policy needs a later decision.

## Validation and limits

CI runs PostgreSQL 16 migrations and the restricted runtime role; integration
files run sequentially because they share global settings. Tests within a file
exercise simultaneous reviews/configuration writes. Tests cover balanced one-time
issuance, snapshots, permissions, rejection, exact money, duplicate references,
receipt HTTP authorization and normalization with a fake injected storage adapter.
Unit tests verify closed storage configuration. Real Cloudinary upload/download
has not been verified without actual server credentials. No live funds were used.
Dashboard/mobile forms, visit QR, cashier direct sales, bank webhooks, settlements,
refunds, OTP, expired-wallet reconciliation and production rollout remain pending.

Deploy migrations forward in a test environment first. Existing immutable ledger
migrations are unchanged; this additive migration keeps nullable legacy snapshots.
After new topups exist, do not roll schema backward or delete history. Roll back
application deployment while keeping the additive schema, and reconcile any
pending requests before disabling this workflow.
