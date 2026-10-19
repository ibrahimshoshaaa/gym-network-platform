# GymBank native mobile application

Flutter 3.47.7 / Dart, Material 3, Arabic RTL. Native screens replace the previous WebView client. Uses the existing production API through `/api/mobile/*` with Bearer sessions; web cookies never authorize the mobile bridge. No database, Cloudinary, signing or backend credentials are embedded.

## Experiences
- Remember me controls encrypted session persistence; unchecked keeps the access token in memory only, including after password changes. Passwords are never stored.
- Unified sign-in/sign-up sheet with a persistent Arabic/English switch for authentication forms (including validation and direction). Signed-in areas currently remain Arabic. Google and Apple buttons are clearly marked coming soon and do not call authentication endpoints.
- Trainee sign-in/email registration; wallet and point history; recharge by points or amount with exact server quote and receipt upload; directory with manual search, nearby order and map; one-time QR with server-relative countdown that hides on background; visit history; notifications, support chat, account and password.
- Gym owner self-registration and pending/rejected application tracking with resubmission. Admin decisions remain in web dashboard. Existing invited owners also use their existing credentials.
- Owner dashboard, aggregate eligible stock wallet, phone → recipient → points → confirmed cash sale; branch create/edit with an explicit map/GPS point; stock purchase, staff invitation, activity reports, receivables and withdrawals.
- Other work roles use the web dashboard for now. OTP, wallet PIN, background push and app-store distribution remain deferred. Contacts are not falsely marked verified.

## Build
```
flutter create --platforms=android,ios --org net.shotech --project-name gym_network .
# Preserve this repo's pubspec, lib and test when generating hosts.
python3 tool/prepare_platforms.py
flutter pub get
flutter analyze lib test --no-fatal-infos
flutter test
flutter build apk --release --split-per-abi
```
The CI workflow generates the Android host while preserving the sources, then analyzes, tests and builds. Main builds attach APKs to the private `mobile-v0.2.6` GitHub release; Actions artifact upload is optional because artifact storage may be exhausted. These are testing APKs with generated template signing, not a Play Store signing identity.

`GYM_API_ORIGIN` is an optional compile-time HTTPS origin for staging, e.g. `--dart-define=GYM_API_ORIGIN=https://...`. It contains no credential. Local HTTP is permitted only in debug builds on explicit loopback/emulator hosts.

Sessions and financial retry envelopes use encrypted device storage. A pending mutation is bound to its user, path, body and UUID and survives restart. New financial actions remain blocked until that original request returns a definitive result. Never clear a pending mutation to bypass an uncertain response. Uploading an image or requesting a quote does not change financial balances.

Google mark: unmodified Google Identity PNG from https://developers.google.com/static/identity/images/g-logo.png, bundled for offline display. No custom recreation of the mark.
