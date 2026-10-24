import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/main.dart' show GymEntryScreen;
import 'package:gym_network/screens/account.dart';
import 'package:gym_network/screens/directory.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
  final mobilePlatforms = TargetPlatformVariant({TargetPlatform.android, TargetPlatform.iOS});
  testWidgets('account deletion is red and directly above logout in both account modes', (t) async {
    await t.binding.setSurfaceSize(const Size(393, 1400));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final api = client('TRAINEE', (_) async => reply({'items': []}));
    for (final work in [false, true]) {
      await t.pumpWidget(page(Scaffold(body: AccountScreen(key: ValueKey(work), api: api, workplace: work, ownerView: work))));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('حذف حسابي'));
      final deletion = find.byKey(const Key('account.delete'));
      final button = t.widget<OutlinedButton>(deletion);
      expect(button.style!.foregroundColor!.resolve({}), const Color(0xffba1a1a));
      expect(button.style!.side!.resolve({})!.color, const Color(0xffba1a1a));
      expect(t.getSize(deletion), t.getSize(find.widgetWithText(OutlinedButton, 'تسجيل الخروج')));
      expect(t.getBottomLeft(deletion).dy, lessThan(t.getTopLeft(find.text('تسجيل الخروج')).dy));
      expect(find.text('حذف الحساب'), findsNothing);
      expect(t.takeException(), isNull);
    }
  }, variant: mobilePlatforms);

  testWidgets('QR shortcuts open opaque pages with app bars and return to entry', (t) async {
    await t.binding.setSurfaceSize(const Size(375, 812));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/trainee/qr')) return reply({'token': List.filled(43, 'a').join(), 'expiresAt': DateTime.now().add(const Duration(minutes: 1)).toIso8601String(), 'serverTime': DateTime.now().toIso8601String()});
      return reply({'items': []});
    });
    await t.pumpWidget(page(const SizedBox()));
    await t.pumpWidget(page(Scaffold(body: GymEntryScreen(api: api))));
    await t.pumpAndSettle();
    for (final label in ['سجل زياراتي', 'اختار الفرع واحجز الآن']) {
      await t.tap(find.text(label)); await t.pumpAndSettle();
      expect(find.byType(AppBar), findsOneWidget);
      final scaffold = t.widget<Scaffold>(find.byType(Scaffold).last);
      expect(scaffold.backgroundColor ?? Theme.of(t.element(find.byType(AppBar))).scaffoldBackgroundColor, canvas);
      await t.pageBack(); await t.pumpAndSettle();
      expect(find.byType(GymEntryScreen), findsOneWidget);
      expect(t.takeException(), isNull);
    }
    await t.pumpWidget(const SizedBox()); await t.pump();
  }, variant: mobilePlatforms);

  testWidgets('gym booking and directions appear before details and are visible without scrolling', (t) async {
    await t.binding.setSurfaceSize(const Size(375, 812));
    addTearDown(() => t.binding.setSurfaceSize(null));
    final api = client('TRAINEE', (_) async => reply({'branch': {
      'id': 'branch', 'name': 'فرع اختبار', 'gym': {'name': 'جيم اختبار', 'description': 'تفاصيل المكان ' * 80},
      'city': 'شبين الكوم', 'governorate': 'المنوفية', 'address': 'عنوان اختبار',
      'latitude': 30.0, 'longitude': 31.0, 'visitPricePoints': 20, 'sessionMinutes': 90, 'images': [],
    }}));
    await t.pumpWidget(page(BranchDetail(api: api, id: 'branch')));
    // Map tiles have independent network work; do not wait for map animations to settle.
    await t.pump(); await t.pump(const Duration(milliseconds: 200));
    final directions = find.text('افتح الاتجاهات'), booking = find.text('احجز زيارتك');
    expect(directions.hitTestable(), findsOneWidget); expect(booking.hitTestable(), findsOneWidget);
    expect(t.getTopLeft(booking).dy, lessThan(t.getTopLeft(find.text('عن المكان')).dy));
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox()); await t.pump();
  }, variant: mobilePlatforms);
}
