# Platform administrator web dashboard

The website serves the platform administrator only. Trainee, gym-owner, branch-manager and cashier interfaces are provided by the Flutter app. See the [current web scope](../apps/web/README.md) for navigation and route boundaries.

The platform workspace has dedicated groups for daily reviews, gym management, finance, services, communication, account oversight, and general settings. Pricing, welcome points, payment accounts, packages, booking policy and support contact each have an independent screen and save action. Booking decisions, support conversations, user access, account deletion requests and expired-wallet reviews stay in their operational sections.

## Operator setup

1. Apply the existing migrations and configure the API database. Real Cloudinary
   credentials must be server-side on the API; see [TOPUPS.md](TOPUPS.md).
2. Provision the **first** platform admin with `pnpm --filter @gym/api admin:provision`.
   It reads a JSON object from stdin: `displayName`, `email`, `phone`, `password`
   (15–128 code points). Feed it from a protected input source; do not put secrets
   in command arguments, shell history or Git. There is no default password,
   admin public-signup endpoint, token-paste UI or automatic test account.
   The command refuses any existing platform admin and cannot replace a password.
   An existing identity cannot be silently promoted. No wallet is created.
3. Start API as documented in the root README. In `apps/web/.env.local`, set
   `API_INTERNAL_URL` to the API origin and `WEB_ORIGIN` to the exact browser origin.
   Example local API origin is `http://127.0.0.1:4000`; browser origin is normally
   `http://localhost:3000`. Restart after changing environment variables.
4. `pnpm --filter @gym/web dev` starts the local Next.js dashboard. Sign in as
   platform owner using the account you provisioned. Create gyms and owner invitations from the admin Gym/Branches screen. Owners
   accept the invitation code in the mobile app, add branches and propose visit
   pricing. Admin approves prices and explicitly activates each branch.
5. For deployment, run `pnpm --filter @gym/web build` then `start`, or use the
   Next.js hosting adapter. Both origin variables are required in production.
   Use HTTPS for public origins. API HTTP is allowed only for loopback hosts in
   production, supporting API and web running on the same machine. Never expose
   private API traffic across a network using HTTP. Preview credentials and
   database must be separate from production. The production website and embedded API are deployed in the same Vercel project.

The API now exposes rate-limited `POST /auth/admin/login` for provisioned active
admins only, with eight-hour sessions, dummy KDF for invalid identities and a
transactional credential recheck. Password change supports admins as well as
trainees/staff and revokes all previous sessions. Admin replacement sessions
remain eight hours. Existing seven-day non-admin sessions are unchanged.

## Browser/server boundary

The browser uses same-origin `/api/session`, `/api/logout` and an explicit
allowlist under `/api/backend/…`. The Next server forwards the opaque API token
from an HttpOnly, SameSite=Strict cookie; production uses Secure and the `__Host-`
prefix. Tokens are never returned to browser JavaScript, including password
rotation, and are not stored in local/session storage. Backend authorization
remains authoritative for every operation; menu visibility is only navigation.
The browser gateway additionally requires a current PLATFORM_ADMIN actor on every request, including when an old non-admin cookie is replayed. The native Bearer bridge remains separate. The allowlist is not an unrestricted URL proxy. Browser-supplied Authorization,
Cookie and forwarded client-address headers are not passed to the backend.

Every mutation, including login/logout/upload, checks exact configured Origin;
missing, null and cross-site origins fail closed. Production does not trust a
browser-controlled Host to select its allowed origin. Requests have bounded
streamed bodies (8 KiB JSON / 4 MiB image), bounded query strings, no redirect
following, an upstream timeout, and private no-store responses. No CORS wildcard
or backend credentials are exposed to the client. Cookie renewal is server-side.
Security headers deny framing, objects and external form destinations. Receipt
URLs are requested on demand, use no-referrer and expire after 60 seconds.

Do not log request cookies, sign-in bodies, image evidence or signed receipt URLs.
API rate limiting sees the gateway's network address because this PR does not
trust forwarded IP headers. Its identity/user limits still apply; the IP limit
is therefore shared by clients behind the gateway. Before broader deployment,
configure a trusted ingress/rate-limit design for the actual hosting topology,
rather than trusting arbitrary `X-Forwarded-For` values.

## Validation

CI builds/typechecks API and web, runs API unit and restricted PostgreSQL tests,
web origin/allowlist/body-bound/exact-money tests, and a live HTTP test:
web cookie login → gateway → Fastify → PostgreSQL → owner quote/topup → admin
review → branch balance → gym creation → owner invitation reissue/acceptance →
branch pricing/activation → staff invitation revoke/reissue/acceptance → scoped
assignment disable → password rotation → revoked sessions → logout.
The live test uses synthetic identities and pre-seeded evidence; provider upload
normalization/access is separately tested with an injected storage adapter.
Real Cloudinary connectivity still needs the owner's server credentials.

The managed workspace has no supported browser-control skill, so visual browser
QA is not performed here. No preview server or browser was installed as a
substitute. TypeScript/build, HTTP flows and static accessibility review are
covered; mobile/desktop visual inspection remains before client handover.


Management controls mirror the API status transitions: an owner must accept before
admin activation; branch activation also requires active gym, approved price and
complete location metadata. Owner metadata forms cannot set status or prices.
A pending pricing request does not replace the current approved price. Suspended
or rejected gyms stay readable by their accepted owner but cannot be edited;
unused staff invitations may still be revoked. Price review and branch activation
are separate operations. No destructive delete controls are introduced.
