# GymBank iOS builds

The Flutter client shares its screens and production API with Android. The iOS
host is generated with Flutter 3.47.7, as Android is today. No application or
database changes are required for this foundation.

## First compile (no Apple credentials)

On this branch choose `gymbank-ios-check` in Codemagic. The GitHub mobile CI also
compiles and launches an iOS simulator application on macOS, captures a startup
screenshot and compiles an unsigned arm64 device Release. Verification reports
include the built version, localized permission resources and bundled dependency
privacy manifests. An unsigned Release is not installable on a real iPhone. Its ZIP runs in Apple's Simulator
on a Mac; it cannot be installed on an iPhone and is not an IPA.

The generated host targets iOS 15.5+, uses bundle ID `net.shotech.gymbank`, includes
GymBank's opaque icon, a dark branded launch screen, Arabic/English
camera/photo/location descriptions, and a Keychain
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

Hosted deployments require real SMS or WhatsApp verification. The known-code
OTP simulation is restricted to disposable local test databases. Public launch
also needs privacy policy/support links, App Store privacy/export declarations,
account lifecycle review and store screenshots.

References:
- https://docs.flutter.dev/deployment/ios
- https://docs.codemagic.io/yaml-code-signing/signing-ios/

## Remaining public-release work

Successful compilation is not App Store approval. These are confirmed open items:

- Apple Developer enrollment, registered app, signing identities and real-device
  acceptance. None can be completed against an account that does not exist yet.
- Real SMS verification to replace the explicitly approved fixed-code trial.
- A public privacy policy with the project owner's controller/contact details,
  retention decisions and an in-app entry. Those owner decisions are not present
  in the repository; no placeholder policy or invented retention period is added.
- A complete in-app account-deletion lifecycle, including financial settlement,
  personal-data erasure and user-content cleanup. Generic support tickets and
  disabling an account do not constitute implemented deletion.
- Marketplace user-blocking and moderation readiness, store metadata/screenshots,
  App Privacy declarations, and export-compliance answers supported by the signed
  archive. Existing listing reporting must not be mistaken for user blocking.

References for account deletion and app review:
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/app-store/review/guidelines/
