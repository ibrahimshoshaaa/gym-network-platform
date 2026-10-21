# Marketplace, phase one

Mobile: a shared Market destination for trainees, gym owners, branch managers and cashiers. Browse approved listings across gyms, search Arabic text, filter category/condition/governorate/price, sort, paginate, contact the seller by WhatsApp or phone, and report a listing. Any active account can submit its own listing, edit it, hide it or mark it sold. The market is independent of the selected gym or branch.

Web: PLATFORM_ADMIN dashboard only. Review pending listings with a reason, hide published listings, review reports, and publish the platform's own listings. Existing customer and staff web portals are unchanged.

Listings contain 1–6 uploaded photos, title, description, category, condition, price in EGP, governorate, city and a deliberately published contact number. Editing a user listing returns it to moderation; platform listings publish directly. Payments and delivery are agreed directly with the seller. Marketplace operations do not move point balances or money ledgers.

## Authorization and consistency

- Only approved listings from active sellers appear publicly. Pending/rejected/hidden/sold details are limited to the seller and platform admin.
- Uploaded photos are decoded and re-encoded by the backend; arbitrary image URLs and another account's images cannot be attached. An image belongs to at most one listing.
- Creation uses a client idempotency key. Edits and decisions require an expected version. Listing/image row locks and serializable transactions prevent conflicting attachments or stale decisions.
- Uploads are limited to 4 MiB per request, 6 photos per listing and 20 uploads per account/hour. There are at most 30 active pending/approved listings per seller. Posting and reporting have separate rate limits.
- Admin moderation remains server-authorized; the mobile bridge does not expose admin marketplace routes.

## Rollout

Before routing production traffic to this release, apply `202610210001_marketplace` with the deployment's migration-owner connection (`pnpm --filter @gym/api db:deploy`). It creates three tables and grants their CRUD permissions to the existing `gym_api_service` / `gym_api_runtime` roles when present. On another installation, grant these tables to its runtime role as well. Generate Prisma, deploy the backend and admin dashboard, then distribute the new mobile build. Existing Cloudinary image-storage configuration is reused.

Do not deploy the API against an unmigrated database. A web deployment alone does not update an installed mobile app.

## Verification

Unit coverage checks structured inputs, integer minor-unit prices, Arabic search and explicit gateway routes. Database integration coverage checks visibility for all roles, moderation, ownership, idempotency, stale edits, reporting and concurrent image attachment. The live dashboard test exercises native creation, admin web moderation and shared browsing through the real gateways. Flutter widget tests cover each role's destination and a late search response. Run database/live tests against the disposable CI database only.
