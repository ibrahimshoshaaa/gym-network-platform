"""Validate the unsigned device Release build before Apple signing is available."""
import json
import plistlib
import subprocess
from pathlib import Path


def main():
    app = Path('build/ios/iphoneos/Runner.app')
    with (app / 'Info.plist').open('rb') as stream:
        info = plistlib.load(stream)
    if info['CFBundleIdentifier'] != 'net.shotech.gymbank':
        raise RuntimeError('Unexpected iOS bundle identifier')
    if info['CFBundleDisplayName'] != 'GymBank':
        raise RuntimeError('Unexpected iOS display name')
    for language in ['ar', 'en']:
        path = app / (language + '.lproj/InfoPlist.strings')
        values = json.loads(subprocess.check_output(['plutil', '-convert', 'json', '-o', '-', str(path)], text=True))
        for permission in ['NSCameraUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryUsageDescription']:
            if not values.get(permission):
                raise RuntimeError(f'Missing {language} permission text: {permission}')
    if info.get('NSAppTransportSecurity', {}).get('NSAllowsArbitraryLoads'):
        raise RuntimeError('Unrestricted HTTP transport must not be enabled')
    if 'location' in info.get('UIBackgroundModes', []):
        raise RuntimeError('Background location is not part of this application')
    binary = app / info['CFBundleExecutable']
    architectures = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip().split()
    if 'arm64' not in architectures:
        raise RuntimeError('Device Release build lacks arm64 architecture')
    output = Path('build/ios/verification')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'release.json').write_text(json.dumps({
        'bundleId': info['CFBundleIdentifier'], 'version': info['CFBundleShortVersionString'],
        'build': info['CFBundleVersion'], 'minimumOS': info.get('MinimumOSVersion'),
        'architectures': architectures, 'localizedPermissions': ['ar', 'en'],
        'signing': 'UNSIGNED: not installable on a physical iPhone',
        'privacyManifestBundles': sorted(str(p.relative_to(app)) for p in app.rglob('PrivacyInfo.xcprivacy')),
    }, indent=2))
    print('Unsigned iOS device Release verified: arm64, localized permissions and secure transport.')


if __name__ == '__main__':
    main()
