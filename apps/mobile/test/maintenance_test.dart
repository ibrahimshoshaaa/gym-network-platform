import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/maintenance.dart';
import 'operations_test.dart' show client, page, reply;
import 'dart:convert';

Map<String, dynamic> repair({bool approve = false, String status = 'AWAITING_APPROVAL'}) => {
  'id': 'repair-1', 'equipment': 'جهاز جري معطل', 'description': 'الموتور يتوقف عند التشغيل',
  'status': status, 'version': 4, 'contactPhone': '+201012345678',
  'branch': {'name': 'فرع اختبار', 'gym': {'name': 'جيم اختبار'}},
  'createdBy': {'displayName': 'الكاشير'}, 'images': [], 'events': [],
  'estimatedPiasters': '125050', 'approvedPiasters': null, 'finalPiasters': null,
  'appointmentAt': DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String(),
  'technicianName': 'فني الصيانة', 'technicianPhone': '+201012345678',
  'workSummary': null, 'canApprove': approve, 'isAdmin': false,
};
void main() {
  for (final role in ['GYM_OWNER', 'BRANCH_MANAGER', 'CASHIER']) {
    testWidgets('$role opens maintenance from its role menu on a narrow screen', (t) async {
      await t.binding.setSurfaceSize(const Size(320, 800));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final requested = <String>[];
      final api = client(role, (r) async {
        requested.add(r.url.path);
        return reply({'items': [], 'nextCursor': null});
      });
      await t.pumpWidget(page(NativeShell(api: api, gyms: role == 'GYM_OWNER'
        ? [{'id': 'g1', 'name': 'جيم اختبار', 'status': 'ACTIVE'}] : const [])));
      await t.pumpAndSettle();
      if(role!='GYM_OWNER')expect(find.text('الصيانة'), findsNothing);
      expect(find.byTooltip('الصيانة'), findsNothing);
      await t.tap(find.widgetWithText(NavigationDestination,role=='GYM_OWNER'?'المزيد':'حسابي'));
      await t.pumpAndSettle();
      expect(find.byTooltip('الصيانة'), findsNothing);
      await t.scrollUntilVisible(find.text('الصيانة'), 180, scrollable: find.byType(Scrollable).first);
      await t.tap(find.text('الصيانة'));
      await t.pumpAndSettle();
      expect(find.byType(MaintenanceScreen), findsOneWidget);
      expect(find.text('مفيش فروع متاحة لحسابك'), findsOneWidget);
      expect(requested.any((p) => p.endsWith('/maintenance/branches')), isTrue);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('a trainee does not get the workplace maintenance shortcut', (t) async {
    final api = client('TRAINEE', (r) async => reply({'items': []}));
    await t.pumpWidget(page(NativeShell(api: api, gyms: const [])));
    await t.pumpAndSettle();
    expect(find.byTooltip('الصيانة'), findsNothing);
  });
  for (final authorized in [false, true]) {
    testWidgets('cost approval follows the live detail capability $authorized', (t) async {
      await t.binding.setSurfaceSize(const Size(320, 800));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final writes = <Map<String, dynamic>>[];
      var status = 'AWAITING_APPROVAL';
      final api = client(authorized ? 'GYM_OWNER' : 'CASHIER', (r) async {
        if (r.method == 'POST') { writes.add(Map<String, dynamic>.from(jsonDecode(r.body))); status = 'SCHEDULED'; return reply({}); }
        return reply(repair(approve: authorized, status: status));
      });
      await t.pumpWidget(page(MaintenanceDetail(api: api, id: 'repair-1')));
      await t.pumpAndSettle();
      if (!authorized) {
        await t.drag(find.byType(ListView).first, const Offset(0, -500));
        await t.pumpAndSettle();
        expect(find.text('اعتماد التكلفة والموعد'), findsNothing);
        expect(writes, isEmpty);
      } else {
        await t.scrollUntilVisible(find.text('اعتماد التكلفة والموعد'), 250, scrollable: find.byType(Scrollable).first);
        await t.tap(find.text('اعتماد التكلفة والموعد'));
        await t.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(find.textContaining('1250.50'), findsWidgets);
        await t.tap(find.text('تأكيد'));
        await t.pumpAndSettle();
        expect(writes.single, {'action': 'APPROVE', 'expectedVersion': 4});
      }
      expect(t.takeException(), isNull);
    });
  }
}
