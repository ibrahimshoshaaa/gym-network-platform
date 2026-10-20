import base64
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from configure_signing import configure
from install_signing import install, REQUIRED

class SigningTests(unittest.TestCase):
    def test_release_never_falls_back_to_debug_identity(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'build.gradle.kts'
            path.write_text('android {\n    buildTypes {\n        release {\n            signingConfig = signingConfigs.getByName("debug")\n        }\n    }\n}')
            configure(path)
            configured = path.read_text()
            self.assertNotIn('getByName("debug")', configured)
            self.assertIn('getByName("gymbankRelease")', configured)
            self.assertIn('ANDROID_KEYSTORE_PASSWORD', configured)
            configure(path)
            self.assertEqual(path.read_text(), configured)

    def test_changed_flutter_template_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'build.gradle.kts'
            path.write_text('unexpected template')
            with self.assertRaises(SystemExit): configure(path)
            self.assertEqual(path.read_text(),'unexpected template')

    def test_missing_secrets_cannot_create_a_release_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit): install()

    def test_keystore_is_restored_with_private_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'private'/'release.jks'
            env={name:'test-only' for name in REQUIRED}
            env.update(ANDROID_KEYSTORE_BASE64=base64.b64encode(b'synthetic fixture').decode(),GYMBANK_KEYSTORE_PATH=str(target))
            with patch.dict(os.environ, env, clear=True): install()
            self.assertEqual(target.read_bytes(), b'synthetic fixture')
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)

if __name__=='__main__': unittest.main()

class BootstrapTests(unittest.TestCase):
    def test_one_time_setup_generates_a_real_key_and_uploads_without_printing_passwords(self):
        import hashlib
        import json
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);bin_dir=root/'bin';bin_dir.mkdir()
            fake=bin_dir/'gh'
            fake.write_text('''#!/usr/bin/env python3
import os,sys
from pathlib import Path
if sys.argv[1:3]==['secret','list']: print('[]')
if sys.argv[1:3]==['secret','set']:
 p=Path(os.environ['TEST_SECRET_DIR'])/sys.argv[3];p.write_bytes(sys.stdin.buffer.read());p.chmod(0o600)
''')
            fake.chmod(0o700)
            uploaded=root/'uploaded';uploaded.mkdir()
            backup=root/'backup'
            env={**os.environ,'PATH':str(bin_dir)+os.pathsep+os.environ['PATH'],'TEST_SECRET_DIR':str(uploaded)}
            result=subprocess.run([sys.executable,str(Path(__file__).with_name('setup_release_signing.py')),'--backup-dir',str(backup)],env=env,capture_output=True,text=True,check=True)
            saved=json.loads((backup/'credentials.json').read_text())
            self.assertNotIn(saved['storePassword'],result.stdout+result.stderr)
            self.assertEqual(set(p.name for p in uploaded.iterdir()),set(REQUIRED))
            self.assertEqual(base64.b64decode((uploaded/'ANDROID_KEYSTORE_BASE64').read_text()),(backup/'gymbank-release.jks').read_bytes())
            cert=subprocess.run(['keytool','-exportcert','-keystore',str(backup/'gymbank-release.jks'),'-alias',saved['alias'],'-storepass:env','TEST_STORE_PASSWORD'],env={**env,'TEST_STORE_PASSWORD':saved['storePassword']},capture_output=True,check=True).stdout
            self.assertEqual(hashlib.sha256(cert).hexdigest(),saved['certificateSha256'])
            again=subprocess.run([sys.executable,str(Path(__file__).with_name('setup_release_signing.py')),'--backup-dir',str(backup)],env=env,capture_output=True,text=True)
            self.assertNotEqual(again.returncode,0)

class ApkVerificationTests(unittest.TestCase):
    def test_wrong_certificate_blocks_release_before_upload(self):
        from verify_apks import verify
        from types import SimpleNamespace
        with patch('verify_apks.subprocess.run',return_value=SimpleNamespace(stdout='Signer #1 certificate SHA-256 digest: '+('a'*64))):
            with self.assertRaises(SystemExit): verify(Path('app.apk'),'apksigner','aapt','b'*64,100001)

    def test_wrong_package_or_version_blocks_release(self):
        from verify_apks import verify
        from types import SimpleNamespace
        results=[SimpleNamespace(stdout='Signer #1 certificate SHA-256 digest: '+('a'*64)),SimpleNamespace(stdout="package: name='wrong.package' versionCode='100001' versionName='0.2.7'")]
        with patch('verify_apks.subprocess.run',side_effect=results):
            with self.assertRaises(SystemExit): verify(Path('app.apk'),'apksigner','aapt','a'*64,100001)

    def test_unsigned_or_corrupt_apk_blocks_release(self):
        from verify_apks import verify
        import subprocess
        with patch('verify_apks.subprocess.run',side_effect=subprocess.CalledProcessError(1,'apksigner')):
            with self.assertRaises(subprocess.CalledProcessError): verify(Path('app.apk'),'apksigner','aapt','a'*64,100001)


