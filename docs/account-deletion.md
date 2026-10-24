# Account deletion

The shared Flutter Account screen supports iOS and Android. Pending/rejected gym applicants also have a deletion entry. `/delete-account` is the external web entry, with credential verification and receipt tracking without reinstalling the app.

Deletion requires the current password and literal `DELETE`. It cannot be undone after identity erasure starts. Account holders may cancel pending requests with their password, including from the external page. Platform administrators cannot self-delete through this flow.

## Behavior and retained records

Clear accounts erase their identity and UGC in one serializable transaction. Balances, current visits/bookings, pending payments/reviews/disputes, financial support cases, open maintenance, active promotion contracts, unpaid service charges and in-flight uploads block erasure. Gym owners also require administrative closure of their gyms. No balance is forfeited. Pending requests remain usable for settlement and appear under Users → Account deletion in the admin dashboard. The seven-day date is a review target; unresolved obligations can extend completion.

Erasure removes contact identifiers, verification flags, password hashes, recovery credentials, phone-test identities, OTP challenges, marketplace listings/reports/images, ratings, support threads and nonfinancial receipts. Business/maintenance/promotion content is removed or scrubbed. Owned gyms close and lose public contact/location details; staff authority and outstanding invitations are revoked. Sessions are irreversibly revoked and their token hashes replaced, retaining only rows needed by historical booking foreign keys.

The User UUID remains as an inactive, nonrecoverable tombstone. Financial ledgers, visits/bookings, sales/transfers, payment snapshots and financial evidence, maintenance/promotion monetary terms and necessary financial/security audit records remain restricted records. Those historical records may contain original labels, last four phone digits, payment details or submitted evidence. This is disclosed before confirmation. This feature does not establish a statutory retention period or represent store approval.

## Media and failure handling

Remote images enter AccountDeletionAsset in the same transaction as content removal. The web gateway starts an idempotent Vercel Workflow with only the deletion UUID. The worker destroys upload/authenticated Cloudinary assets with CDN invalidation and validates `ok`/`not found`. It marks the request COMPLETED only after all queued assets have been confirmed removed. Failures remain ERASING, retry automatically, and remain in the admin queue for dispatch retry. Workflows do not serialize passwords, bearer tokens or receipt capabilities.

AccountUploadLease registers a predetermined remote key before an upload. Cloudinary uploads have a 120-second timeout; an active ten-minute lease blocks erasure. Successful persistence removes the lease. Unknown outcomes or failed compensation preserve it; erasure later removes those keys too. Database identity guards reject new content and credentials for an erased account.

A random client receipt capability is saved before submitting deletion and only its SHA-256 hash is stored server-side. POST status returns no user identity. Native confirmation clears saved sessions and that account's pending financial envelope only after confirmed erasure. Receipt refresh handles a lost destructive response. A subsequent confirmed pending request from another device replaces the previous receipt capability; use the device that most recently submitted the request for post-erasure tracking.

## Release

Apply `202610230004_account_deletion` before enabling these routes in a deployment. Configure the existing Cloudinary credentials and Workflow runtime. Add the deployed `/delete-account` URL to store deletion metadata. Verify review staffing and approve the retention disclosure/privacy policy before a public store release. No production migration or real-user deletion is performed by the test suite.

Validation covers restricted PostgreSQL erasure, retained ledger immutability, media retry, upload races, pending/cancelled requests, disabled-account access, admin protection, receipt secrecy, gateway allowlists and Flutter response-loss handling. All test identities and storage objects are synthetic.
