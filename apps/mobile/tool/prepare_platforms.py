from pathlib import Path
p=Path('android/app/src/main/AndroidManifest.xml')
s=p.read_text().replace('<application','''<uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <application android:usesCleartextTraffic="false"''').replace('android:label="gym_network"','android:label="Gym Network"')
p.write_text(s)
p=Path('android/app/build.gradle.kts')
s=p.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 24')
p.write_text(s)
