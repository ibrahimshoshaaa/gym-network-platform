# Phone OTP preview

This is simulated verification without an SMS provider or delivery charge. It never proves phone ownership. Existing email registration and password login remain available in ordinary builds.

- Branch: `codex/phone-otp-preview`.
- API: explicitly set `GYMBANK_OTP_MODE=test` on an isolated Vercel **preview** deployment, backed by the approved test database. Production always rejects this mode.
- Apply `202610230002_phone_otp_preview` and `202610230003_phone_otp_any_phone` only to the isolated test database for this trial.
- Configure `WEB_ORIGIN` to the actual preview origin before testing browser registration.
- Mobile: `--dart-define=GYM_PHONE_OTP_PREVIEW=true --dart-define=GYM_API_ORIGIN=<preview-origin>`.
- Both trainee and owner registrations accept any syntactically valid mobile number entered by the tester. Egyptian local numbers are normalized to +20. Phone fields start empty; there is no allowlist.
- Fixed code: `123456`. Password: at least 15 characters, chosen by the tester.

Register using the number, name and password, then enter the fixed code. Owners additionally submit their gym information and remain pending approval. After registration, sign in with the same phone and password. Password recovery asks for the **same** phone, a new password and the code, then revokes previous sessions. If the phone is already registered through this trial, use recovery rather than registration. Legacy accounts still require their existing recovery/support flow.

Each challenge expires after five minutes, allows five failed code attempts and is consumed once. A new challenge invalidates the previous one; requesting another requires sixty seconds. An IP throttle applies. Recovery is restricted to identities created through this preview, never legacy accounts, staff or administrators. Simulated identities retain `phoneVerifiedAt=null`, have zero starting balance and produce explicit test audit events. The known test code provides no proof of phone ownership. Use the isolated preview for testing only.

The isolated test database connection and test mode were approved and configured on Vercel. The owner approved public access to the preview alias; application sign-in remains enforced. Do not enable test mode against the production database. The fixed code autofills when the challenge explicitly reports testMode=true; confirmation still requires tapping the button. A real provider integration must replace this test implementation with random codes, verified delivery and appropriate provider configuration before production use. Google and Apple placeholders are removed from web and mobile. Sign-in asks for the phone and password.
