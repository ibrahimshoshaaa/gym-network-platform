# Fixed branch QR attendance

Development branch: codex/branch-qr-attendance.

Authorized owner, manager or cashier displays one stable reception QR through POST /operations/branches/:id/entry-qr. Repeating it returns the same code. Owner/manager can rotate it using expectedVersion; cashier cannot rotate.

Trainee opens an owned reservation and scans/pastes the reception code, then obtains fresh high-accuracy location. Pasting never bypasses location verification. The backend checks ownership, matching active branch/gym/owner, current QR, grace deadline and opening window. Existing session duration/capping rules remain.

Presence defaults: radius 150 meters, accuracy at most 50 meters, reading age at most 60 seconds, future skew at most 10 seconds. Reported mock positions fail. These checks reduce remote misuse; they do not prove a device is uncompromised.

The booking row lock and existing idempotent settlement key prevent duplicate visits or transfers and serialize cancellation with attendance. A replay returns the completed owned booking without moving ledgers. The reception QR is a public identifier, not a login credential. Coordinates are validated but not saved in the booking audit.

Service bookings cannot use the legacy staff-scanned QR. Direct legacy visit pricing cannot bypass a branch service catalog; walk-ins select services and book now. Existing branches without a service catalog retain their legacy flow.

Additive migration: 202610220003_branch_entry_qr. Production has not been changed by this development task.

Local verification: API/test and web TypeScript, Prisma validation, location unit tests, gateway tests, Dart syntax. Added disposable PostgreSQL tests for scope, rotation, proximity, repeated attendance and cancellation races; added Flutter widget tests for QR parsing, wrong branch, fresh location and permission failure. Full DB/Flutter execution is required on Codemagic.

Preview: reuse the existing approved test database and public preview alias. The branch-specific DATABASE_URL/WEB_ORIGIN are configured. The migration is applied only on the isolated test database. The shared preview alias must be assigned to the READY deployment of this branch before manual testing; verify the deployment commit each time. Codemagic: run gymbank-api, then gymbank-branch-qr-preview. The APK preflight checks health, database authentication, and the new check-in endpoint before spending build time.
