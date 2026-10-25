# TextBee SMS verification

GymBank calls TextBee from the server. The selected Android phone sends the SMS through its SIM. GymBank clients on Android, iOS and the web use the same verification API; they do not need the TextBee app or SMS permissions.

## Phone setup

1. Create an account at https://app.textbee.dev and verify its email.
2. Install the official Android APK from https://textbee.dev/download on the phone containing the sending SIM.
3. Register that phone using the dashboard QR code, allow Send SMS, and allow background operation/unrestricted battery use. Keep the phone powered on and online.
4. Copy the Device ID and generate a server API key. If the phone has two SIMs, select the intended sending SIM in the app. Optionally configure its current subscription ID; check this again after swapping SIMs.

## Server settings

Set these in the Vercel project that hosts GymBank's web/API, using server-only environment variables:

| Variable | Value |
| --- | --- |
| `GYMBANK_OTP_MODE` | `textbee` |
| `TEXTBEE_API_KEY` | API key from TextBee; store as Secret |
| `TEXTBEE_DEVICE_ID` | Selected phone's 24-character ID |
| `GYMBANK_OTP_SECRET` | Separate random secret of at least 32 characters; store as Secret |
| `TEXTBEE_SIM_SUBSCRIPTION_ID` | Optional current numeric subscription ID shown in the Android app |

Generate the OTP secret with `openssl rand -hex 32` in a trusted terminal and save it directly in the secret store. Never put these secrets in GitHub source, a chat screenshot, `NEXT_PUBLIC_` variables, or Flutter build defines. Use separate credentials in an isolated Preview environment; add Production settings when ready for release. Remove the previous production test-code opt-in. Changing an environment variable requires a new deployment.

Apply migration `202610250002_textbee_phone_otp` before the new server version. Existing test challenges remain test-only. An incomplete TextBee configuration disables the phone flow; it never falls back to a fixed code.

## Verification and limits

- Random six-digit codes expire after five minutes, allow five wrong attempts, and are bound to phone, purpose and challenge ID with a server-keyed HMAC. A successful registration/reset consumes the challenge atomically.
- Registration checks the normalized phone before requesting an SMS and before consuming send allowance. Existing numbers receive `ACCOUNT_UNAVAILABLE`; the final unique-account check remains to protect concurrent registration.
- New SMS accounts get `phoneVerifiedAt`. Existing active trainee/owner accounts can recover with a real SMS proof; admin accounts retain their separate recovery path. A phone verified with real SMS cannot later be reset by the fixed-code test flow, even if it previously had a test identity marker.
- New requests wait one minute per phone. Limits also apply across server workers: five requests per phone/hour, ten per phone/24 hours, and 100 per sending device/24 hours, plus the existing IP limits. These are fixed windows from the first request; failed or throttled requests may consume allowance.
- Sending happens after the challenge transaction commits, so transaction retries cannot send duplicates. Provider errors/timeouts invalidate that challenge and show a neutral error. No automatic external-send retries.
- The API only acknowledges provider acceptance, not handset delivery. TextBee queues messages if the sending phone is offline. Check TextBee's history and the receiving handset to confirm receipt. A delayed code may expire before arrival.
- TextBee plan limits and SIM/carrier SMS charges still apply. The OTP text is a short Arabic transactional message: each of the six digits is spelled out separately, including leading zeros, with the GymBank name and a do-not-share reminder. No offers or links are included. Web/mobile accept Arabic, Persian and ASCII digits; the server normalizes them to the original six-character code before verification. This format is a delivery experiment, not a guarantee against carrier filtering.

## Before merging/releasing

Automated tests use a mocked TextBee transport and never send billable messages. They check request/auth format, provider failures, random-code verification, replay protection, reset/session revocation and isolation from test codes. A physical receipt test still requires the user's configured phone and credentials.

On the isolated Preview with TextBee configured, register a new account from a second phone, confirm the received code, reject a wrong code, and test password recovery. Confirm the message sender is the intended SIM. Do not merge or claim live SMS delivery until this physical test is confirmed.

Official protocol/setup: https://textbee.dev/docs/sending-sms/sending-sms and https://textbee.dev/docs/getting-started/setting-up-textbee.
