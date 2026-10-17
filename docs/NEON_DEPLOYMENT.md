# Neon API and Vercel dashboard

The dashboard stays a Next.js server application on Vercel (`apps/web`). It
keeps bearer sessions in private cookies and calls the API from its server.
The API has two entrypoints: `server.ts` for TCP/local development and
the deployment builder's default export using `neon.ts` for the Neon Functions
Web Request/Response runtime. Both use the
same Fastify routes, authorization, Prisma schema and financial services.

## Transport and secrets

The Neon entrypoint requires `API_ORIGIN_SECRET` (at least 32 random bytes).
Vercel must have the same **server-only** value. It sends
`x-gym-origin-secret` independently of the user's Authorization bearer.
Missing/incorrect credentials return 401 before reading bodies or querying
Postgres. The secret is stripped before Fastify logs or business handlers.
Do not use `NEXT_PUBLIC_` variables, client-side Function calls or browser CORS.

The API ignores incoming IP/forwarding claims. Existing IP throttles share a
conservative transport-wide key on Neon; identity/user throttles still apply.
This can limit several legitimate users together. Per-client IP limits need
a verified trusted edge contract before a customer rollout; adding arbitrary
`X-Forwarded-For` trust is not a fix. The native Function URL still consumes
invocations before returning 401; this check is not an upstream WAF.

## Build a deployable archive

Run `pnpm build:neon` after the frozen-lockfile install. CI does this after the
existing API/database/dashboard tests, then uploads `gym-api-neon` for seven
days. The script generates a separate Prisma JavaScript engine client with
the matching-version `@prisma/adapter-pg` and a small pg pool, bundles the
application, and installs sharp's ARM64/glibc addon. The native Rust engine
plus libvips would exceed Neon's compressed size limit. The TCP app and
migration client stay unchanged. CI also runs a serializable transaction and
advisory-lock smoke check using the JS adapter and restricted role. It verifies ELF
architecture and Neon's 10 MiB compressed / 64 MiB expanded / 4096-file limits.
No credentials belong in the archive. Build output is ignored by git.

The archive root contains `index.mjs`; use runtime `nodejs24`. A successful
build is not proof of a live deployment. Invoke the real Function after deploy
to verify both Prisma and sharp load on the service runtime.

## Database preparation

Use the isolated Neon development branch first. Run the **existing Prisma
migrations**, including their hand-written ledger triggers, with a direct
migration-owner `DATABASE_URL`:

```sh
pnpm --filter @gym/api db:deploy
```

Do not use `db push`, synthetic migration-history inserts, the runtime role,
or the unrelated Auraic / golden-gym projects. Use a machine with network
access to the project's Postgres endpoint. The agent's current execution
environment cannot resolve that endpoint, so migrations have not yet run.

After migrations, create a separate login role with only CONNECT, schema
USAGE and table SELECT/INSERT/UPDATE/DELETE plus sequence USAGE/SELECT. It
must not own tables or have CREATE, TRUNCATE, superuser, replication,
role-management or trigger-bypass privileges (including inherited Neon
administrator membership). Exclude `_prisma_migrations` from its grants.
Verify these effective privileges before deployment. Repeat grants after
future migrations; do not grant the application migration-owner credentials.

## Deploy and connect

Deploy the reviewed archive to the intended development branch first, with:

| Function environment | Purpose |
| --- | --- |
| `NODE_ENV=production` | Runtime behavior |
| `DATABASE_URL` | **Restricted runtime role**, pooled URL, small connection limit |
| `API_ORIGIN_SECRET` | Random server-hop credential shared with Vercel |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Private receipt adapter; omit until configured |

Neon's automatically injected database URL can use an owner role. Override it
explicitly with the restricted role URL. Keep the direct owner URL solely in
the local migration environment. Keep secrets in ignored env files/platform
secret settings; never paste them in chat, job inputs, code or build logs.

On Vercel set `API_INTERNAL_URL` to the actual Function HTTPS origin,
`API_ORIGIN_SECRET` to the matching secret, and `WEB_ORIGIN` to the exact
dashboard HTTPS origin (no path). Redeploy after changing environment values.
The Vercel project root is `apps/web`, framework Next.js, build `pnpm build`.
Cloudinary credentials belong only to the API Function, not Vercel or SQL.

Check unauthorized calls return 401, authenticated transport `/health` returns
200, and protected routes still require a valid user bearer. Verify account
registration/login, restricted-role transactions and private receipt upload
through the real dashboard before declaring the platform operational.
No initial admin, pricing policy or payment destination is seeded automatically.
