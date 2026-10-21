# Scheduled no-show processing

`.github/workflows/booking-expiry.yml` runs on main at minutes 2,7,12,…57 each hour (UTC), also manually through Actions, and once when this workflow is merged. It POSTs to the production `/api/internal/bookings/process-due` endpoint. No trainee/admin app needs to be open, and no database migration, APK, admin password or new secret is required.

## Timing and operations

The deadline remains the appointment plus the saved grace period. Processing is eventually executed on the next scheduled invocation; GitHub Actions can queue, delay or drop scheduled runs. This is not an exact-deadline SLA. Missed runs catch up using database deadlines, never the runner's local clock. Runs consume the repository's Actions allowance and stop if Actions is disabled or its quota/spending limit is reached. Monitor the “Process overdue gym bookings” workflow; failed or backlog-limited invocations are visible as failed runs. A dedicated scheduler is preferable if exact minute-level operational guarantees become required.

Each request handles at most 25 overdue reservations in separate serializable transactions, within a bounded time budget. The workflow drains up to ten batches. An individual error rolls back that booking and returns a failure; subsequent runs retry it. Transaction row locks and the existing unique booking-resolution ledger key prevent duplicate settlements or races with cancellation/attendance/read-triggered processing. Future reservations are untouched. The original booking policy snapshot determines AUTOMATIC distribution versus PENDING_REVIEW, which retains held points for an administrator. Scheduled audit entries attribute execution to the original policy author and explicitly name the scheduler.

## Authentication

The job has only `id-token: write`; it does not check out code or store static credentials. It requests a short-lived GitHub OIDC JWT for the exact endpoint audience. The server verifies its RS256 signature against GitHub's fixed JWKS URL and checks issuer, expiration/not-before/issued-at, immutable repository and owner IDs, repository name, main ref, exact workflow path and permitted event. Forks, PR runs, ordinary sessions and arbitrary bearer tokens cannot invoke the worker. The API/web/mobile gateway allowlists do not expose this route. Tokens, booking details and trainee information are never printed by the workflow.

On merging: confirm production deployment succeeds, then confirm the push-triggered worker succeeds (it retries briefly while deployment catches up). After deployment verify a subsequent schedule-triggered run succeeds. If needed choose Run workflow on main. The existing on-read processing remains a fallback. No production data was modified during development; tests use disposable PostgreSQL and locally signed synthetic identity tokens.
