# Service debts and service-linked advertisements

Development branch: `codex/service-debts-and-ads`. Do not merge until Codemagic database/Flutter checks and device acceptance pass.

Amounts are integer piasters, separate from trainee points and gym point inventory.

- Maintenance: the final, approved-ceiling amount becomes a charge atomically with the owner's/delegated manager's completion confirmation. Earlier review, quotations, rejection, reopening and cancellation do not charge.
- Advertisements: accepting the fee creates one charge for the campaign, effective at the accepted start time. A future campaign withdrawn or paused before that time voids its uncollected scheduled charge. After the start time, stopping the campaign does not automatically refund its accepted fee. A billed campaign cannot be requoted; create a new campaign instead.
- Existing completed repairs and accepted ads are not back-billed. Existing reserved withdrawals are not rewritten.
- New withdrawal requests first offset due charges from unreserved available money, then reserve only the requested net payout. Outstanding debt carries forward; points, reserved payments and disputed balances are never used. If the new payout cannot be reserved the entire command rolls back, including the proposed fee offset. Cancelling a successfully reserved payout releases its payout reserve, not already settled fees.
- Charge and collection identity are separate. Unique source keys, serializable transactions, the shared gym allocation lock, immutable collection records and deferred ledger/amount checks prevent duplicate collection. The generic adjustment reversal cannot reverse a service collection.
- Fee offsets allocate against branch earnings in deterministic order; the branch withdrawal attribution subtracts those allocations. Legacy/unattributed earnings remain distinct.

Owner mobile finance shows gross unreserved funds, due debt, future scheduled debt, net withdrawable funds and itemized total/collected/outstanding amounts. Admin gym balances and withdrawal details show debt and net amounts. No bank transfer is performed by the fee offset.

New service-catalog branch ads select a currently approved service. Legacy branches and existing ads remain supported. Eligibility uses the service catalog instead of requiring an old visit price. The nearby card opens the booking flow with that service selected; booking still fetches current approved prices and durations.

Home offers rotate every four seconds and pause while the app is backgrounded. Market review, maintenance and promotion statuses appear in the existing in-app notification feed with scoped destinations. This does not add OS push notifications.

Migration: `202610220004_service_charges`. Applied only to the existing isolated test database during implementation. Production is unchanged by this branch.

Validation: run `gymbank-api` then `gymbank-services-debt-preview` on this development branch in Codemagic. The APK uses the existing approved isolated test alias; verify it points to this branch's READY deployment before testing. Preflight requires the new service-charge route to exist. The permanent signing identity and shared monotonically increasing version code remain unchanged.
