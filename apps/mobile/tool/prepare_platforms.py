from pathlib import Path
p=Path('android/app/src/main/AndroidManifest.xml')
s=p.read_text().replace('<application','''<uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.CAMERA"/>
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
    <uses-feature android:name="android.hardware.camera" android:required="false"/>
    <application android:allowBackup="false" android:usesCleartextTraffic="false"''').replace('android:label="gym_network"','android:label="Gym Network"')
p.write_text(s)
p=Path('android/app/build.gradle.kts')
s=p.read_text().replace('minSdk = flutter.minSdkVersion','minSdk = 24')
p.write_text(s)


# iOS uses the same native Dart screens; distribution requires an Apple signing identity.
plist=Path('ios/Runner/Info.plist')
if plist.exists():
    s=plist.read_text().replace('</dict>\n</plist>', '<key>NSLocationWhenInUseUsageDescription</key><string>لعرض الجيمات القريبة وتحديد مكان الفرع باختيارك.</string><key>NSPhotoLibraryUsageDescription</key><string>لاختيار صورة إيصال التحويل وصور الجيم.</string></dict>\n</plist>')
    plist.write_text(s)

# Repository-owned network mark, generated with the standard library for every density.
import struct, zlib, math
def icon_png(size):
    navy=(18,47,54,255); lime=(220,246,138,255)
    pts=[(.27,.72),(.27,.28),(.73,.72),(.73,.28)]
    def segment(x,y,a,b):
        dx=b[0]-a[0];dy=b[1]-a[1];t=max(0,min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)))
        return math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)
    raw=bytearray()
    for j in range(size):
        raw.append(0)
        for i in range(size):
            x=(i+.5)/size;y=(j+.5)/size
            fg=any(math.hypot(x-a,y-b)<.074 for a,b in pts) or any(segment(x,y,pts[k],pts[k+1])<.033 for k in range(3))
            raw.extend(lime if fg else navy)
    def chunk(t,d):return struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(raw)))+chunk(b'IEND',b'')
for density,size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    target=Path('android/app/src/main/res')/('mipmap-'+density)/'ic_launcher.png'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(icon_png(size))
