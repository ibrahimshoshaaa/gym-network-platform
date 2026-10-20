"""Reject unsigned, unexpected-key, wrong-package or wrong-version APKs."""
import os
import re
import subprocess
import sys
from pathlib import Path

def verify(apk, apksigner, aapt, fingerprint, version_code):
    result = subprocess.run([str(apksigner), 'verify', '--verbose', '--print-certs', str(apk)],
                            capture_output=True, text=True, check=True)
    digests = re.findall(r'^Signer (?:#\d+|\(minSdkVersion=\d+, maxSdkVersion=\d+\)) certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$', result.stdout, re.MULTILINE)
    expected = fingerprint.replace(':', '').strip().lower()
    if not re.fullmatch('[0-9a-f]{64}', expected) or not digests or {d.lower() for d in digests} != {expected}:
        raise SystemExit('APK signing identity does not match the permanent GymBank certificate')
    badging = subprocess.run([str(aapt), 'dump', 'badging', str(apk)],
                             capture_output=True, text=True, check=True).stdout
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not match or match.groups() != ('net.shotech.gym_network', str(version_code), '0.2.7'):
        raise SystemExit('APK package or release version does not match this build')
    print(f'Verified {apk.name}: permanent signing identity, version code {version_code}')

if __name__ == '__main__':
    build_tools = Path(os.environ['ANDROID_HOME']) / 'build-tools'
    versions = sorted(build_tools.iterdir(), key=lambda p: [int(n) for n in re.findall(r'\d+', p.name)])
    tools = next((p for p in reversed(versions) if (p / 'apksigner').exists() and (p / 'aapt').exists()), None)
    apks = sorted(Path('build/app/outputs/flutter-apk').glob('*.apk'))
    if tools is None or len(apks) != 3:
        raise SystemExit('Expected Android verification tools and three ABI APKs')
    for apk in apks:
        verify(apk, tools/'apksigner', tools/'aapt', os.environ['ANDROID_SIGNING_CERT_SHA256'], sys.argv[1])
