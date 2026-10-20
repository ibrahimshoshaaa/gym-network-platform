"""One-time local setup. Never print credentials or commit the backup directory."""
import argparse
import base64
import json
import os
import secrets
import shutil
import subprocess
from pathlib import Path

REPO = 'ibrahimshoshaaa/gym-network-platform'
NAMES = ('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD',
         'ANDROID_KEY_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_SIGNING_CERT_SHA256')

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-dir', type=Path, default=Path.home()/'gymbank-signing-backup')
    args = parser.parse_args()
    if not shutil.which('keytool') or not shutil.which('gh'):
        raise SystemExit('Install Java 17 (keytool) and GitHub CLI (gh), then run gh auth login first.')
    run(['gh', 'auth', 'status'])
    listed = json.loads(run(['gh', 'secret', 'list', '--repo', REPO, '--json', 'name'], text=True).stdout)
    if any(row['name'] in NAMES for row in listed):
        raise SystemExit('Signing secrets already exist. Do not rotate or overwrite the app identity.')
    folder = args.backup_dir.expanduser().resolve()
    if folder.exists():
        raise SystemExit('Backup folder already exists. Preserve it; do not generate a replacement key.')
    folder.mkdir(mode=0o700, parents=True)
    password = secrets.token_urlsafe(36)
    alias = 'gymbank'
    env = {**os.environ, 'GYMBANK_SETUP_PASSWORD': password}
    key = folder/'gymbank-release.jks'
    # Password is passed through an environment reference, never in argv or logs.
    run(['keytool', '-genkeypair', '-noprompt', '-keystore', str(key), '-storetype', 'JKS',
         '-storepass:env', 'GYMBANK_SETUP_PASSWORD', '-keypass:env', 'GYMBANK_SETUP_PASSWORD',
         '-alias', alias, '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000',
         '-dname', 'CN=GymBank, OU=Mobile, O=ShoTech Solutions, C=EG'], env=env)
    key.chmod(0o600)
    cert = run(['keytool', '-exportcert', '-keystore', str(key), '-alias', alias,
                '-storepass:env', 'GYMBANK_SETUP_PASSWORD'], env=env).stdout
    import hashlib
    fingerprint = hashlib.sha256(cert).hexdigest()
    credentials = {'alias': alias, 'storePassword': password, 'keyPassword': password,
                   'certificateSha256': fingerprint}
    backup = folder/'credentials.json'
    backup.write_text(json.dumps(credentials, indent=2))
    backup.chmod(0o600)
    values = (base64.b64encode(key.read_bytes()).decode(), password, password, alias, fingerprint)
    for name, value in zip(NAMES, values):
        run(['gh', 'secret', 'set', name, '--repo', REPO], input=value.encode())
    print('Permanent GymBank signing identity saved to GitHub Secrets.')
    print(f'Keep an encrypted offline backup of: {folder}')
    print('Do not upload that folder to Git, chat, or a public artifact.')

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit('Setup failed. Preserve any created backup; do not generate a replacement identity.') from None
