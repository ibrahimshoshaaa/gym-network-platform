"""Restore the release keystore only inside a trusted CI release step."""
import base64
import os
from pathlib import Path

REQUIRED = ('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD',
            'ANDROID_KEY_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_SIGNING_CERT_SHA256')

def install():
    missing = [name for name in REQUIRED if not os.environ.get(name)]
    if missing:
        raise SystemExit('Release signing is not configured: ' + ', '.join(missing))
    target = Path(os.environ['GYMBANK_KEYSTORE_PATH'])
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    target.write_bytes(base64.b64decode(os.environ['ANDROID_KEYSTORE_BASE64'], validate=True))
    target.chmod(0o600)

if __name__ == '__main__':
    install()
