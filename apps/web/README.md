# GymBank web dashboard

**Status — 26 October 2026:** implemented Next.js/React application, deployed with the Fastify API inside the same Vercel project. The dashboard is no longer a planned scaffold.

## Implemented areas

- Arabic RTL platform administration: gym/branch onboarding, service/price reviews, trainee receipt topups, welcome-point settings, withdrawals and reports.
- Gym-owner, branch-manager, cashier and trainee web experiences with server-enforced role/scope permissions; the Flutter app also provides native role-specific screens.
- Phone/password authentication with TextBee SMS verification and password recovery; duplicate signup checks happen before SMS sending. Platform-admin recovery remains separate.
- Wallet/directory, services/bookings, QR attendance, visit history/ratings, support and notifications.
- Marketplace moderation, maintenance, campaigns/service debts and account-deletion reviews; external `/delete-account` entry.
- Current points model: only the platform sells/credits trainee points. Gyms receive visit entitlements and settlements; stock purchases/sales/transfers are retired.

See the [root project status](../../README.md), [current financial model](../../docs/2026-10-25-platform-only-points.md), [TextBee setup](../../docs/2026-10-25-textbee-otp.md), [dashboard setup](../../docs/WEB_DASHBOARD.md) and [embedded Vercel deployment](../../docs/VERCEL_DEPLOYMENT.md).

## Development

```bash
# From the repository root, after installing dependencies:
cp apps/web/.env.example apps/web/.env.local
# Configure the development API/embedded mode and server-only credentials.
pnpm --filter @gym/web dev
```

The production Vercel root is `apps/web`. Its build generates Prisma, compiles the API and builds Next.js. Migrations run separately; they are not part of the website build. No default administrator credentials are supplied.

Web verification includes TypeScript checks, gateway/security tests, build checks and a browser → gateway → API → disposable PostgreSQL integration flow. API/database secrets remain server-only; never place them in `NEXT_PUBLIC_` variables.
