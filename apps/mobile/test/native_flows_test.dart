import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/owner.dart';
import 'api_test.dart' show MemoryStore;

ApiClient fake(
  Future<http.Response> Function(http.Request) handler, {
  Json? user,
}) => ApiClient(storage: MemoryStore(), transport: MockClient(handler))
  ..restored = true
  ..user = user
  ..token = user == null ? null : 'synthetic';
http.Response response(String body, int status) => http.Response(
  body,
  status,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
void main() {
  testWidgets(
    'offline startup retry restores saved financial command before allowing another action',
    (t) async {
      final store = MemoryStore();
      store.values['session'] = 'synthetic-session';
      store.values['pending.one'] = jsonEncode({
        'path': 'topups',
        'body': {'points': 10},
        'key': newKey(),
        'actorId': 'one',
      });
      var offline = true;
      final api = ApiClient(
        storage: store,
        transport: MockClient((r) async {
          if (offline) throw http.ClientException('offline');
          final path = r.url.path;
          if (path.endsWith('/me'))
            return response(
              jsonEncode({
                'id': 'one',
                'role': 'TRAINEE',
                'displayName': 'متدرب تجريبي',
              }),
              200,
            );
          if (path.endsWith('/trainee/wallet'))
            return response(
              jsonEncode({
                'spendablePoints': 0,
                'unavailablePoints': 0,
                'expiresAt': null,
              }),
              200,
            );
          return response('{"items":[]}', 200);
        }),
      );
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('إعادة المحاولة'), findsOneWidget);
      expect(api.pending, isNull);
      offline = false;
      await t.tap(find.text('إعادة المحاولة'));
      await t.pumpAndSettle();
      expect(api.user?['id'], 'one');
      expect(api.pending?['path'], 'topups');
      expect(find.text('إعادة نفس العملية بأمان'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets(
    'Arabic login and both registration paths fit narrow mobile and retain email entry',
    (t) async {
      t.view.physicalSize = const Size(320, 740);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final api = fake((_) async => response('{}', 200));
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('تسجيل الدخول'), findsOneWidget);
      await t.ensureVisible(find.text('جديد معانا؟ أنشئ حساب'));
      await t.tap(find.text('جديد معانا؟ أنشئ حساب'));
      await t.pumpAndSettle();
      expect(find.text('الإيميل'), findsOneWidget);
      await t.ensureVisible(find.text('صاحب جيم'));
      await t.tap(find.text('صاحب جيم'));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.text('اسم الجيم'),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('اسم الجيم'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'pending owner sees only application status and cannot enter financial shell',
    (t) async {
      final api = fake(
        (r) async => response(
          jsonEncode(
            r.url.path.endsWith('gym-application')
                ? {
                    'application': {
                      'id': 'a1',
                      'gymName': 'جيم التجربة',
                      'status': 'PENDING',
                      'governorate': 'المنوفية',
                      'city': 'شبين',
                      'address': 'عنوان تجريبي',
                      'version': 1,
                    },
                  }
                : {'items': []},
          ),
          200,
        ),
        user: {'id': 'o1', 'role': 'GYM_OWNER', 'displayName': 'مالك تجريبي'},
      );
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('طلبك وصلنا'), findsOneWidget);
      expect(find.text('إرسال نقاط لمتدرب'), findsNothing);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'owner send reveals full recipient before review and posts exact quoted cash sale',
    (t) async {
      Json? posted;
      final api = fake((r) async {
        if (r.url.path.endsWith('/lookup'))
          return response(
            jsonEncode({'id': 'trainee-1', 'label': 'متدرب تجريبي كامل'}),
            200,
          );
        if (r.url.path.endsWith('/quotes'))
          return response(
            jsonEncode({
              'recipientId': 'trainee-1',
              'recipientLabel': 'متدرب تجريبي كامل',
              'points': 10,
              'chargePiasters': '1250',
              'pricingVersion': 2,
              'stock': '100',
              'recipientAfter': '30',
            }),
            200,
          );
        posted = Map<String, dynamic>.from(jsonDecode(r.body));
        return response(
          jsonEncode({
            'id': 'receipt-1',
            'points': 10,
            'recipientLabel': 'متدرب تجريبي كامل',
            'chargePiasters': '1250',
          }),
          201,
        );
      }, user: {'id': 'o1', 'role': 'GYM_OWNER'});
      await t.pumpWidget(
        MaterialApp(
          theme: appTheme(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: SendPoints(api: api, gym: const {'id': 'g1'}),
          ),
        ),
      );
      await t.enterText(find.byType(TextField).first, '01000000000');
      await t.tap(find.text('متابعة'));
      await t.pumpAndSettle();
      expect(find.text('متدرب تجريبي كامل'), findsOneWidget);
      await t.enterText(find.byType(TextField).first, '10');
      await t.tap(find.text('مراجعة الإرسال'));
      await t.pumpAndSettle();
      expect(find.text('12.50 ج.م'), findsOneWidget);
      await t.ensureVisible(find.byType(CheckboxListTile));
      await t.tap(find.byType(CheckboxListTile));
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('تأكيد الإرسال'));
      await t.tap(find.text('تأكيد الإرسال'));
      await t.pumpAndSettle();
      expect(posted?['fundsReceived'], true);
      expect(posted?['receivedAmountPiasters'], '1250');
      expect(posted?['gymId'], 'g1');
      expect(find.text('تم إرسال النقاط'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
}
