# Trainee self-service
The public login page defaults to trainee access and offers account creation.
Registration collects name, phone, email, password and confirmation. New passwords accept 8–128 characters, including numbers-only passwords.
An email/phone already used by an administrator cannot register a second role.

The same-origin POST /api/register checks the browser origin, limits JSON bodies,
rejects unexpected fields including role, and calls the existing trainee-only
registration service. The resulting session is stored only in the secure HttpOnly
cookie. No bearer token is exposed to browser JavaScript.

Trainees use a dedicated personal area with five destinations: wallet, topup,
participating gyms, QR entry and visit/point history. Gym administration controls
are not rendered for trainees; server authorization remains authoritative.
Topups reuse quote/version/idempotency/receipt safeguards and send kind=TRAINEE.
No price or payment account is seeded; the owner configures those in admin.
When settings are unavailable, the topup page explains that charging is not ready.

The mobile navigation stays at the bottom and respects safe-area spacing.
Receipt selection is capped at 4 MiB to fit the hosting request limit.
Tests cover registration CSRF, extra-field/role rejection, session cookies,
initial wallet, permissions, duplicate accounts, UI entry points and personal navigation.
