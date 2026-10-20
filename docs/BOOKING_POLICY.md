# Booking policy foundation (phase one)
This change adds versioned API configuration only. Scheduled reservations, escrow postings, no-show processing, QR confirmation and web/mobile settings screens are subsequent steps; existing walk-in visits are unchanged.

Authenticated users read GET /booking-policy. Administrators read GET /admin/booking-policy and publish POST /admin/booking-policy with expectedVersion and policy.
Example manual policy:
{"expectedVersion":0,"policy":{"graceMinutes":60,"mode":"MANUAL"}}
Automatic policy adds allocation with traineeBps, gymBps and platformBps totaling 10000. Examples: full trainee refund (10000/0/0), full gym (0/10000/0), trainee/gym (5000/5000/0), gym/platform (0/5000/5000). Values are basis points.
No policy is seeded silently; null means not configured.

Grace ends at scheduledAt + graceMinutes, inclusive for cancellation and arrival. A later cancellation or no-show follows the booking's policy snapshot. Manual mode leaves funds held until an administrator reviews the reason and decides. Automatic mode allocates using its configured ratios.
Whole point splits use largest remainder rounding, with ties favoring trainee, then gym, then platform. No points are lost and zero-share parties receive none.

Published policies are insert-only, audited and protected by a database trigger. expectedVersion plus a transaction advisory lock prevents concurrent lost updates. Future reservations must retain the published policy ID and configuration snapshot; never apply a new policy retroactively.
The future QR flow must validate booking ownership, branch staff permission, time window and booking state, then atomically confirm attendance and settle escrow exactly once.

Validation: node test cases cover deadlines, modes, agreed distributions, rounding, invalid inputs and snapshot isolation. Run API CI (schema validation, typecheck, unit tests, migrations and integration suites) before merge. Execution environment was unavailable when this draft was prepared.
