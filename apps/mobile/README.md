# GymBank native mobile application

**Status — 26 October 2026:** implemented Flutter 3.47.7/Dart application for Android and iOS, with native trainee, owner, branch-manager and cashier experiences. Signed Android release APKs are available. iOS simulator builds/startup and unsigned arm64 device compilation pass; signed physical-iPhone distribution requires Apple signing and TestFlight setup.

The app uses the shared production API through `/api/mobile/*` with Bearer sessions. Web cookies do not authorize the mobile bridge. No database, Cloudinary, TextBee or signing secrets are embedded.

## Current experiences

- Phone/password login and registration, real SMS ownership verification, and phone → code → new-password recovery. Google/Apple login buttons have been removed. Authentication forms support Arabic/English; signed-in areas currently remain Arabic.
- TextBee sends a short Arabic message with each code digit written as a word. Users enter digits; Arabic, Persian and ASCII digits are normalized. A dedicated fixed-code test mode remains separate from real SMS and cannot recover staff accounts.
- Remember me controls encrypted session persistence. Unchecked sessions remain in memory; passwords are never saved.
- Trainee wallet/history, platform-approved receipt topups, nearby branch directory/map, services/bookings, branch/personal QR attendance, visit history and ratings.
- Owner onboarding/application tracking, branch management, invitations, visit receivables, reports and withdrawals. Managers/cashiers have native workplace screens with server-scoped permissions.
- Only the platform sells/credits trainee points. Gym purchases, inventory sales and branch point transfers are retired; historical records are preserved.
- Shared marketplace, maintenance from Account, campaign carousel, notifications, support and account management.
- Account deletion appears in red above logout. Signed-in confirmation uses the registered phone and literal `DELETE`; unresolved obligations block erasure. See [account deletion](../../docs/account-deletion.md).
- Raised QR navigation has transparent headroom: page content remains visible behind the raised portion while the white bar and device safe area remain protected.

## Android download and builds

[Download release APKs](https://github.com/ibrahimshoshaaa/gym-network-platform/releases/tag/mobile-v0.2.7). Most current Android devices use `app-arm64-v8a-release.apk`. Main-branch GitHub builds upload signed per-ABI APKs and checksums to this reused release tag. Signing/version verification is mandatory; there is no debug-key fallback. See [signing](../../docs/2026-10-20-android-signing.md) and [Codemagic Android](../../docs/codemagic-android.md).

The application revision `18dd769` includes the QR transparency fix and passed 120 Flutter tests. CI also analyzes the app and compiles/launches the iOS simulator build. Installing a new APK is required for UI changes; server-side OTP changes alone do not require reinstalling.

```bash
flutter create --platforms=android,ios --org net.shotech --project-name gym_network .
# Preserve the repository pubspec, lockfile, lib and test when generating hosts.
python3 tool/prepare_platforms.py
flutter pub get
flutter analyze lib test --no-fatal-infos
flutter test
# Release APKs require the original signing identity; follow the signing guide.
flutter build apk --release --split-per-abi
```

`GYM_API_ORIGIN` is an optional compile-time HTTPS staging origin, not a credential. Local HTTP is allowed only in debug builds on explicit loopback/emulator hosts.

## iOS and release boundaries

See [iOS build/signing](../../docs/codemagic-ios.md). Simulator ZIPs and unsigned device builds are not installable iPhone releases. Apple Developer/App Store Connect setup, signing, TestFlight, physical-device permission/Keychain/camera/GPS checks and store acceptance remain release work.

Real TextBee verification and the account-deletion lifecycle are implemented; older rollout notes describing them as deferred are historical. Store privacy/support/retention details still need the owner's approved information. Background push and wallet PIN are not claimed as completed.

Financial retry envelopes use encrypted storage and are bound to the user, request body/path and UUID. A pending mutation blocks new financial actions until its original outcome is definitive. Never clear pending state to bypass an uncertain result. Receipt upload and quotes do not change financial balances.

## Arabic and English

The application uses paired `lib/l10n/app_ar.arb` and `app_en.arb` catalogs. All roles can select a language from their account or workspace. First launch follows the device language (Arabic or English; other languages fall back to Arabic), and the choice is saved independently of account sessions. The previous `auth.language` preference is migrated automatically.

Translate only application copy with `appText(key, values)`. User names, gym/service names, descriptions, reference IDs, QR payloads and typed input must remain unchanged. Indexed placeholders are inserted once, so user content cannot be treated as another translation template. Financial values retain the existing exact piaster conversion and Western decimal input format; currency labels and date display follow the selected language.

Edit both ARB files together and regenerate:

```bash
python3 tool/generate_translations.py
python3 tool/generate_translations.py --check
```

The generator checks equal key coverage, placeholder parity, missing source keys and untranslated English copy. Flutter tests cover language persistence, RTL/LTR switching, input preservation and unchanged financial parsing. Language changes keep the navigator and pending operations alive.
