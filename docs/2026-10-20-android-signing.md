# Stable GymBank Android signing

Current testing releases used the generated Flutter debug signer. Release builds now require one permanent GymBank identity from GitHub repository secrets. Missing secrets fail the build; there is no debug fallback. APKs are verified with Android apksigner against the expected SHA-256 certificate and aapt against the package/version before upload.

## One-time owner setup

On a trusted computer with Java 17, Python 3 and GitHub CLI, sign in to GitHub CLI using your own repository owner account. From this checked-out branch run:

```
gh auth login
python3 apps/mobile/tool/setup_release_signing.py
```

The script checks for existing signing secrets and refuses to replace them. It generates an RSA 3072-bit JKS valid for 10000 days and random passwords locally, keeps a private backup at `~/gymbank-signing-backup`, and sends five values to GitHub secret storage over stdin without printing them:

- ANDROID_KEYSTORE_BASE64
- ANDROID_KEYSTORE_PASSWORD
- ANDROID_KEY_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_SIGNING_CERT_SHA256

Keep an encrypted offline backup of that directory. Do not delete it, commit it, or send it through chat. If setup fails after generation, preserve the created directory and recover/upload that identity rather than generating another one. Never replace an existing production key just to fix a build failure. The current GitHub connector cannot write repository secrets, so this setup is an owner-side action.

## Release

After secrets are installed, merge this PR. Main builds and manual workflow dispatch use the shared `tool/release_version.py` clock, matching Android Codemagic workflows, as the base version code and version name 0.2.7. A rebuild gets the current clock-based code, above earlier builds made by either provider. Android package remains `net.shotech.gym_network`. Signed per-ABI APKs and SHA256SUMS.txt publish under `mobile-v0.2.7`; older testing assets are preserved. Build APKs again through the Android workflow on main after setup, never generate a new key per build.

Existing debug-signed installations cannot be updated with a different release key. One-time uninstall/reinstall may be necessary; this removes local session/cache/pending-operation state, but does not remove server account balances, visits or records. Resolve any pending local financial operation before uninstalling. We have not directly inspected the installed device's certificate, so the screenshot alone is not conclusive proof of a signing mismatch.

PR CI runs configuration/secret-restoration tests and Flutter analysis/widgets without production secrets. A signed APK build and on-device installation remain pending until the owner installs the secrets and the release workflow finishes.
