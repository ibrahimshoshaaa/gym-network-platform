# Mobile parity, delegation, branch withdrawals and campaigns

## Delivery

The consolidated change includes the native staff/topup improvements from #49, web parity from #50, server delegation and financial attribution from #51, native management from #52, and campaigns from #53. No production campaigns are seeded or published.

## Deployment sequence

1. Verify the final commit's API, PostgreSQL, web/browser and Flutter checks.
2. Create a restore branch of the **actual live Neon branch** before changing schema. The live database is `gym_network` on development (`br-withered-term-bavycq78`), not the empty default branch. Use the migration role and never log connection credentials.
3. Apply these exact committed migrations, in order, with Prisma migration checksums recorded:
   - `202610200004_staff_delegation`
   - `202610200005_branch_withdrawal_allocation`
   - `202610200006_campaigns`
4. Verify the runtime role can access the new tables, old wallet/finance reads still work and existing ledger totals have not changed. No point, money, visit or withdrawal rows should be reset or created for verification.
5. Merge/deploy the reviewed code only after schema readiness, then verify authentication, balances and empty campaign delivery. Build the new Android APK from that main commit.

These migrations add tables/columns and widen the withdrawal scope constraint without moving points or money. Existing assignments retain their original cashier/manager operational rights; additional delegation starts empty. Roll back application code if necessary; do not delete allocation history or reverse ledger entries as a deployment rollback.

## Authority

Only the actual gym owner can grant/revoke versioned delegation. Manager membership must remain active in the gym; branch grants additionally require active manager membership in that branch. Full gym delegation gives operational owner-equivalent access without ownership transfer or the right to grant delegation. Limited cashier management cannot create or disable manager assignments. Invitation acceptance rechecks the creator's current authority.

Transfers require access to both branch endpoints; central reserve access additionally requires gym-wide authority. Branch requests are capped by their entitlement and the actual gym ledger balance. Every financial mutation keeps the original idempotency behavior.

## Monetary attribution

The existing consolidated, reconciled gym money ledger remains authoritative. Immutable withdrawal allocations attribute each new reservation to branch earnings or an explicitly unattributed adjustment/legacy pool. Owner and manager requests use the same serializable allocation lock. Cancel/reject releases attribution through withdrawal status, without deleting history or deducting money again.

Old withdrawals with allocationVersion=0 are not guessed or rewritten. Their committed amount conservatively reduces branch availability until reconciliation. Branch managers cannot see another branch's withdrawal details, global balances or proof through a scoped permission. Proof access rechecks live authority. Approval rechecks the requestor's current scoped rights and the active gym.

## Campaigns

Only platform admins manage campaigns and image uploads. Delivery checks publication status, server time, channel, placement and audience; account and gym targeting intersect. Internal destinations are allowlisted. Pausing or expiry removes delivery; read markers use campaign version. Ads load independently of primary account data and fail quietly. Campaign management and delivery use no-store responses.

Notifications use the existing in-account feed on web/mobile. Device push outside the app is not configured by this change and requires a separate push-provider integration. No broadcasts have been sent to real users.
