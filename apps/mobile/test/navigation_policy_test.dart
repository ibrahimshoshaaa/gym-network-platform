import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/navigation_policy.dart';
void main(){
 test('only exact production HTTPS origin may use the authenticated view',(){expect(isInternal(Uri.parse(platformOrigin)),true);for(final value in ['http://gym-network-platform.vercel.app','https://gym-network-platform.vercel.app.evil.test','https://evil.test','file:///secret','https://x@gym-network-platform.vercel.app','https://gym-network-platform.vercel.app:8443']){expect(isInternal(Uri.tryParse(value)),false,reason:value);}});
 test('external navigation uses a bounded set of business destinations',(){expect(isExternalAllowed(Uri.parse('https://wa.me/201000000001')),true);expect(isExternalAllowed(Uri.parse('https://www.google.com/maps/dir/?api=1')),true);for(final value in ['javascript:alert(1)','intent://secret','https://evil.test','tel:123;secret','https://wa.me.evil.test']){expect(isExternalAllowed(Uri.tryParse(value)),false,reason:value);}});
}
