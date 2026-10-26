# WhatsApp reverse verification

WhatsApp is an optional alternative to the existing TextBee SMS flow. Configuration is off by default. PR #98 includes the implementation; applying configuration alone to an older deployment cannot enable it.

## Flow and security

The client requests a five-minute challenge for a normalized phone and REGISTER/RESET purpose. The server returns a `wa.me` link with a cryptographically random message token and a separate random `whatsappToken` retained in client memory. Only hashes are stored. The poll/consumption token is never included in the WhatsApp message.

Signed inbound messages must match the configured destination Phone Number ID, challenge destination, sender phone, exact message format, purpose and creation/expiry times. Missing sender phone fails closed. Message IDs are unique and accepted updates are transactional/idempotent. A webhook does not create users or change passwords: existing registration/recovery consumes the verified challenge once under the existing row lock and transaction. Staff recovery requires active established passwords and excludes platform admins. All prior sessions are revoked on password reset. SMS/test behavior stays independent.

Start and polling requests have shared database rate limits. A new challenge invalidates older challenges for the same phone/purpose, across methods. Cancelling invalidates its proof; expiry also bounds abandoned attempts. UI states include unavailable, instructions, waiting, verified, expired and retry. WhatsApp is opened via a fixed HTTPS `wa.me` host, and opening a link alone cannot verify a phone. Tokens are sent in bounded POST bodies, never polling query strings, localStorage or URL fragments. No outgoing WhatsApp messages or authentication templates are used.

## Deployment order

1. Review/merge the change and apply migration `202610260002_whatsapp_reverse_verification` using the migration role. Builds do not migrate the live database. Existing runtime table privileges cover the added columns.
2. Deploy with `GYMBANK_WHATSAPP_ENABLED=false` first.
3. Configure server secrets: `GYMBANK_WHATSAPP_VERIFY_TOKEN` (independent random value, at least 32 characters), `GYMBANK_WHATSAPP_APP_SECRET` (Meta app secret), `GYMBANK_WHATSAPP_PHONE=+201214829716`, and `GYMBANK_WHATSAPP_PHONE_NUMBER_ID` (the ID belonging to that exact number in the selected WhatsApp account, not the App ID or WABA ID). With an embedded API these live in Vercel; standalone mode uses the API server environment. Never use NEXT_PUBLIC variables, Flutter defines or committed secrets. An Access Token is not required for this inbound-only verification flow.
4. Set Meta callback to `https://gym-network-platform.vercel.app/api/whatsapp/webhook`, and enter the exact verify token from the server environment. GET performs the subscribe/challenge handshake even while verification is disabled. Subscribe the app to the correct account's `messages` events. With verification disabled, POST returns 503 rather than silently dropping signed events.
5. Enable `GYMBANK_WHATSAPP_ENABLED=true` only after migration and complete configuration. Run a controlled registration and recovery test from a separate WhatsApp number. Verify sender mismatch, expiry and SMS fallback. Connected/linked status in Meta alone does not prove inbound event delivery.
6. Install a new mobile build for the new UI. Server configuration is discovered when choosing a verification method. Disable the flag to hide the option and reject further WhatsApp proofs without changing SMS configuration.

## Endpoints

- `GET /auth/phone/status`: includes independent `smsEnabled` and `whatsappEnabled` flags.
- `GET /auth/whatsapp/status` and `POST /auth/whatsapp/{challenge,check,cancel}`.
- Check/cancel body: `{phone,purpose,challengeId,whatsappToken}`. Check returns pending/verified/expired/cancelled, never a reusable session token.
- Existing phone register/reset/reset-verify endpoints accept exactly one of `code` (SMS) or `whatsappToken`, bound to `challengeId` and phone.
- Web gateway: `/api/whatsapp/{status,challenge,check,cancel}`. Native gateway: `/api/mobile/auth/whatsapp/...`.
- Meta callback `/api/whatsapp/webhook` preserves raw request bytes for HMAC-SHA256. Bodies are bounded to 64 KiB, malformed signatures are rejected and disabled configuration returns 503. No browser Origin/session is needed on this dedicated callback. Webhook request logging is disabled; challenge proof fields are redacted.

Tests include signature/transport integrity, config opt-in, disposable PostgreSQL registration/recovery, replay/sender/destination/purpose/expiry/cancellation checks, and Flutter polling/navigation. Live delivery requires Meta configuration and a real handset acceptance test; automated tests use synthetic payloads only.
