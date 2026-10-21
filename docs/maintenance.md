# Maintenance, phase one

Mobile entry points: the wrench action in the gym workplace header and Maintenance in the workplace account menu. Owners, branch managers and cashiers can report equipment faults for branches they currently manage or are assigned to. Trainee accounts have no maintenance destination; a trainee with a live gym assignment can use it in workplace mode.

A request records its branch, equipment, fault description, contact number and up to six optional photos. The branch is fixed after images are attached to the draft. Users browse their authorized branches, filter by branch/status, paginate, refresh and open a complete event history.

The platform administrator handles requests only through the web dashboard, under Requests → Maintenance. No customer/staff web portal is added and no technician app is introduced. Admin records the assigned technician, phone, visit appointment, estimate, work performed and final cost. Payment and delivery arrangements remain outside the app; maintenance never posts point or money ledger transactions.

## Workflow and authority

- NEW → REVIEWING is optional; an administrator can send the first quote directly.
- QUOTE supplies a technician, contact number, appointment and estimated cost; the request waits in AWAITING_APPROVAL. A new quote resets the previous approval and pauses work.
- Only the current gym owner or a manager with current full gym/branch delegation can approve a quote. Cashiers and undelegated managers can report and follow faults but cannot approve expenses or confirm receipt.
- Approval of the first quote moves to SCHEDULED. The appointment must still be in the future. Admin starts IN_PROGRESS and records work and the final price, then waits in AWAITING_CONFIRMATION.
- The final price cannot exceed the approved estimate. For an increase during work, admin sends a revised quote; approval resumes IN_PROGRESS. Work cannot be recorded as finished until the increase is approved.
- An authorized gym approver confirms receipt to reach COMPLETED, or records why the fault remains to return to IN_PROGRESS. Reopening clears the latest final-work fields but keeps their previous values in the event history.
- Owners/delegated approvers may cancel before work begins, with a reason. Admin may cancel unfinished requests with a reason. Completed/cancelled requests are terminal.

Authorization uses live ownership, staff assignments, delegation and account/gym/branch status. A global role label grants no branch access. Full-gym delegation requires an active manager assignment at that gym; full-branch delegation additionally requires the manager assignment on that branch. Revocation immediately removes access/approval rights.

## Consistency and safety

Creation has a per-actor idempotency key. Changes require an expected version and run in serializable transactions with a request-row lock. Every transition adds an event and audit entry in the same transaction; competing decisions cannot both succeed.

Photos are uploaded as raw JPEG/PNG/WebP, decoded and re-encoded by the existing image pipeline, capped at 4 MiB/request and six attachments/request. Each belongs to the uploading actor and branch and can be attached to one request only. Arbitrary image URLs and cross-branch/actor attachments are rejected. Upload/create rate limits apply. Unattached uploads are not shown in request feeds; provider lifecycle cleanup can be added separately.

Costs use integer piasters, serialized as decimal strings. The database enforces known statuses, bounded nonnegative costs, quote/approval prerequisites, the final-cost ceiling and completion confirmation metadata.

## Rollout and verification

Apply `202610210002_maintenance` with the migration-owner connection before deploying this API (`pnpm --filter @gym/api db:deploy`), regenerate Prisma and deploy the backend/admin dashboard. The migration creates MaintenanceRequest, MaintenanceImage and MaintenanceEvent, including grants for the existing gym_api_service/gym_api_runtime roles. Install the new mobile build; deploying the web dashboard does not update an installed app.

Tests cover command boundaries, role/branch/delegation access, revocation, idempotency, attachments, concurrent decisions, estimate increases, reopening, cancellation, receipt confirmation and unchanged ledger counts. The dashboard live test exercises native creation, admin web quote/start/finish and mobile approval/confirmation through the actual gateways. Flutter tests exercise narrow workplace screens and capability-controlled approval.
