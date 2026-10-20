import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/topup.dart';
import 'api_test.dart' show MemoryStore;

void main() {
  for (final owner in [false, true]) {
    testWidgets('versioned package and payment review for owner=$owner', (t) async {
      Json? selection;
      var submitted = false;
      final api = ApiClient(storage: MemoryStore(), transport: MockClient((r) async {
        Object data;
        if (r.url.path.endsWith('topup-options')) {
          data = {'policy': {'pointPricePiasters': '100', 'gymDiscountBps': 1000},
            'paymentMethods': [{'type': 'INSTAPAY', 'account': 'gym@test', 'accountName': 'GymBank', 'version': 3}],
            'packages': [{'id': 'p1', 'version': 7, 'points': 100, 'label': 'باقة ١٠٠'}]};
        } else if (r.url.path.endsWith('topup-quotes')) {
          selection = Map<String, dynamic>.from(jsonDecode(r.body));
          data = {'points': 100, 'chargePiasters': owner ? '9000' : '10000', 'pricingVersion': 2};
        } else { submitted = true; data = {}; }
        return http.Response(jsonEncode(data), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      }))..token = 'synthetic'..user = {'id': 'u1', 'role': owner ? 'GYM_OWNER' : 'TRAINEE'};
      await t.pumpWidget(MaterialApp(theme: appTheme(), home: Directionality(textDirection: TextDirection.rtl,
        child: TopupScreen(api: api, gymId: owner ? 'g1' : null))));
      await t.pumpAndSettle();
      expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'متابعة لبيانات التحويل')).onPressed, isNull);
      await t.tap(find.text('100 نقطة').first);
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('متابعة لبيانات التحويل'));
      await t.tap(find.text('متابعة لبيانات التحويل'));
      await t.pumpAndSettle();
      expect(selection?['packageId'], 'p1');
      expect(selection?['packageVersion'], 7);
      expect(selection?['receivingGymId'], owner ? 'g1' : null);
      expect(selection?['kind'], owner ? 'BRANCH_STOCK' : 'TRAINEE');
      expect(find.text('gym@test'), findsOneWidget);
      expect(find.byType(CheckboxListTile), findsNothing);
      await t.ensureVisible(find.text('مراجعة طلب الشحن'));
      expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'مراجعة طلب الشحن')).onPressed, isNull);
      expect(submitted, isFalse);
      await t.tap(find.text('تعديل الرصيد المختار'));
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '١٢٣');
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('متابعة لبيانات التحويل'));
      await t.tap(find.text('متابعة لبيانات التحويل'));
      await t.pumpAndSettle();
      expect(selection?['points'], 123);
      expect(selection!.containsKey('packageId'), isFalse);
      expect(t.takeException(), isNull);
    });
  }
}
