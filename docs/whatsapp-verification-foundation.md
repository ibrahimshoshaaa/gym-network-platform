# WhatsApp reverse verification foundation

Scope: prepare screens and webhook plumbing only. SMS through TextBee remains the working proof. No migration, credentials, production configuration or deployment is included.

## Shipped UI

Mobile registration (trainee and owner) and password recovery now open a method chooser before requesting an SMS. WhatsApp details are reachable and explicitly unavailable. Choosing SMS continues the existing flow; opening details, cancelling or going back sends nothing. Web registration/recovery keep SMS as the default and expose the same unavailable details without clearing form values.

Reusable Arabic web and Arabic/English Flutter components cover unavailable, ready, waiting, expired, verified and error states. The ready/waiting/success states are presentation components for the later integration, not live verification. They do not poll, launch a chat or produce a proof. Their action callbacks are supplied by a future host; omitted callbacks disable the relevant buttons. There is no demo code, fabricated success, client-side proof or automatic account creation.

## Reserved server endpoints

- `GET /auth/whatsapp/status`: always `{enabled:false, reason:"SETUP_REQUIRED", method:"whatsapp"}` even if secrets exist.
- `POST /auth/whatsapp/challenge`: always HTTP 503 `WHATSAPP_UNAVAILABLE`; creates no challenge, SMS, session or account.
- Native bridge exposes the above at `/api/mobile/auth/whatsapp/...`.
- Meta callback route: `/api/whatsapp/webhook` on the web deployment, forwarding to `/webhooks/whatsapp` on the backend.
- GET implements Meta's subscribe/challenge handshake with an independently configured server-only `GYMBANK_WHATSAPP_VERIFY_TOKEN` of at least 32 characters. Do not paste an Access Token into this field.
- POST checks `x-hub-signature-256` against the exact raw bytes using server-only `GYMBANK_WHATSAPP_APP_SECRET`, with a 64 KiB body limit. No session cookie or browser Origin is required on the dedicated Meta callback. Webhook request logging is disabled so verification query tokens are not logged by Fastify.
- Missing configuration returns 503; invalid handshake/signature returns 403. Authenticated inbound events still return 503 until durable ingestion exists. This is intentional: do not configure production message subscriptions yet; events must not be silently acknowledged and discarded.

For an embedded API, secrets belong in the Vercel server environment. For a standalone API they belong on that API server. No `NEXT_PUBLIC_` variables, Flutter defines or committed secrets are needed. Configuration alone cannot enable WhatsApp verification.

## Work required before activation

1. Durable one-time challenges bound to normalized phone, purpose (registration/recovery), request session and expiry; only store hashes of unpredictable proof secrets.
2. Signed webhook ingestion with destination-number validation, sender-number matching, message-ID deduplication and transaction-safe proof updates. A missing sender number must fail closed.
3. Rate-limited, possession-protected polling and one-time server consumption integrated into registration/recovery, including staff recovery rules and session revocation. Opening a link, receiving a client flag or knowing a challenge ID must never verify a phone.
4. Start/expiry/cancel/retry/resume state handling and safe `wa.me` launching, driven by real server responses. Keep SMS available independently.
5. Configure the real business number and Meta subscriptions, test actual inbound delivery end to end, then explicitly enable the method. This PR contains no enable flag and makes no live API calls to Meta.

## Validation

API tests check disabled behavior, handshake, exact-byte signatures, tampering, missing configuration and body bounds. Web tests cover all presentational states and disabled actions. Flutter tests cover narrow layouts and navigating from unavailable WhatsApp details back to the real SMS challenge. Existing SMS recovery coverage includes the method chooser.
