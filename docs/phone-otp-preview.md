# Simulated phone OTP

The owner requested phone/password registration on the main website and ordinary Android build, using an autofilled fixed code until the SMS provider is connected.

- Register any valid mobile number, name and password (8–128 characters; numbers-only passwords are allowed). Owners also enter gym details and remain pending approval.
- The code `123456` autofills; the tester presses confirmation. No SMS is sent and phone ownership remains unverified.
- Sign in using the phone and password. Recovery uses the same phone, new password and code, and revokes previous sessions.
- Recovery only works for identities created through this simulated flow. Legacy accounts, staff and administrators are excluded.
- Challenges expire after five minutes, are consumed once, allow five failed attempts and have a sixty-second resend cooldown plus IP throttling.
- Google/Apple placeholder buttons are removed.

## Main deployment

Apply migrations `202610230002_phone_otp_preview` and `202610230003_phone_otp_any_phone`. Explicitly set `GYMBANK_OTP_MODE=test` and `GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION=true` on the main Vercel deployment. Test OTP stays disabled in production unless both settings are present.

Ordinary Flutter builds now default to the phone flow and the normal production API origin. On Codemagic select `main` and `gymbank-android`. No extra preview flag is required. The older isolated preview workflow remains available.

This is a known-code simulation, not actual phone verification. Before the public customer launch, replace it with randomly generated codes delivered by a real SMS provider and remove the production test opt-in. Keep the existing-account recovery restriction until real verification is implemented.
