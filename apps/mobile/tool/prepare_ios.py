"""Configure a generated Flutter iOS host without touching Android files."""
import json
import plistlib
import re
import subprocess
from pathlib import Path

BUNDLE_ID = 'net.shotech.gymbank'
MIN_IOS = '15.5'


def configure(root=Path('.')):
    ios = root / 'ios'
    plist_path = ios / 'Runner/Info.plist'
    with plist_path.open('rb') as stream:
        info = plistlib.load(stream)
    info.update({
        'CFBundleDisplayName': 'GymBank',
        'CFBundleName': 'GymBank',
        'NSCameraUsageDescription': 'GymBank uses the camera to scan gym QR codes and confirm attendance.',
        'NSLocationWhenInUseUsageDescription': 'GymBank uses your location to show nearby gyms and confirm that you have arrived at your booked branch.',
        'NSPhotoLibraryUsageDescription': 'Choose payment receipts, gym photos and marketplace listing photos to upload to GymBank.',
        'LSApplicationQueriesSchemes': ['tel', 'https'],
    })
    with plist_path.open('wb') as stream:
        plistlib.dump(info, stream, sort_keys=False)

    entitlements = ios / 'Runner/Runner.entitlements'
    with entitlements.open('wb') as stream:
        plistlib.dump({'keychain-access-groups': []}, stream)
    project_path = ios / 'Runner.xcodeproj/project.pbxproj'
    project = project_path.read_text()
    project, count = re.subn(r'PRODUCT_BUNDLE_IDENTIFIER = [^;]+;',
                            lambda m: 'PRODUCT_BUNDLE_IDENTIFIER = ' + BUNDLE_ID +
                            ('.RunnerTests' if 'RunnerTests' in m[0] else '') + ';', project)
    if count < 3:
        raise RuntimeError('Flutter Xcode template changed: bundle identifier settings missing')
    project = re.sub(r'IPHONEOS_DEPLOYMENT_TARGET = [^;]+;',
                     'IPHONEOS_DEPLOYMENT_TARGET = ' + MIN_IOS + ';', project)
    # Only Runner configurations have this Info.plist, not RunnerTests.
    marker = 'INFOPLIST_FILE = Runner/Info.plist;'
    if project.count(marker) != 3:
        raise RuntimeError('Flutter Xcode template changed: Runner configurations missing')
    if 'CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;' not in project:
        project = project.replace(marker, marker + '\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;')
    project_path.write_text(project)

    (ios / 'Podfile').write_text("""platform :ios, '15.5'
ENV['COCOAPODS_DISABLE_STATS'] = 'true'
project 'Runner', {'Debug' => :debug, 'Profile' => :release, 'Release' => :release}
def flutter_root
  generated = File.expand_path(File.join('Flutter', 'Generated.xcconfig'), __dir__)
  File.foreach(generated) do |line|
    match = line.match(/FLUTTER_ROOT\\=(.*)/)
    return match[1].strip if match
  end
  raise 'Run flutter pub get before pod install'
end
require File.expand_path(File.join('packages', 'flutter_tools', 'bin', 'podhelper'), flutter_root)
flutter_ios_podfile_setup
target 'Runner' do
  use_frameworks!
  flutter_install_all_ios_pods File.dirname(File.realpath(__FILE__))
  target 'RunnerTests' do
    inherit! :search_paths
  end
end
post_install do |installer|
  installer.pods_project.targets.each do |target|
    flutter_additional_ios_build_settings(target)
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.5'
      if target.name == 'geolocator_apple'
        definitions = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        definitions << 'BYPASS_PERMISSION_LOCATION_ALWAYS=1' unless definitions.include?('BYPASS_PERMISSION_LOCATION_ALWAYS=1')
      end
    end
  end
end
""")
    icons = ios / 'Runner/Assets.xcassets/AppIcon.appiconset'
    catalog = json.loads((icons / 'Contents.json').read_text())
    source = root / 'assets/brand/ios-icon.png'
    for entry in catalog['images']:
        if 'filename' not in entry:
            continue
        size = round(float(entry['size'].split('x')[0]) * float(entry['scale'].rstrip('x')))
        subprocess.run(['sips', '-z', str(size), str(size), str(source),
                        '--out', str(icons / entry['filename'])], check=True, stdout=subprocess.DEVNULL)
    print('Prepared GymBank iOS host: ' + BUNDLE_ID + ', iOS ' + MIN_IOS + '+')


if __name__ == '__main__':
    configure()
