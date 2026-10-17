# Agreed MVP business rules

These are implementation requirements, **not** evidence of regulatory compliance.

## Roles and access
- Platform admin approves gym onboarding and issues points after manual receipt review.
- Gym owner manages branches, purchases points for a selected branch, and transfers inventory between their branches.
- Manager can cancel an entry within its first 10 minutes, with reason logged; later cancellation requires platform admin approval.
- Cashier may sell points only from their assigned branch's prepaid inventory; sale transfer is immediate once payment is confirmed.
- Updated 17 October 2026: trainee self-registers with name, phone, email and
  password; login accepts email or phone plus password. Contact verification by
  email/phone OTP is postponed, and both contacts remain unverified. See
  [DECISIONS.md](DECISIONS.md) and [PASSWORD_AUTH.md](PASSWORD_AUTH.md).

## Points
- Separate accounts for platform issuance, each branch's point inventory, each trainee's wallet, and consumed/expired points.
- Branch inventories do not expire automatically.
- Trainee wallet points expire 90 days after top-up; successful new recharge renews remaining wallet validity. Expiry and paid-balance forfeiture require legal approval before production.
- Direct gym resale is a **transfer of already issued points**, never a second issuance.
- Cashier and manager cannot directly reverse a points sale. **Every sale cancellation goes through platform admin manual review.**
- No negative inventory/wallet balance or silent mutation.
- A completed visit consumes the configured points **once** while an active session exists; end of session means elapsed duration, not proof the trainee physically exited.

## Money
- Use integer Egyptian piasters in ledgers, not floating-point EGP.
- Example **provisional** commercial rates: 1 point sold to trainee for 100 piasters; gym distributor bulk cost 90 piasters per point; servicing gym earns 80 piasters per point. Exact commercial terms need client approval.
- Servicing gym's monetary receivable is separate from that gym's stock of points for resale.
- Any amount of available gym receivables may be requested for withdrawal. Reserve the requested amount immediately on submission, preventing duplicate requests.
- Manual payout due within **3 business days after acceptance**, subject to documented business-day definition. Set an admin-review SLA before launch.
- Suspected visits freeze only the disputed amount; undisputed funds remain accessible.
- Refunds of paid top-ups are requests subject to a public refund policy.
- Financial reserve/liability management, redemption/expiry treatment, consumer terms and applicable regulation need qualified legal/accounting review.

## Integrity rules required before enabling payment endpoints
1. Each point transaction's postings sum to zero. Same for each money transaction.
2. Posted account balances equal the sum of their postings.
3. Cross-account moves, idempotency record, visit, receivable and wallet adjustments must commit atomically.
4. Every external request has a unique idempotency key; retries return the previously completed outcome.
5. Insufficient balances fail deterministically.
6. A given trainee cannot have concurrent active sessions for one branch.
7. Actor permission and scope are checked server-side on every mutation; admin approval is audited.
8. Never modify or delete a posted ledger entry; corrections are reversing postings with reasons and approvals.
9. Protect receipt files and OTP; implement rate limiting, audit trail, account recovery, staff revocation and fraud signals.

