# Service selection booking slice

Development branch: codex/service-selection-bookings.

Approved services are selected together; the server totals their points and consecutive durations, reserves points once, and captures immutable names, prices, durations, versions and cancellation policy. Scheduled or book-now appointments must fit in versioned daily Cairo opening hours, including overnight windows. Existing staff-confirmed arrival uses the actual start time and caps the end at the saved closing time; early arrival must belong to the same opening window. Cancellation is allowed strictly before the grace deadline.

New branch cards show the minimum approved service price. Branches with no service catalog retain their legacy visit flow; existing bookings are unaffected. Catalog branches cannot use an old client to bypass service selection.

Migration: apps/api/prisma/migrations/202610220002_service_bookings/migration.sql (additive). No production migration applied in this task. Applied and recorded on the existing isolated test branch after user approval.

The next slice adds fixed branch QR scanning by the trainee with fresh geographic proximity verification. This slice retains the current attendance UI and endpoints.

Validation: local API TypeScript checks and unit tests, web types and gateway tests, Dart syntax inspection. Added disposable PostgreSQL financial integration coverage and Flutter interaction tests; execution requires Codemagic. Syntax parsing is not Flutter build/test validation.

Preview DATABASE_URL and WEB_ORIGIN are scoped to codex/service-selection-bookings after user approval. The isolated database migration is applied. The preview alias remains protected by Vercel Authentication; automatic approval review rejected making the new alias public and explicit authorization for that access change is still required. Never substitute production for preview testing. Run gymbank-api on this branch first. The new gymbank-service-bookings-preview workflow checks API/database readiness before building, and must wait until preview access is available.

Acceptance: configure daily hours; approve two services; select both; verify totals; reject sessions ending after closing without reserving points; retry a booking without duplicate escrow; change service prices without changing an existing booking; cancel before grace and verify one full refund.
