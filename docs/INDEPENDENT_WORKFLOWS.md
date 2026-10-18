# Support, updates, accounts, discovery and mobile completion

This increment adds the independent product workflows from the master spec without
choosing refund liability, paid-visit debt recovery, or confiscation/renewal rules
for expired balances. Existing ledger transactions and financial guards remain.

## Support

All authenticated roles can open a categorized case, optionally link their own
operation, attach a private image and exchange messages with platform admins.
Admins may read/respond and reopen; a case owner may close their own case. Support
messages are append-only. Client UUIDs prevent duplicate creates/replies on retry.
Case creation never refunds money, issues points or reverses a transaction.
Evidence access extends only to the actual case owner and administrators; public
business photos have a separate model and separate Cloudinary delivery type.
The support WhatsApp number is admin-configured, never seeded from a login phone.

## Updates and summaries

The authenticated updates center derives the latest bounded events from actual
owned/scoped source rows (topups, visits, sales, withdrawals, price reviews, support
and wallet expiry). Read markers are stored per user and event version. Responses
are private/no-store. Only the latest 100 are shown; full records remain in their
source pages. It is not a new financial source of truth or a full audit archive.
While the app is visible it refreshes updates every minute. No background push,
FCM credentials or delivery SLA is claimed by this increment.

Home summaries use exact role scopes and Cairo civil-day boundaries. Staff see
only assigned work areas; cashier daily activity is filtered to that cashier.
Financial gym totals are exposed only to owners/admins. Errors remain errors,
not zero-value successes. Admin audit browsing is separate and read-only.

## Accounts and recovery

Admin users can search identities, enable/disable non-admin accounts and issue
one-use 30-minute recovery links after current-admin password confirmation,
recorded reason and explicit off-platform identity verification. Pending invitation
accounts cannot bypass activation. Admin accounts cannot be disabled/recovered via
these UI actions. Tokens are random 256-bit values, stored only as SHA-256 hashes,
carried in URL fragments, and scrubbed from history on read. Redemption locks the
user, rechecks token/issuer/account validity, changes the password and revokes
previous sessions atomically. No recovery by unverified email/phone is added.
Profile editing changes display name only; verified-contact changes remain deferred.

## Expiry

Visible wallet warnings and update events cover 15/7/1-day windows and expiry.
Admins can list non-spendable expired/undated positive balances for human review.
The implementation does not delete points, bypass expired-wallet settlement guards,
or silently renew old balances. Those financial policy cases remain open.

## Discovery and media

The directory adds an interactive Leaflet/OSM map of the loaded eligible branches,
price filters, public photos and a gym logo. Every loaded branch is its own marker;
additional cursor pages can be loaded to expand the map. Pins show point price,
not cash collected at entry. Nearby ranking and eligibility still run server-side.
Owners/admins can upload one logo and six photos per branch. Bytes are re-encoded
and resized; metadata is stripped. Owners cannot edit another gym. Private receipt
IDs/object keys never become public gallery assets. Upload failure cleans its
provider object; removal hides the DB asset before best-effort provider cleanup.
Opening hours remain explicit descriptive text, not an invented open/closed policy.

## Verification and rollout

Migration 202610180001 is additive (six new tables and checks, no ledger rewrites).
The exact SQL is tested on an isolated Neon branch before production. CI applies
all migrations to disposable PostgreSQL, tests scope/retry/recovery/evidence,
runs the existing financial suite, and executes the HTTP + mobile viewport flow.
Android hybrid packaging and its limits are documented in apps/mobile/README.md.
