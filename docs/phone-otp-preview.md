# Simulated phone OTP

This describes the fixed-code simulation for local automated tests only.

- Register any valid mobile number, name and password (8–128 characters; numbers-only passwords are allowed). Owners also enter gym details and remain pending approval.
- The code `123456` autofills; the tester presses confirmation. No SMS is sent and phone ownership remains unverified.
- Sign in using the phone and password. Recovery uses the same phone, new password and code, and revokes previous sessions.
- Recovery only works for identities created through this simulated flow. Legacy accounts, staff and administrators are excluded.
- Challenges expire after five minutes, are consumed once, allow five failed attempts and have a sixty-second resend cooldown plus IP throttling.
- Google/Apple placeholder buttons are removed.

## Safety boundary

The fixed code is restricted to `NODE_ENV=test` and a localhost `gym_ci` or `gym_test` database. It is disabled on Vercel preview and production, even if the old production opt-in is set. Hosted environments must use real WhatsApp or SMS verification. Test identities are never marked verified and cannot receive welcome points.
