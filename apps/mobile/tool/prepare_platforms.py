from pathlib import Path
p=Path('android/app/src/main/AndroidManifest.xml')
s=p.read_text().replace('<application','''<uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <application android:allowBackup="false" android:usesCleartextTraffic="false"''').replace('android:label="gym_network"','android:label="GymBank"')
p.write_text(s)
p=Path('android/app/build.gradle.kts')
s=p.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 24')
p.write_text(s)


# iOS uses the same native Dart screens; distribution requires an Apple signing identity.
plist=Path('ios/Runner/Info.plist')
if plist.exists():
    s=plist.read_text().replace('<string>Gym Network</string>','<string>GymBank</string>').replace('</dict>\n</plist>', '<key>NSLocationWhenInUseUsageDescription</key><string>لعرض الجيمات القريبة وتحديد مكان الفرع باختيارك.</string><key>NSCameraUsageDescription</key><string>لمسح رمز دخول المتدرب وتسجيل حضوره في الجيم.</string><key>NSPhotoLibraryUsageDescription</key><string>لاختيار صورة إيصال التحويل وصور الجيم.</string></dict>\n</plist>')
    plist.write_text(s)

# Use the supplied GymBank artwork at Android's standard launcher densities.
from shutil import copyfile
for density in ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']:
    target=Path('android/app/src/main/res')/('mipmap-'+density)/'ic_launcher.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    copyfile(Path('assets/brand/launcher')/(density+'.png'),target)

# Android 8+ launchers mask the icon themselves. An opaque dark adaptive
# background avoids the white wrapper applied to legacy bitmap icons.
res=Path('android/app/src/main/res')
(res/'mipmap-anydpi-v26').mkdir(parents=True,exist_ok=True)
(res/'values').mkdir(parents=True,exist_ok=True)
(res/'drawable-nodpi').mkdir(parents=True,exist_ok=True)
copyfile(Path('assets/brand/gymbank-icon.png'),res/'drawable-nodpi/gymbank_foreground.png')
copyfile(Path('assets/brand/gymbank-wordmark.png'),res/'drawable-nodpi/gymbank_launch_wordmark.png')
(res/'values/gymbank_launcher.xml').write_text('<resources><color name="gymbank_launcher_background">#101719</color></resources>')
(res/'values/gymbank_splash.xml').write_text('<resources><color name="gymbank_splash_background">#F7F9F8</color></resources>')
launch_background = '''<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/gymbank_splash_background" />
    <item android:width="280dp" android:height="94dp" android:gravity="center">
        <bitmap android:gravity="fill" android:src="@drawable/gymbank_launch_wordmark" />
    </item>
</layer-list>
'''
for directory in ['drawable', 'drawable-v21']:
    (res/directory).mkdir(parents=True, exist_ok=True)
    (res/directory/'launch_background.xml').write_text(launch_background)
(res/'mipmap-anydpi-v26/ic_launcher.xml').write_text('''<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
<background android:drawable="@color/gymbank_launcher_background"/>
<foreground android:drawable="@drawable/gymbank_foreground"/>
</adaptive-icon>''')

