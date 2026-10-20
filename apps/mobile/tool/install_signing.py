"""Restore the release keystore only inside a trusted CI release step."""
import base64
import hashlib
import re
import subprocess
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

def preflight():
    install()
    target = Path(os.environ['GYMBANK_KEYSTORE_PATH'])
    try:
        result = subprocess.run(['keytool', '-exportcert', '-keystore', str(target),
                                 '-alias', os.environ['ANDROID_KEY_ALIAS'],
                                 '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD'],
                                capture_output=True, check=True)
    except subprocess.CalledProcessError:
        raise SystemExit('Cannot unlock the supplied GymBank keystore/alias. Check the existing Secrets; do not generate a new key.') from None
    actual = hashlib.sha256(result.stdout).hexdigest()
    expected = re.sub(r'[\s:]', '', os.environ['ANDROID_SIGNING_CERT_SHA256']).lower()
    if actual != expected:
        print('Public certificate SHA-256 from supplied keystore: ' + actual)
        raise SystemExit('ANDROID_SIGNING_CERT_SHA256 does not match the supplied keystore certificate.')
    print('Keystore certificate matches expected permanent GymBank identity.')

if __name__ == '__main__':
    preflight()
