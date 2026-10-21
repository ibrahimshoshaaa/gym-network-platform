# Codemagic Android builds

Use the individual account's mac_mini_m2 allowance. Workflows are manual (no automatic triggers).

1. In Codemagic select this repository, use codemagic.yaml, and select branch `codex/unified-native-balance-card` while PR #79 is open.
2. Run `gymbank-check` first. No signing credentials are needed.
3. Before `gymbank-android`, add an environment-variable group named `gymbank_android_signing` with these values from the ORIGINAL release signing backup, marked secure:
   - ANDROID_KEYSTORE_BASE64
   - ANDROID_KEYSTORE_PASSWORD
   - ANDROID_KEY_PASSWORD
   - ANDROID_KEY_ALIAS
   - ANDROID_SIGNING_CERT_SHA256
4. GitHub Actions secrets cannot be read back or imported automatically. Use the original backup; do not create a replacement keystore. Never paste signing credentials into chat or commit them.
5. Start `gymbank-android`. Download the arm64 APK from build artifacts for most current Android phones. All three ABI APKs and checksums are produced.
6. The pipeline validates the keystore certificate and the APK signer, package, ABI, and version code using existing repository scripts. A missing or incorrect signing identity fails the build instead of producing a different-key app.
7. Codemagic uses base version code 200000 + BUILD_NUMBER (plus Flutter ABI offsets). Keep this workflow's build counter increasing. Before returning to GitHub release builds, raise their 100000-based range above the most recent shipped Codemagic version; otherwise Android rejects the downgrade.
8. Builds are available as Codemagic artifacts; this configuration does not upload to GitHub Releases or require a GitHub write token.

Full Flutter execution is performed on Codemagic, not guaranteed by the configuration's local YAML validation.
