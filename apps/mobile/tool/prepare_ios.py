"""Configure a generated Flutter iOS host without touching Android files."""
import json
import plistlib
import re
import subprocess
from pathlib import Path

LAUNCH_STORYBOARD = '''<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="23501" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="GBLaunch">
  <device id="retina6_12" orientation="portrait" appearance="light"/>
  <dependencies><plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="23501"/><capability name="Safe area layout guides" minToolsVersion="9.0"/><capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/></dependencies>
  <scenes><scene sceneID="GBScene"><objects>
    <viewController id="GBLaunch" sceneMemberID="viewController"><view key="view" contentMode="scaleToFill" id="GBView">
      <rect key="frame" x="0.0" y="0.0" width="393" height="852"/><autoresizingMask key="autoresizingMask" widthSizable="YES" heightSizable="YES"/>
      <subviews><imageView userInteractionEnabled="NO" contentMode="scaleAspectFit" image="LaunchImage" translatesAutoresizingMaskIntoConstraints="NO" id="GBLogo"><rect key="frame" x="56.5" y="379" width="280" height="94"/><constraints><constraint firstAttribute="width" constant="280" id="GBWidth"/><constraint firstAttribute="height" constant="94" id="GBHeight"/></constraints></imageView></subviews>
      <viewLayoutGuide key="safeArea" id="GBSafe"/><color key="backgroundColor" red="0.968627451" green="0.976470588" blue="0.972549020" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
      <constraints><constraint firstItem="GBLogo" firstAttribute="centerX" secondItem="GBView" secondAttribute="centerX" id="GBCenterX"/><constraint firstItem="GBLogo" firstAttribute="centerY" secondItem="GBView" secondAttribute="centerY" id="GBCenterY"/></constraints>
    </view></viewController><placeholder placeholderIdentifier="IBFirstResponder" id="GBResponder" userLabel="First Responder" sceneMemberID="firstResponder"/>
  </objects><point key="canvasLocation" x="53" y="375"/></scene></scenes>
  <resources><image name="LaunchImage" width="280" height="94"/></resources>
</document>
'''

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
        'CFBundleLocalizations': ['ar', 'en'],
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
    # Register localized permission text as an Xcode variant resource.
    ids = {'build': 'AC01A0000000000000000001', 'group': 'AC01A0000000000000000002',
           'ar': 'AC01A0000000000000000003', 'en': 'AC01A0000000000000000004'}
    if ids['group'] not in project:
        project = project.replace('/* Begin PBXBuildFile section */',
            '/* Begin PBXBuildFile section */\n\t\t' + ids['build'] +
            ' /* InfoPlist.strings in Resources */ = {isa = PBXBuildFile; fileRef = ' + ids['group'] + ' /* InfoPlist.strings */; };')
        references = ''.join('\n\t\t' + ids[lang] + ' /* ' + lang +
            ' */ = {isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = ' + lang +
            '; path = ' + lang + '.lproj/InfoPlist.strings; sourceTree = "<group>"; };' for lang in ['ar', 'en'])
        project = project.replace('/* Begin PBXFileReference section */', '/* Begin PBXFileReference section */' + references)
        variant = ('\n\t\t' + ids['group'] + ' /* InfoPlist.strings */ = {isa = PBXVariantGroup; children = (' +
            ids['ar'] + ' /* ar */, ' + ids['en'] + ' /* en */,); name = InfoPlist.strings; sourceTree = "<group>"; };')
        project = project.replace('/* Begin PBXVariantGroup section */', '/* Begin PBXVariantGroup section */' + variant)
        project, groups = re.subn(r'(\n\s+[A-F0-9]+ /\* Info.plist \*/,)',
            lambda match: match[0] + '\n\t\t\t\t' + ids['group'] + ' /* InfoPlist.strings */,', project)
        project, resources = re.subn(r'(\n\s+[A-F0-9]+ /\* Assets.xcassets in Resources \*/,)',
            lambda match: match[0] + '\n\t\t\t\t' + ids['build'] + ' /* InfoPlist.strings in Resources */,', project)
        if groups != 1 or resources != 1:
            raise RuntimeError('Flutter Xcode template changed: localization resource anchors missing')
    project = re.sub(r'(knownRegions = \(.*?)(\n\s+\);)',
        lambda match: match[1] + ('\n\t\t\t\tar,' if not re.search(r'\bar,', match[1]) else '') + match[2],
        project, flags=re.S)
    project_path.write_text(project)
    translations = {
        'ar': {
            'NSCameraUsageDescription': 'يستخدم GymBank الكاميرا لمسح كود الجيم وتأكيد حضورك.',
            'NSLocationWhenInUseUsageDescription': 'يستخدم GymBank موقعك أثناء الاستخدام لعرض الجيمات القريبة والتأكد من وصولك إلى الفرع المحجوز.',
            'NSPhotoLibraryUsageDescription': 'لاختيار صور إيصالات التحويل والجيم والمنتجات التي تريد رفعها على GymBank.',
        },
        'en': {key: info[key] for key in ['NSCameraUsageDescription', 'NSLocationWhenInUseUsageDescription', 'NSPhotoLibraryUsageDescription']},
    }
    for language, strings in translations.items():
        folder = ios / 'Runner' / (language + '.lproj')
        folder.mkdir(exist_ok=True)
        (folder / 'InfoPlist.strings').write_text(''.join(json.dumps(key) + ' = ' + json.dumps(value, ensure_ascii=False) + ';\n' for key, value in strings.items()))
    (ios / 'Runner/Base.lproj/LaunchScreen.storyboard').write_text(LAUNCH_STORYBOARD)

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
    launch = ios / 'Runner/Assets.xcassets/LaunchImage.imageset'
    launch.mkdir(exist_ok=True)
    images = []
    for scale in [1, 2, 3]:
        name = f'GymBankLaunch@{scale}x.png'
        launch_source = root / 'assets/brand/gymbank-wordmark.png'
        subprocess.run(['sips', '-z', str(94 * scale), str(280 * scale), str(launch_source),
                        '--out', str(launch / name)], check=True, stdout=subprocess.DEVNULL)
        images.append({'idiom': 'universal', 'filename': name, 'scale': f'{scale}x'})
    (launch / 'Contents.json').write_text(json.dumps({'images': images, 'info': {'version': 1, 'author': 'xcode'}}))
    print('Prepared GymBank iOS host: ' + BUNDLE_ID + ', iOS ' + MIN_IOS + '+')


if __name__ == '__main__':
    configure()
