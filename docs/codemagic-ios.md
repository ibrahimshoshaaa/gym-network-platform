# GymBank iOS builds

The Flutter client shares its screens and production API with Android. The iOS
host is generated with Flutter 3.47.7, as Android is today. No application or
database changes are required for this foundation.

## First compile (no Apple credentials)

On this branch choose `gymbank-ios-check` in Codemagic. The GitHub mobile CI also
compiles an iOS simulator application on macOS. Its ZIP runs in Apple's Simulator
on a Mac; it cannot be installed on an iPhone and is not an IPA.

The generated host targets iOS 15.5+, uses bundle ID `net.shotech.gymbank`, includes
GymBank's opaque icon, camera/photo/location descriptions, and a Keychain
entitlements file. Location access is foreground only. CocoaPods is used
explicitly for the locked native plugins. Android generation is unaffected.

## Signed build for TestFlight

1. Use the project owner's active Apple Developer Program membership. Register
   `net.shotech.gymbank` as an explicit App ID and create a GymBank iOS application
   in App Store Connect with the same bundle ID. Check availability before the
   first signed build; if the ID must change, update both `prepare_ios.py` and the
   `gymbank-ios` signing block together.
2. In Codemagic Team settings > Code signing identities, add an Apple Distribution
   certificate with its private key and matching App Store provisioning profile.
   Codemagic supports generating/fetching these through an App Store Connect API
   integration. Add API keys and certificates directly to Codemagic's secure UI;
   never put them in this repository or chat.
3. Choose `gymbank-ios` on this branch. It uses matching uploaded identities and
   `xcode-project use-profiles` to export the signed IPA. Build numbers use a
   monotonic timestamp shared with Codemagic Android. There is no automatic
   upload, TestFlight distribution or App Store submission in this workflow.
4. Upload the IPA through Apple Transporter on a Mac, or configure Codemagic's
   App Store Connect publishing integration in a follow-up change. After Apple's
   processing and any required export compliance details, add internal testers
   in TestFlight. External testers may require Beta App Review.

A signed App Store IPA is intended for App Store Connect/TestFlight; downloading
that IPA alone does not install it directly on an arbitrary iPhone.

## Acceptance on a real device

- Register, sign in, recover a test account, restart the app and verify the saved
  session, then sign out and confirm the session is removed.
- Use both Arabic and English, small screens and large text; verify safe areas
  and keyboard handling.
- Allow/deny camera, location and photo permissions; scan a branch QR, confirm
  arrival with precise location and upload a receipt/listing image.
- Verify the nearby map, booking, wallet, owner/manager/cashier actions and
  WhatsApp/telephone links. Simulator compilation does not validate device
  permissions, Keychain persistence, camera, GPS or signing.

The current production API intentionally uses simulated OTP `123456`. It does
not verify ownership of a phone. Public launch needs real SMS verification,
privacy policy/support links, App Store privacy/export declarations, account
lifecycle review and store screenshots. Those release tasks are not completed by
this build foundation.

References:
- https://docs.flutter.dev/deployment/ios
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
