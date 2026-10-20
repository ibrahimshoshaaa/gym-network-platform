# Web screens aligned to the Flutter implementation

Scope: `apps/web` only. Flutter source and API/database code are unchanged.
Reference: mobile source at main commit `50b9eaa890a87a0c690672e9a609df5070688f94` and the supplied native/web screenshots.

## Screen map

| Flutter screen | Web implementation | Change |
| --- | --- | --- |
| `ui.dart` / `portal_ui.dart` | `portal-ui.tsx`, `portal-parity.css` | Native logical-pixel spacing, cards, typography, buttons, facts, notes and task tiles, with scoped desktop adaptation |
| `trainee.dart` / TraineeHome | `trainee-wallet.tsx`, `trainee-portal.tsx` | Wallet, active sessions, nearby gym link and recent movements in native order |
| WalletHistory / VisitsScreen | `trainee-wallet.tsx` | Separate destinations; native movement/visit cards rather than combining wallet history with visits |
| QrScreen | `operations.tsx` / TraineeQr | Issue on entry, countdown/progress, renew, invalidate in background and renew on foreground |
| DirectoryScreen / BranchDetail | `branch-directory.tsx` | Existing native directory preserved; details now place card → about → map → directions → photos |
| `topup.dart` / TopupScreen | `purchases.tsx` | Separate selection, transfer/upload and explicit review screens, package cards, points/EGP segments and estimate |
| TopupHistory | `purchases.tsx` / TopupHistory | Separate paged request cards, accessible from accounts and recharge |
| `owner.dart` / OwnerHome | `owner-portal.tsx` | Owner balance, tasks and receivables retained in native hierarchy |
| BranchesScreen / BranchForm | `owner-branches.tsx` | Direct branch cards, visit/stock facts, operate/transfer actions and collapsed management actions |
| StaffScreen / InviteStaff | `owner-branches.tsx` | Branch-scoped staff cards, invitation, access toggle and existing delegation screen |
| OwnerReport | `owner-inventory.tsx` / NativeReport | Visit/sale tabs, 30-day period and record cards with branch context |
| `inventory.dart` | `owner-inventory.tsx` | Central owner balance, branch balances, transfers in all three directions and transfer history |
| `money.dart` / MoneyScreen | `withdrawals.tsx` | Available-balance hero, separate reserved/disputed/paid facts, request list |
| WithdrawalForm | `withdrawals.tsx` | Details → review → explicit confirmation, with available-balance validation |
| `operations.dart` / OperationsHome | `operations.tsx` / Cashier | Per-branch cards and native visit/sale task tiles |
| BranchDashboard / StaffWorkplace | `branch-home.tsx`, `staff-portal.tsx` | Shared branch dashboard, quick actions, daily facts, delegated tasks scoped to selected branch |
| BranchSale / RecordVisit | `operations.tsx` | Only current workflow stage shown, keeping API quote/confirmation boundaries |
| BranchRecords | `operations.tsx` | Fetch only selected record kind, expose date/end time and existing cancellation/review actions |
| `account.dart` / AccountScreen | `portal-account.tsx` | Trainee dark profile; work-role white centered profile; functional notifications, security and support entries |
| NotificationsScreen / SupportScreen | `updates.tsx`, `support.tsx` | In-app notification and support hierarchy; full-height mobile dialogs |
| Profile/password/invitation/detail forms | scoped native modal styles | Pushed-screen presentation on mobile; existing admin presentation remains scoped separately |

## Financial and access behavior

- Owner topups use `receivingGymId`; explicit branch topups still accept `receivingBranchId`.
- Quote selection is snapshotted before transfer/review, and final writes use the financial-command idempotency mechanism.
- Estimates use integer piasters and the same floor/ceil rules as Flutter; the API quote remains authoritative.
- Stock transfers map the owner balance to `null` branch IDs as the existing API expects.
- No real financial operation or production data mutation was used for verification.

## Verification

- TypeScript and existing web unit/security tests are run locally.
- `test/topup-estimate.test.ts` covers Arabic digits, discounts, piaster rounding and quantity limits.
- `test-ui/portal-parity.test.mjs` covers mocked trainee/owner/cashier navigation, financial review boundaries and horizontal overflow at mobile/desktop sizes. It requires a running local web server and an installed Playwright Chromium:

```sh
# Terminal 1: start apps/web development server on port 3110.
# Terminal 2, from apps/web:
node --test test-ui/portal-parity.test.mjs
```

Browser execution and pixel-level visual approval are still pending: this environment has no Chromium binary, and the browser download returned invalid archives. The browser suite was added but must not be reported as passed until it runs successfully. Source alignment and successful compilation do not prove pixel-perfect rendering.
