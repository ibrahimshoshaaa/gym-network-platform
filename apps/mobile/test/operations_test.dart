import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/operations.dart';
import 'api_test.dart' show MemoryStore;

const branch = <String, dynamic>{
  'id': 'b1',
  'gymId': 'g1',
  'name': 'فرع شبين',
  'gymName': 'جيم التجربة',
  'canSell': true,
  'canCancel': false,
};
http.Response reply(Object data) => http.Response(
  jsonEncode(data),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
ApiClient client(
  String role,
  Future<http.Response> Function(http.Request) handle,
) => ApiClient(storage: MemoryStore(), transport: MockClient(handle))
  ..restored = true
  ..token = 'synthetic'
  ..user = {'id': 'u1', 'role': role, 'displayName': 'موظف تجريبي'};
Widget page(Widget child) => MaterialApp(
  theme: appTheme(),
  home: Directionality(textDirection: TextDirection.rtl, child: child),
);

void main() {
  test(
    'accepts web and native QR tickets without accepting other payloads',
    () {
      final token = List.filled(43, 'a').join();
      expect(visitTicket(token), token);
      expect(visitTicket('gymqr:$token'), token);
      expect(visitTicket('https://example.test/$token'), isNull);
      expect(visitTicket('gymqr:short'), isNull);
    },
  );
  testWidgets(
    'trainee with a staff assignment can switch to work without losing trainee navigation',
    (t) async {
      final api = client('TRAINEE', (r) async {
        if (r.url.path.endsWith('me/access'))
          return reply({
            'ownedGyms': [],
            'assignments': [
              {'role': 'CASHIER'},
            ],
          });
        if (r.url.path.endsWith('operations/branches'))
          return reply({
            'items': [branch],
          });
        if (r.url.path.endsWith('trainee/wallet'))
          return reply({'spendablePoints': 0, 'unavailablePoints': 0});
        return reply({'items': []});
      });
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('الماركت'), findsOneWidget);
      await t.tap(find.text('عملي في الجيم'));
      await t.pumpAndSettle();
      expect(find.text('فرع شبين'), findsOneWidget);
      await t.tap(find.text('حساب المتدرب'));
      await t.pumpAndSettle();
      expect(find.text('الماركت'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  for (final role in ['CASHIER', 'BRANCH_MANAGER']) {
    testWidgets('$role opens a native workplace and branch actions', (t) async {
      final api = client(
        role,
        (r) async => reply(
          r.url.path.endsWith('/summary')
              ? {'stock': 100, 'visitPricePoints': 30, 'sessionMinutes': 120}
              : {
                  'items': [branch],
                },
        ),
      );
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      expect(find.text('مساحة الإدارة على الويب'), findsNothing);
      expect(find.text('فرع شبين'), findsOneWidget);
      expect(find.text('تسجيل زيارة'), findsOneWidget);
      expect(find.text('بيع نقاط لمتدرب'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('zero stock keeps attendance available and disables point sales', (t) async {
    final api = client('CASHIER', (r) async => reply(
      r.url.path.contains('reports/') ? {'visits': {'count': 0}, 'sales': {'points': 0, 'amountPiasters': '0'}}
      : {'stock': 0, 'visitPricePoints': 20, 'sessionMinutes': 120}));
    await t.pumpWidget(page(Scaffold(body: BranchDashboard(api: api, branch: branch))));
    await t.pumpAndSettle();
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'تسجيل زيارة')).onPressed, isNotNull);
    expect(t.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'بيع نقاط لمتدرب')).onPressed, isNull);
    expect(t.takeException(), isNull);
  });
  for (final manager in [false, true]) {
    testWidgets('visit cancellation follows branch capability $manager', (t) async {
      final api = client('BRANCH_MANAGER', (_) async => reply({}));
      await t.pumpWidget(page(VisitCancellation(api: api, branch: {...branch, 'canCancel': manager},
        visit: {'id': 'v1', 'pointsCharged': 20, 'startedAt': DateTime.now().toUtc().toIso8601String()})));
      await t.pumpAndSettle();
      expect(find.text('تأكيد إلغاء الزيارة'), manager ? findsOneWidget : findsNothing);
      expect(find.text('إرسال طلب مراجعة'), manager ? findsNothing : findsOneWidget);
      expect(find.byType(TextField), findsNWidgets(manager ? 1 : 2));
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('selected assigned branch persists between sales and visits', (t) async {
    final paths = <String>[];
    final api = client('CASHIER', (r) async {
      paths.add(r.url.path);
      if (r.url.path.endsWith('operations/branches')) return reply({'items': [branch, {...branch, 'id': 'b2', 'name': 'فرع تاني', 'canCancel': true}]});
      return reply({'items': [], 'stock': 100});
    });
    await t.pumpWidget(page(NativeShell(api: api, gyms: const [])));
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButton<String>));
    await t.pumpAndSettle();
    await t.tap(find.text('فرع تاني').last);
    await t.pumpAndSettle();
    expect(find.text('مدير الفرع'), findsOneWidget);
    await t.tap(find.text('المبيعات'));
    await t.pumpAndSettle();
    expect(paths.last, endsWith('/operations/branches/b2/sales'));
    await t.tap(find.text('الزيارات'));
    await t.pumpAndSettle();
    expect(paths.last, endsWith('/operations/branches/b2/visits'));
    expect(t.takeException(), isNull);
  });
  testWidgets('delayed daily report does not block stock and attendance', (t) async {
    final delayed = Completer<http.Response>();
    final api = client('CASHIER', (r) async => r.url.path.contains('reports/') ? delayed.future : reply({'stock': 50, 'visitPricePoints': 20, 'sessionMinutes': 120}));
    await t.pumpWidget(page(Scaffold(body: BranchDashboard(api: api, branch: branch))));
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    expect(find.text('50 نقطة'), findsOneWidget);
    expect(t.widget<FilledButton>(find.widgetWithText(FilledButton, 'تسجيل زيارة')).onPressed, isNotNull);
    delayed.complete(http.Response('{"code":"SERVICE_UNAVAILABLE"}', 503));
    await t.pumpAndSettle();
    expect(find.text('50 نقطة'), findsOneWidget);
    expect(find.text('0 ج.م'), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets('unassigned staff sees a useful empty state', (t) async {
    final api = client('CASHIER', (_) async => reply({'items': []}));
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    expect(find.text('مفيش فرع متاح للتشغيل'), findsOneWidget);
    expect(find.text('افتح لوحة الويب'), findsNothing);
  });
  testWidgets('branch sale requires review and exact quoted collection', (
    t,
  ) async {
    Json? posted;
    final api = client('CASHIER', (r) async {
      if (r.url.path.endsWith('/trainee-lookup'))
        return reply({
          'id': 't1',
          'label': 'متدرب تجريبي',
          'phoneLast4': '5678',
        });
      if (r.url.path.endsWith('/sale-quotes'))
        return reply({
          'points': 10,
          'chargePiasters': '1250',
          'pricingVersion': 2,
          'stock': 100,
        });
      posted = Map<String, dynamic>.from(jsonDecode(r.body));
      expect(r.headers['idempotency-key'], isNotNull);
      return reply({'id': 'sale1', 'points': 10, 'chargePiasters': '1250'});
    });
    await t.pumpWidget(page(BranchSale(api: api, branch: branch)));
    await t.enterText(find.byType(TextField).first, '01012345678');
    await t.tap(find.text('بحث عن المتدرب'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).first, '10');
    await t.ensureVisible(find.text('مراجعة الشحن'));
    await t.tap(find.text('مراجعة الشحن'));
    await t.pumpAndSettle();
    expect(posted, isNull);
    expect(find.text('90 نقطة'), findsOneWidget);
    await t.scrollUntilVisible(find.text('تعديل النقاط'), 150,
      scrollable: find.byType(Scrollable).first);
    await t.tap(find.text('تعديل النقاط'));
    await t.pumpAndSettle();
    expect(find.text('متدرب تجريبي'), findsOneWidget);
    expect(find.text('بحث عن المتدرب'), findsNothing);
    await t.ensureVisible(find.text('مراجعة الشحن'));
    await t.tap(find.text('مراجعة الشحن'));
    await t.pumpAndSettle();
    expect(t.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value, false);
    expect(posted, isNull);
    await t.ensureVisible(find.byType(CheckboxListTile));
    await t.tap(find.byType(CheckboxListTile));
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('تأكيد الشحن'));
    await t.tap(find.text('تأكيد الشحن'));
    await t.pumpAndSettle();
    expect(posted?['receivedAmountPiasters'], '1250');
    expect(posted?['fundsReceived'], true);
    expect(posted?['traineeId'], 't1');
    expect(find.text('تم شحن المتدرب'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
  testWidgets(
    'visit keeps token and versions from review and handles existing attendance',
    (t) async {
      Json? posted;
      final api = client('BRANCH_MANAGER', (r) async {
        if (r.url.path.endsWith('/visit-previews'))
          return reply({
            'traineeLabel': 'متدرب تجريبي',
            'phoneLast4': '5678',
            'points': 30,
            'balance': null,
            'sessionMinutes': 120,
            'pricingVersion': 2,
            'branchPricingVersion': 3,
            'alreadyActive': true,
          });
        posted = Map<String, dynamic>.from(jsonDecode(r.body));
        return reply({
          'alreadyActive': true,
          'visit': {
            'id': 'v1',
            'pointsCharged': 30,
            'expiresAt': '2026-10-20T12:00:00Z',
          },
        });
      });
      await t.pumpWidget(page(RecordVisit(api: api, branch: branch)));
      final token = List.filled(43, 'a').join();
      await t.enterText(find.byType(TextField).first, token);
      await t.ensureVisible(find.text('مراجعة الزيارة'));
      await t.tap(find.text('مراجعة الزيارة'));
      await t.pumpAndSettle();
      expect(posted, isNull);
      await t.ensureVisible(find.byType(CheckboxListTile));
      await t.tap(find.byType(CheckboxListTile));
      await t.pumpAndSettle();
      await t.scrollUntilVisible(
        find.widgetWithText(FilledButton, 'تأكيد الحضور'),
        150,
        scrollable: find.byType(Scrollable).first,
      );
      await t.tap(find.widgetWithText(FilledButton, 'تأكيد الحضور'));
      await t.pumpAndSettle();
      expect(posted?['token'], token);
      expect(posted?['branchPricingVersion'], 3);
      expect(posted?['presenceConfirmed'], true);
      expect(find.text('الزيارة مسجلة بالفعل'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );

  testWidgets('operation scope stays readable on narrow screens with large text', (t) async {
    t.view.physicalSize = const Size(320, 900);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    await t.pumpWidget(page(Scaffold(body: MediaQuery(
      data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
      child: const OperationContext(
        title: 'فرع شبين الكوم الرئيسي - جيم التجربة',
        detail: 'راجع المتدرب ونقاط الزيارة قبل التأكيد',
      ),
    ))));
    expect(find.text('فرع شبين الكوم الرئيسي - جيم التجربة'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}

