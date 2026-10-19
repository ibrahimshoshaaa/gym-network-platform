import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/operations.dart';
import 'api_test.dart' show MemoryStore;

const branch = <String, dynamic>{'id': 'b1', 'gymId': 'g1', 'name': 'فرع شبين',
  'gymName': 'جيم التجربة', 'canSell': true, 'canCancel': false};
http.Response reply(Object data) => http.Response(jsonEncode(data), 200,
  headers: {'content-type': 'application/json; charset=utf-8'});
ApiClient client(String role, Future<http.Response> Function(http.Request) handle) =>
  ApiClient(storage: MemoryStore(), transport: MockClient(handle))
    ..restored = true ..token = 'synthetic' ..user = {'id': 'u1', 'role': role, 'displayName': 'موظف تجريبي'};
Widget page(Widget child) => MaterialApp(theme: appTheme(), home: Directionality(textDirection: TextDirection.rtl, child: child));

void main() {
  testWidgets('trainee with a staff assignment can switch to work without losing trainee navigation', (t) async {
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('me/access')) return reply({'ownedGyms': [], 'assignments': [{'role': 'CASHIER'}]});
      if (r.url.path.endsWith('operations/branches')) return reply({'items': [branch]});
      if (r.url.path.endsWith('trainee/wallet')) return reply({'spendablePoints': 0, 'unavailablePoints': 0});
      return reply({'items': []});
    });
    await t.pumpWidget(GymNetworkApp(api: api)); await t.pumpAndSettle();
    expect(find.text('زياراتي'), findsOneWidget);
    await t.tap(find.text('عملي في الجيم')); await t.pumpAndSettle();
    expect(find.text('فرع شبين'), findsOneWidget);
    await t.tap(find.text('حساب المتدرب')); await t.pumpAndSettle();
    expect(find.text('زياراتي'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  for (final role in ['CASHIER', 'BRANCH_MANAGER']) {
    testWidgets('$role opens a native workplace and branch actions', (t) async {
      final api = client(role, (r) async => reply(r.url.path.endsWith('/summary')
        ? {'stock': 100, 'visitPricePoints': 30, 'sessionMinutes': 120} : {'items': [branch]}));
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('مساحة الإدارة على الويب'), findsNothing);
      expect(find.text('فرع شبين'), findsOneWidget);
      await t.tap(find.text('فتح الفرع'));
      await t.pumpAndSettle();
      expect(find.text('تسجيل زيارة'), findsOneWidget);
      expect(find.text('شحن نقاط لمتدرب'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('unassigned staff sees a useful empty state', (t) async {
    final api = client('CASHIER', (_) async => reply({'items': []}));
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    expect(find.text('مفيش فرع متاح للتشغيل'), findsOneWidget);
    expect(find.text('افتح لوحة الويب'), findsNothing);
  });
  testWidgets('branch sale requires review and exact quoted collection', (t) async {
    Json? posted;
    final api = client('CASHIER', (r) async {
      if (r.url.path.endsWith('/trainee-lookup')) return reply({'id': 't1', 'label': 'متدرب تجريبي', 'phoneLast4': '5678'});
      if (r.url.path.endsWith('/sale-quotes')) return reply({'points': 10, 'chargePiasters': '1250', 'pricingVersion': 2, 'stock': 100});
      posted = Map<String, dynamic>.from(jsonDecode(r.body));
      expect(r.headers['idempotency-key'], isNotNull);
      return reply({'id': 'sale1', 'points': 10, 'chargePiasters': '1250'});
    });
    await t.pumpWidget(page(BranchSale(api: api, branch: branch)));
    await t.enterText(find.byType(TextField).first, '01012345678');
    await t.tap(find.text('بحث عن المتدرب')); await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).first, '10');
    await t.tap(find.text('مراجعة الشحن')); await t.pumpAndSettle();
    expect(posted, isNull);
    await t.ensureVisible(find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile)); await t.pumpAndSettle();
    await t.ensureVisible(find.text('تأكيد الشحن'));
    await t.tap(find.text('تأكيد الشحن')); await t.pumpAndSettle();
    expect(posted?['receivedAmountPiasters'], '1250');
    expect(posted?['fundsReceived'], true);
    expect(posted?['traineeId'], 't1');
    expect(find.text('تم شحن المتدرب'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets('visit keeps token and versions from review and handles existing attendance', (t) async {
    Json? posted;
    final api = client('BRANCH_MANAGER', (r) async {
      if (r.url.path.endsWith('/visit-previews')) return reply({'traineeLabel': 'متدرب تجريبي', 'phoneLast4': '5678',
        'points': 30, 'balance': null, 'sessionMinutes': 120, 'pricingVersion': 2, 'branchPricingVersion': 3, 'alreadyActive': true});
      posted = Map<String, dynamic>.from(jsonDecode(r.body));
      return reply({'alreadyActive': true, 'visit': {'id': 'v1', 'pointsCharged': 30, 'expiresAt': '2026-10-20T12:00:00Z'}});
    });
    await t.pumpWidget(page(RecordVisit(api: api, branch: branch)));
    final token = List.filled(43, 'a').join();
    await t.enterText(find.byType(TextField).first, token);
    await t.tap(find.text('مراجعة الزيارة')); await t.pumpAndSettle();
    expect(posted, isNull);
    await t.ensureVisible(find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile)); await t.pumpAndSettle();
    await t.ensureVisible(find.text('تأكيد الحضور'));
    await t.tap(find.text('تأكيد الحضور')); await t.pumpAndSettle();
    expect(posted?['token'], token);
    expect(posted?['branchPricingVersion'], 3);
    expect(posted?['presenceConfirmed'], true);
    expect(find.text('الزيارة مسجلة بالفعل'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
