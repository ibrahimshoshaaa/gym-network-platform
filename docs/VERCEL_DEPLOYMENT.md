# One Vercel project

The existing `gym-network-platform` Vercel project keeps root `apps/web`.
Next.js builds `@gym/api` as a workspace dependency and invokes Fastify in
process from its existing server-only gateway. There is no public raw API,
second Vercel project or HTTP hop. Existing cookies, CSRF, route allowlists,
authorization, binary receipt handling and CSV responses remain in place.

Set server environment variables on that project:

- `GYM_EMBEDDED_API=true`
- `DATABASE_URL`: restricted Neon application role, pooled URL, small connection limit
- `WEB_ORIGIN=https://gym-network-platform.vercel.app`
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` for receipts

`API_INTERNAL_URL` and `API_ORIGIN_SECRET` are not needed in embedded mode.
Without embedded mode, the standalone API development workflow is preserved.
Build: `pnpm build` from `apps/web`; prebuild generates Prisma and builds API.
The database migrations are never run as part of a website build.

Use the isolated Neon development database until the deployment and financial
flows have been reviewed. No administrator or payment settings are seeded.
The health endpoint is `GET /api/health`; it does not query the database.
Vercel request/response limits still apply (including 4.5 MB payloads).
Receipt clients must stay below that platform limit; direct signed uploads
would require a separate upload design.

The dashboard HTTP integration test runs through the embedded Fastify API and
restricted disposable PostgreSQL, including authentication and authorization.
