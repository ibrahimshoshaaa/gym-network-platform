# GymBank

Multi-gym visits, trainee points and gym settlements. ShoTech Solutions.

## Project status — 26 October 2026

**Implemented MVP in testing:** the web/API is deployed and signed Android APKs are available. Flutter screens serve trainees, gym owners, branch managers and cashiers. iOS simulator builds, unsigned device Release compilation and simulator startup checks pass; signed iPhone distribution and store publication remain separate release steps.

The latest merged application changes are [#93](https://github.com/ibrahimshoshaaa/gym-network-platform/pull/93) (platform-only points and TextBee), [#94](https://github.com/ibrahimshoshaaa/gym-network-platform/pull/94) (short Arabic OTP messages), [#95](https://github.com/ibrahimshoshaaa/gym-network-platform/pull/95) (staff password recovery) and [#96](https://github.com/ibrahimshoshaaa/gym-network-platform/pull/96) (transparent raised-QR navigation).

| Area | Current implementation |
| --- | --- |
| Authentication | Phone + password; real SMS verification through server-side TextBee; duplicate registration rejected before sending; password recovery for active trainees, owners, managers and cashiers with existing passwords. Platform admins retain separate recovery. |
| Trainee points | Only the platform sells/credits trainee points after receipt approval. Optional welcome points are controlled by the platform and granted once at registration. |
| Gym finances | Visit receivables, settlements and withdrawal requests. Gym point purchases, stock sales and branch inventory transfers are retired. Original financial records remain in a sealed archive; former inventory ledger accounts are frozen and excluded from spendable points. |
| Visits and bookings | Branch/service selection, held booking points, QR attendance, walk-ins, arrival windows, cancellations and durable no-show review scheduling. |
| Mobile experiences | Native role-specific screens, remembered sessions, wallet/recharge, nearby directory/map, visit history and ratings, account/password management. Raised QR button with transparent headroom. |
| Shared services | Marketplace listings/reporting/moderation, maintenance tickets, campaign carousel, and service charges owed by gyms. |
| Account deletion | Android/iOS confirmation and external web entry; settlement blockers, identity/content erasure and queued remote-media cleanup. |
| Platform dashboard | Onboarding and price reviews, trainee topups, welcome-point settings, withdrawals, account-deletion reviews, moderation and reports. |

### Run and download

- Web/API: https://gym-network-platform.vercel.app
- [Android release downloads](https://github.com/ibrahimshoshaaa/gym-network-platform/releases/tag/mobile-v0.2.7): choose `app-arm64-v8a-release.apk` for most current Android phones. APKs use the permanent GymBank signer and increasing version codes. The release tag is reused; asset timestamps identify the latest upload.
- The APK built from `18dd769` includes the QR transparency fix. Updating the server does not update an installed Flutter app; install the newer APK for mobile UI changes.
- iOS: [build and signing instructions](docs/codemagic-ios.md). A simulator ZIP or unsigned Release cannot be installed on a physical iPhone.

See [removal of the former gym point-commerce implementation](docs/2026-10-26-remove-gym-point-commerce.md) for schema cleanup and financial-record preservation.

### Verification and remaining release work

The latest application revision passed 120 Flutter tests, Android analysis, iOS simulator/device compilation and simulator startup, plus API, PostgreSQL ledger/permissions/session tests and web integration checks in GitHub Actions. Automated SMS tests use a synthetic transport; handset receipt has also been tested manually, but delivery still depends on the sending phone, SIM and carrier.

Public store release still needs Apple signing/TestFlight and real-device acceptance, store listings/privacy declarations, and the owner's approved privacy/retention/support details. Confirm carrier delivery and operational settlement/deletion review procedures before public rollout. Implemented features and passing CI do not establish store approval or full production acceptance.

## Current business rules and guides

The [25 October platform-only points decision](docs/2026-10-25-platform-only-points.md) supersedes earlier gym stock/resale/transfer specifications. The [TextBee guide](docs/2026-10-25-textbee-otp.md) supersedes earlier fixed-code-only authentication notes. Some older feature documents describe historical behavior; use these decisions and the current implementation when they conflict.

- [Mobile application](apps/mobile/README.md) and [web dashboard](apps/web/README.md)
- [One-project Vercel deployment](docs/VERCEL_DEPLOYMENT.md)
- [Gym management](docs/GYM_MANAGEMENT.md), [service bookings](docs/service-selection-bookings.md), [branch QR attendance](docs/branch-qr-attendance.md) and [durable booking timers](docs/DURABLE_BOOKING_TIMERS.md)
- [Trainee wallet](docs/TRAINEE_WALLET.md), [directory](docs/TRAINEE_DIRECTORY.md) and [withdrawals](docs/WITHDRAWALS.md)
- [Marketplace](docs/marketplace.md), [maintenance](docs/maintenance.md), [service debts and ads](docs/service-debts-and-ads.md) and [account deletion](docs/account-deletion.md)
- [Ledger foundations](docs/LEDGER_FOUNDATION.md), [reports](docs/REPORTS.md) and [Android signing](docs/2026-10-20-android-signing.md)

## Tech stack

- API: Node.js 22+, Fastify and TypeScript compiled to JavaScript.
- Database: Neon PostgreSQL; Prisma and direct SQL for financial operations.
- Web: Next.js/React, Arabic RTL CSS, Lucide and Leaflet.
- Mobile: Flutter 3.47.7/Dart, shared Android/iOS screens.
- Hosting: web and embedded API in one Vercel project; Cloudinary for media.
- SMS: TextBee on the server; an online Android sending phone supplies the SIM.

## Local development

Requires Node.js 22+, pnpm and a separate development PostgreSQL database.

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
# Configure the development DATABASE_URL and required server settings.
pnpm --filter @gym/api db:generate
pnpm --filter @gym/api db:migrate
pnpm --filter @gym/api dev
```

Standalone API health: `GET http://localhost:4000/health`. Deployed embedded API health: `GET /api/health`.

For the dashboard, copy `apps/web/.env.example` to `apps/web/.env.local`, configure either the embedded API or the standalone development API as described in [deployment](docs/VERCEL_DEPLOYMENT.md), provision an administrator using [dashboard setup](docs/WEB_DASHBOARD.md), then run:

```bash
pnpm --filter @gym/web dev
```

Apply reviewed migrations explicitly before deploying code that requires them; Vercel builds do not migrate the database. Use a restricted runtime database role. Database integration tests require a disposable local `gym_ci` or `gym_test` database, never the live database.

## Branches and credentials

`main` contains merged application changes and triggers deployment/mobile builds. `develop` is available for development integration; target the intended integration branch explicitly when opening a feature PR.

Never commit `.env` files, database URLs, TextBee/OTP secrets, Cloudinary credentials or signing keys. There are no default administrator credentials.
