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
- Dashboard: Next.js (planned)
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

The API currently exposes **only** a public health endpoint. Financial operations, authentication and authorization have not been implemented yet. See `docs/ARCHITECTURE.md` and `docs/BUSINESS_RULES.md`.

Never commit .env files, phone OTP secrets, or payment credentials.
