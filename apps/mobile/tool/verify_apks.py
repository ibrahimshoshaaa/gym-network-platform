"""Reject unsigned, unexpected-key, wrong-package or wrong-version APKs."""
import os
import re
import subprocess
import sys
from pathlib import Path

ABI_CODES = {'armeabi-v7a': 1, 'arm64-v8a': 2, 'x86_64': 4}

def split_metadata(apk, base_code):
    match = re.fullmatch(r'app-(armeabi-v7a|arm64-v8a|x86_64)-release\.apk', apk.name)
    if not match:
        raise SystemExit('Unexpected Android ABI APK filename')
    abi = match.group(1)
    return abi, int(base_code) + ABI_CODES[abi] * 1000

def verify(apk, apksigner, aapt, fingerprint, version_code, expected_abi=None):
    result = subprocess.run([str(apksigner), 'verify', '--verbose', '--print-certs', str(apk)],
                            capture_output=True, text=True, check=True)
    digests = re.findall(r'^(?:Signer[^\r\n]*?|V\d+(?:\.\d+)* Signer:) certificate SHA-256 digest: ([0-9a-fA-F]{64})\s*$', result.stdout, re.MULTILINE)
    expected = re.sub(r'[\s:]', '', fingerprint).lower()
    if not re.fullmatch('[0-9a-f]{64}', expected) or not digests or {d.lower() for d in digests} != {expected}:
        print('APK public signer certificate digests: ' + ', '.join(digests or ['no recognized certificate lines']))
        print('Signer labels: ' + '; '.join(line.split(' certificate ')[0] for line in result.stdout.splitlines() if line.startswith('Signer') and 'certificate SHA-256 digest:' in line))
        raise SystemExit('APK signing identity does not match the permanent GymBank certificate')
    badging = subprocess.run([str(aapt), 'dump', 'badging', str(apk)],
                             capture_output=True, text=True, check=True).stdout
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not match or match.groups() != ('net.shotech.gym_network', str(version_code), '0.2.7'):
        print('APK package/version observed: ' + repr(match.groups() if match else None))
        print('Expected package/version: net.shotech.gym_network / ' + str(version_code) + ' / 0.2.7')
        raise SystemExit('APK package or release version does not match this build')
    if expected_abi and re.findall(r"native-code: '([^']+)'", badging) != [expected_abi]:
        raise SystemExit('APK native architecture does not match its release filename')
    print(f'Verified {apk.name}: permanent signing identity, version code {version_code}')

if __name__ == '__main__':
    build_tools = Path(os.environ['ANDROID_HOME']) / 'build-tools'
    versions = sorted(build_tools.iterdir(), key=lambda p: [int(n) for n in re.findall(r'\d+', p.name)])
    tools = next((p for p in reversed(versions) if (p / 'apksigner').exists() and (p / 'aapt').exists()), None)
    apks = sorted(Path('build/app/outputs/flutter-apk').glob('*.apk'))
    if tools is None or len(apks) != 3:
        raise SystemExit('Expected Android verification tools and three ABI APKs')
    for apk in apks:
        abi, version_code = split_metadata(apk, sys.argv[1])
        verify(apk, tools/'apksigner', tools/'aapt', os.environ['ANDROID_SIGNING_CERT_SHA256'], version_code, abi)
