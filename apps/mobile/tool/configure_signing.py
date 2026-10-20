"""Replace Flutter's generated debug signing fallback with a release identity."""
from pathlib import Path

BLOCK = '''    signingConfigs {
        create("gymbankRelease") {
            storeFile = System.getenv("GYMBANK_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

'''

def configure(path):
    text = path.read_text()
    if 'create("gymbankRelease")' in text:
        return
    original = 'signingConfig = signingConfigs.getByName("debug")'
    if text.count(original) != 1 or text.count('    buildTypes {') != 1:
        raise SystemExit('Flutter signing template changed; refusing an unverified release configuration')
    text = text.replace('    buildTypes {', BLOCK + '    buildTypes {')
    text = text.replace(original, 'signingConfig = signingConfigs.getByName("gymbankRelease")')
    path.write_text(text)

if __name__ == '__main__':
    configure(Path('android/app/build.gradle.kts'))
