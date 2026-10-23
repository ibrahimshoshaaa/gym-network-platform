# Phone OTP preview

This is simulated verification without an SMS provider or delivery charge. It never proves phone ownership. Existing email registration and password login remain available in ordinary builds.

- Branch: `codex/phone-otp-preview`.
- API: explicitly set `GYMBANK_OTP_MODE=test` on an isolated Vercel **preview** deployment, backed by the approved test database. Production always rejects this mode.
- Apply `202610230002_phone_otp_preview` only to the isolated test database for this trial.
- Configure `WEB_ORIGIN` to the actual preview origin before testing browser registration.
- Mobile: `--dart-define=GYM_PHONE_OTP_PREVIEW=true --dart-define=GYM_API_ORIGIN=<preview-origin>`.
- Trainee example phone: `+15555550123`; owner example phone: `+15555550124`. These are deliberately fictitious numbers; real numbers are rejected.
- Fixed code: `123456`. Password: at least 15 characters, chosen by the tester.

Register using the number, name and password, then enter the fixed code. Owners additionally submit their gym information and remain pending approval. After registration, sign in with the same phone and password. Password recovery asks for the **same** phone, a new password and the code, then revokes previous sessions. If the shared trial number is already registered, use recovery rather than registration.

Each challenge expires after five minutes, allows five failed code attempts and is consumed once. A new challenge invalidates the previous one; requesting another requires sixty seconds. An IP throttle applies. Recovery is restricted to identities created through this preview, never legacy accounts, staff or administrators. Simulated identities retain `phoneVerifiedAt=null`, have zero starting balance and produce explicit test audit events. Both phones are shared fixtures: do not enter personal data or money.

The preview feature is disabled on Vercel pending approval to attach the isolated test database credential. Do not enable it against the production database. A real provider integration must replace this test implementation with random codes, verified delivery and appropriate provider configuration before using actual customer phones.
