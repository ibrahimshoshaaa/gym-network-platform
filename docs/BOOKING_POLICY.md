# Scheduled bookings and policy (phase one)
Backend endpoints now implement reservation escrow, cancellation, session-bound QR arrival and administrator no-show decisions. Existing walk-in visits are unchanged. Web/mobile screens and a scheduled worker are still pending.

## Policy
GET /booking-policy returns the current policy to authenticated users. Administrators publish POST /admin/booking-policy:
{"expectedVersion":0,"policy":{"graceMinutes":60,"mode":"MANUAL"}}
AUTOMATIC mode adds allocation with traineeBps, gymBps and platformBps totaling 10000 (basis points).
Published policies are immutable, audited and versioned. No defaults are silently enabled.

## Booking
POST /trainee/bookings requires an Idempotency-Key UUID and:
{"branchId":"uuid","scheduledAt":"2026-11-01T18:00:00+02:00","policyVersion":1,"branchPricingVersion":1}
The branch must be active and approved; the trainee wallet must be valid. Points move from TRAINEE_WALLET to BOOKING_HOLD through balanced ledger postings. No gym receivable is created. Future reservations retain the original policy, price and grace deadline.

POST /trainee/bookings/:id/cancel with {"reason":"..."} refunds fully through the inclusive deadline. Later cancellations retain the reason and follow the saved no-show policy.
GET /trainee/bookings processes up to 25 overdue reservations and returns up to 100 most recent own bookings.

## Attendance
POST /trainee/bookings/:id/qr issues a 60-second token during the scheduled arrival window. Tokens are hashed and bound to the authenticated session; renewing invalidates the previous token.
POST /operations/branches/:id/bookings/scan with {"token":"..."} requires authorized gym staff. The scan atomically consumes escrow, creates the active Visit and credits gym receivables at the saved redemption rate. Booking row locks and a unique resolution key prevent repeated or concurrent scans from settling twice. Existing active visits at the same branch block another attendance charge.

## No-show
MANUAL leaves points held with PENDING_REVIEW. POST /admin/bookings/:id/decision accepts reason and allocation. AUTOMATIC allocates according to the saved policy.
GET /admin/bookings/review and POST /admin/bookings/process-due process up to 25 overdue bookings and return up to 100 pending cases. These are authenticated administrator operations.
A scheduled worker is not configured yet: processing currently occurs on list reads, cancellation or explicit processing. Do not claim unattended deadline execution until the worker is integrated.
Whole points use largest remainders, ties favoring trainee then gym then platform. Gym points become receivables; platform-retained points are consumed and recorded on the booking. Refunds do not renew wallet expiry.
Terminal decisions cannot be changed or applied twice. Generic ledger reversals cannot bypass booking rules; post-attendance corrections use settlement review.

## Remaining integration
Reservation/policy/review screens in web and mobile, scan UI routing, notifications, scheduled processing and booking-specific wallet/report labels. Routes are allowed through the web/native gateway; native administrator routing retains its existing restriction.
Database tests cover reservation replay/conflict, full refund, unauthorized actions, concurrent QR scans, manual decisions and automatic gym/platform allocation. Local runtime unavailable; verify GitHub CI before merging or deploying migrations.
