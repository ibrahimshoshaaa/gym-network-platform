# Service selection booking slice

Development branch: codex/service-selection-bookings.

Approved services are selected together; the server totals their points and consecutive durations, reserves points once, and captures immutable names, prices, durations, versions and cancellation policy. Scheduled or book-now appointments must fit in versioned daily Cairo opening hours, including overnight windows. Existing staff-confirmed arrival uses the actual start time and caps the end at the saved closing time; early arrival must belong to the same opening window. Cancellation is allowed strictly before the grace deadline.

New branch cards show the minimum approved service price. Branches with no service catalog retain their legacy visit flow; existing bookings are unaffected. Catalog branches cannot use an old client to bypass service selection.

Migration: apps/api/prisma/migrations/202610220002_service_bookings/migration.sql (additive). No production migration applied in this task.

The next slice adds fixed branch QR scanning by the trainee with fresh geographic proximity verification. This slice retains the current attendance UI and endpoints.

Validation: local API TypeScript checks and unit tests, web types and gateway tests, Dart syntax inspection. Added disposable PostgreSQL financial integration coverage and Flutter interaction tests; execution requires Codemagic. Syntax parsing is not Flutter build/test validation.

Preview provisioning remains blocked until explicit approval to reuse the existing isolated test database connection in this branch-scoped Vercel preview configuration. Never substitute production for preview testing. The existing services preview workflow still targets its original branch; do not use it to test this branch until preview provisioning is complete.

Acceptance: configure daily hours; approve two services; select both; verify totals; reject sessions ending after closing without reserving points; retry a booking without duplicate escrow; change service prices without changing an existing booking; cancel before grace and verify one full refund.
