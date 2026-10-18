# Gym Network Android client

A Flutter Android host for the production mobile web application. It intentionally
shares the authenticated web screens and authoritative API rather than duplicating
financial logic. This is a working hybrid client, not a separately native-rendered
wallet or an offline financial app. Wallet, topup receipts, directory, QR, support,
notifications and role-specific dashboards follow the deployed web version.

Only the exact production HTTPS origin stays inside the authenticated WebView.
Maps, business telephone, WhatsApp and business/evidence images open externally
through a fixed allowlist. No JavaScript/native token bridge exists. Session
cookies stay in WebView's cookie store; account logout revokes them server-side.
Camera and location are requested only when the web screen requests them. File
selection accepts image files without requesting blanket storage permission.
Offline failures offer retry and do not create offline financial operations.

`mobile-ci.yml` creates the Android host using Flutter 3.47.7, applies checked-in
permissions, analyzes/tests navigation and builds split release APKs. The artifacts
are installable evaluation builds signed with Flutter's development signing setup;
store publication requires the owner's app identity, signing key and store account.
No Firebase/FCM project or background-push credentials are invented. Notifications
currently appear inside the authenticated application while it is opened.

Local build: install Flutter 3.47.7, run the same commands in the CI workflow.
Android minimum API 24. iOS publication and a separate native Flutter interface
are not claimed by this Android increment.
