# Durable booking timers (replaces PR #72)

Uses workflow 5.2.2 on Vercel, with managed persisted execution and sleep. No GitHub scheduler, polling, client timer, or continuously running Node process.

Both web and native gateways authenticate before starting a durable parent. The parent exists BEFORE reserving funds, reserves using the existing idempotency key, durably starts an independent deadline child, then returns the normal booking response. A crash after reservation replays the step and continues enqueueing; repeated starts cannot duplicate the booking or settlement.

The child sleeps until the saved deadline plus 1 ms, locks and rereads that exact booking, exits after attendance/cancellation, and applies the original policy snapshot. MANUAL retains held points for review. AUTOMATIC settles the saved allocation. Expiry steps retry up to 20 times; investigate exhausted runs in Vercel Workflows. Outages can delay execution; this is durable scheduling, not a real-time SLA.

No database migration, secret, or APK change. withWorkflow generates internal routes at build. Vercel automatically supplies managed storage, queues and authentication. The project must expose System Environment Variables (VERCEL_DEPLOYMENT_ID at build/runtime); Workflow usage is subject to plan limits/pricing.

After deployment, use the web admin button “جدولة الحجوزات الحالية” once (POST /admin/bookings/process-due). It durably schedules all existing RESERVED bookings in cursor-paged batches and preserves the original response. Safe to repeat. New bookings are scheduled automatically. On-read processing remains a recovery fallback.

The database regression tests exercise future-booking preservation and deadline processing without list reads, manual holds, saved allocation and repeated/concurrent settlement. Local browser CI sets WORKFLOW_LOCAL_BASE_URL for its disposable workflow backend.

The user will follow GitHub checks themselves. Do not claim CI, deployment, or durable execution passed until observed. After deployment verify a parent and an expired deadline child with the client closed. Existing bookings require the one-time admin action above.
