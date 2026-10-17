# Gym Network Platform

Multi-gym visit and points platform. ShoTech Solutions.

**Status:** early engineering scaffold. Not production-ready; do not process real payments, customer data, or visits until security and financial controls have been reviewed and tested.

## Branches

- `main`: reviewed/stable changes.
- `develop`: development integration.
- Feature branches should target `develop`.

## Tech stack

- API: Fastify + TypeScript
- Database: PostgreSQL + Prisma
- Dashboard: Next.js (Arabic operations UI)
- Mobile: Flutter (planned)

## Start the API

Requires Node.js 22+, pnpm and a PostgreSQL development database.

```bash
corepack enable
pnpm install
cp apps/api/.env.example apps/api/.env
# Configure a local/test DATABASE_URL in .env
pnpm --filter @gym/api db:generate
pnpm --filter @gym/api db:migrate
pnpm --filter @gym/api dev
```

Health check: `GET http://localhost:4000/health`

The API exposes public health, trainee password registration/login, and
session-authenticated `/me`, password change and logout. Email/phone verification
is deferred by the project owner; see [password auth](docs/PASSWORD_AUTH.md).
Gym/branch onboarding, staff invitations and approved pricing are described in
[gym management](docs/GYM_MANAGEMENT.md). The Arabic web dashboard now includes
admin settings/reviews, gym/branch management, scoped staff invitations and owner
branch-stock requests; see
[dashboard setup](docs/WEB_DASHBOARD.md). Mobile UI remains planned.
Admin pricing, InstaPay/wallet receiver settings, private Cloudinary receipts and
manual trainee/branch topup approval are described in [topups](docs/TOPUPS.md).
Cloudinary needs server credentials; the real provider has not yet been verified.
Cashier stock sales and QR visits with hosting-gym receivables are implemented;
see [cashier and visits](docs/CASHIER_VISITS.md). Visit cancellations, reviewed
corrections and manual withdrawals are implemented; paid-out clawback/refund
policy remains open. Scoped [reports and monitoring](docs/REPORTS.md) and
[branch inventory transfers/history](docs/BRANCH_INVENTORY.md) are available. Internal ledger,
stock-transfer and authorization foundations are described in
[`docs/LEDGER_FOUNDATION.md`](docs/LEDGER_FOUNDATION.md), including migration,
testing and rollback instructions. See also `docs/ARCHITECTURE.md` and
`docs/BUSINESS_RULES.md`.

Never commit .env files, phone OTP secrets, or payment credentials.


## Run the dashboard

Configure `apps/web/.env.local` using `apps/web/.env.example`, provision the first
admin as described in [dashboard setup](docs/WEB_DASHBOARD.md), start the API, then:

```bash
pnpm --filter @gym/web dev
```

No hosted deployment or default admin credentials are included.

Trainees can use the temporary web wallet/QR panel and the
[participating branch directory](docs/TRAINEE_DIRECTORY.md); Flutter remains planned.

Visit cancellation, correction reviews, safeguards and remaining policy decisions: [docs/OPERATION_REVIEWS.md](docs/OPERATION_REVIEWS.md).

Gym withdrawal reservation, manual proof, business calendar and remaining settlement policies: [docs/WITHDRAWALS.md](docs/WITHDRAWALS.md).
