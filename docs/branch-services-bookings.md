# Branch services and multi-service bookings — agreed scope, 2026-10-22

Status: implementation plan; no production migration or booking behavior changed by this preparation commit.

## Confirmed behavior
- Each branch offers multiple services, each with its own points price and duration. Prices require platform administration approval before publication.
- Public cards display the lowest available approved service price using “تبدأ من”.
- A booking selects one or more services; durations and points add together into one consecutive session.
- Capture service names, approved prices, durations and applicable booking policy when booking; subsequent changes do not rewrite existing bookings.
- The trainee chooses a start within branch opening hours. Scheduled end must fit inside opening hours, including intervals crossing midnight.
- Reserve points at booking; they are unavailable to the trainee and not yet payable to the gym.
- Cancellation strictly before the grace deadline returns all reserved points.
- At or after the deadline, an unconfirmed booking becomes no-show and follows its captured settlement policy.
- Confirm attendance by scanning the correct branch's fixed QR from the selected booking and checking fresh geolocation against the branch position server-side.
- Early arrival is allowed during opening hours. Actual attendance starts the service duration; actual session end is capped by branch closing time.
- Attendance during the late grace period similarly starts duration from actual arrival, capped by closing time.
- Walk-in uses the same service selection and booking flow with a current start time.
- Never settle, refund or record attendance twice; attendance, cancellation and no-show compete through atomic state transitions.
- Existing personal trainee QR entry must remain available until its role in the new flow is explicitly replaced, with no accidental double charge.
- Marketplace uses phone/WhatsApp contact only. No new implementation of payment gateways, OTP or technician accounts in this work.

## Delivery sequence
1. Branch service catalog and versioned price approval.
2. Service selection, opening-hour validation and immutable booking snapshots.
3. Fixed branch QR, geolocation and attendance.
4. Automatic no-show settlement and financial/reporting integration.
5. Mobile and admin interfaces, concurrency/database tests and complete end-to-end testing.

## Test isolation
- Keep work on codex/branch-services-bookings.
- Its base includes the user-tested PR #79 head; PR #79 is still unmerged into main.
- Codemagic gymbank-api uses a throwaway local PostgreSQL instance, never a production DATABASE_URL.
- An isolated Neon branch is required before any persistent preview migration. No production schema changes are authorized by CI.
- Run gymbank-api for API/ledger checks and gymbank-android for mobile validation and installable artifacts.
- Changes to the booking protocol must retain compatibility with the installed app or require an explicit versioned rollout.
