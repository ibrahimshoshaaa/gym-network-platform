# GymBank platform administration

The Next.js website is exclusively the **platform administrator** workspace. Trainees, gym owners, branch managers and cashiers use the Flutter mobile application. Their former browser portals, signup, invitations, phone verification, password-recovery and self-deletion pages have been removed.

## Administrator workspace

- Home: live decision queues, setup status and quick actions.
- Requests: topups, gym applications, branch/service prices, booking decisions and operation corrections.
- Gyms: platform management of gyms, branches, staff and media. Invitation codes are copied and accepted inside the mobile app.
- Finance: direct trainee topups, withdrawals, dispute holds and reports.
- Services: maintenance, branch promotions and marketplace moderation.
- Communication: support conversations and campaigns.
- Accounts and oversight: user access, deletion reviews and audit history. Managed users recover passwords through verified-phone recovery in the mobile app.
- Platform settings: separate destinations for pricing, welcome points, receiving payment accounts, point packages, booking policy and support contact.

Each destination has a shareable `?section=` URL and supports browser Back/Forward. General settings are separate from daily request queues, and forms retain version checks and independent saves.

## Access boundaries

`/api/session` accepts only platform-admin credentials and never issues a browser cookie for another role. `/api/backend/*` validates the current actor as a platform admin on every request, including old cookies, then checks a browser-specific route allowlist. CSRF/origin, request limits and upstream resource checks remain enforced.

The native Bearer bridge `/api/mobile/*`, signed `/api/whatsapp/webhook`, booking workflows and media-erasure helpers remain deployed in the same Vercel project because the mobile app depends on them. Their presence does not enable customer browser sessions. The shared API, mobile code and database schema are unchanged by the web separation.

## Development and validation

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @gym/web dev
pnpm --filter @gym/web typecheck
pnpm --filter @gym/web test
pnpm --filter @gym/web build
```

The production Vercel root is `apps/web`; the build also generates Prisma and compiles the embedded API. Configure server-only credentials as described in [deployment](../../docs/VERCEL_DEPLOYMENT.md). Migrations run separately. No default administrator credentials are supplied.

CI verifies administrator-only sessions (including replayed native tokens in old browser cookies), native role login, exact route scopes, optimistic-concurrency failures, real settings saves through a disposable PostgreSQL database, and desktop/mobile browser navigation. No production data is used by the tests.