class SdkScopedSignerTests(unittest.TestCase):
    def test_same_key_across_android_sdk_ranges_is_accepted(self):
        from verify_apks import verify
        from types import SimpleNamespace
        digest='a'*64
        output='\n'.join('Signer (minSdkVersion='+str(lo)+', maxSdkVersion='+str(hi)+') certificate SHA-256 digest: '+digest for lo,hi in [(24,32),(33,2147483647)])
        results=[SimpleNamespace(stdout=output),SimpleNamespace(stdout="package: name='net.shotech.gym_network' versionCode='100001' versionName='0.2.7'")]
        with patch('verify_apks.subprocess.run',side_effect=results):
            verify(Path('synthetic.apk'),'apksigner','aapt',digest,100001)

    def test_unexpected_key_in_any_sdk_range_is_rejected(self):
        from verify_apks import verify
        from types import SimpleNamespace
        output='Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: '+('a'*64)+'\nSigner (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: '+('b'*64)
        with patch('verify_apks.subprocess.run',return_value=SimpleNamespace(stdout=output)):
            with self.assertRaises(SystemExit): verify(Path('synthetic.apk'),'apksigner','aapt','a'*64,100001)


class CertificatePreflightTests(unittest.TestCase):
    def test_keystore_fingerprint_mismatch_stops_before_compilation(self):
        import hashlib
        from types import SimpleNamespace
        from install_signing import preflight
        with patch('install_signing.install'),patch.dict(os.environ,{'GYMBANK_KEYSTORE_PATH':'fixture.jks','ANDROID_KEY_ALIAS':'gymbank','ANDROID_SIGNING_CERT_SHA256':'b'*64}),patch('install_signing.subprocess.run',return_value=SimpleNamespace(stdout=b'synthetic certificate')):
            with self.assertRaises(SystemExit): preflight()

    def test_correct_keystore_fingerprint_accepts_display_spacing(self):
        import hashlib
        from types import SimpleNamespace
        from install_signing import preflight
        digest=hashlib.sha256(b'synthetic certificate').hexdigest()
        with patch('install_signing.install'),patch.dict(os.environ,{'GYMBANK_KEYSTORE_PATH':'fixture.jks','ANDROID_KEY_ALIAS':'gymbank','ANDROID_SIGNING_CERT_SHA256':' '+':'.join(digest[i:i+2] for i in range(0,64,2))+'\n'}),patch('install_signing.subprocess.run',return_value=SimpleNamespace(stdout=b'synthetic certificate')):
            preflight()

    def test_numbered_sdk_scoped_certificate_label_is_accepted(self):
        from verify_apks import verify
        from types import SimpleNamespace
        digest='a'*64
        output='Signer #1 (minSdkVersion=24, maxSdkVersion=2147483647) certificate SHA-256 digest: '+digest
        results=[SimpleNamespace(stdout=output),SimpleNamespace(stdout="package: name='net.shotech.gym_network' versionCode='100001' versionName='0.2.7'")]
        with patch('verify_apks.subprocess.run',side_effect=results): verify(Path('fixture.apk'),'apksigner','aapt',digest,100001)


class Android37SignerTests(unittest.TestCase):
    def test_android37_versioned_signer_matches_the_permanent_identity(self):
        from verify_apks import verify
        from types import SimpleNamespace
        digest='a'*64
        output='Verifies\nV3.0 Signer: certificate SHA-256 digest: '+digest+'\n'
        results=[SimpleNamespace(stdout=output),SimpleNamespace(stdout="package: name='net.shotech.gym_network' versionCode='100001' versionName='0.2.7'")]
        with patch('verify_apks.subprocess.run',side_effect=results): verify(Path('fixture.apk'),'apksigner','aapt',digest,100001)

    def test_android37_unexpected_identity_is_rejected(self):
        from verify_apks import verify
        from types import SimpleNamespace
        output='V3.0 Signer: certificate SHA-256 digest: '+('b'*64)
        with patch('verify_apks.subprocess.run',return_value=SimpleNamespace(stdout=output)):
            with self.assertRaises(SystemExit): verify(Path('fixture.apk'),'apksigner','aapt','a'*64,100001)


class SplitAbiVersionTests(unittest.TestCase):
    def test_each_split_uses_flutter347_version_code_offsets(self):
        from verify_apks import split_metadata
        for abi,offset in [('armeabi-v7a',1000),('arm64-v8a',2000),('x86_64',4000)]:
            self.assertEqual(split_metadata(Path('app-'+abi+'-release.apk'),100042),(abi,100042+offset))
        from verify_apks import split_metadata
        with self.assertRaises(SystemExit): split_metadata(Path('unexpected.apk'),100042)

    def test_arm64_split_checks_exact_version_architecture_and_signer(self):
        from verify_apks import verify
        from types import SimpleNamespace
        output='V3.0 Signer: certificate SHA-256 digest: '+('a'*64)
        metadata="package: name='net.shotech.gym_network' versionCode='102042' versionName='0.2.7'\nnative-code: 'arm64-v8a'"
        with patch('verify_apks.subprocess.run',side_effect=[SimpleNamespace(stdout=output),SimpleNamespace(stdout=metadata)]):
            verify(Path('app-arm64-v8a-release.apk'),'apksigner','aapt','a'*64,102042,'arm64-v8a')
        with patch('verify_apks.subprocess.run',side_effect=[SimpleNamespace(stdout=output),SimpleNamespace(stdout=metadata)]):
            with self.assertRaises(SystemExit): verify(Path('app-arm64-v8a-release.apk'),'apksigner','aapt','a'*64,102042,'armeabi-v7a')
