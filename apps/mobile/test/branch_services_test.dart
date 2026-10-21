import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/branch_services.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
  testWidgets('service editor sends integer points and duration for review without approving itself', (t) async {
    Map<String, dynamic>? posted;
    final api = client('GYM_OWNER', (r) async {
      if (r.method == 'POST') posted = Map<String, dynamic>.from(jsonDecode(r.body));
      return reply({'items': []});
    });
    await t.pumpWidget(page(const Scaffold(body: SizedBox())));
    final navigator = Navigator.of(t.element(find.byType(Scaffold)));
    navigator.push(MaterialPageRoute<void>(builder: (_) => BranchServiceForm(api: api, path: 'gyms/g1/branches/b1/services')));
    await t.pumpAndSettle();
    final values = ['كارديو', 'تمرين كارديو', '١٥', '٣٠', 'إضافة خدمة جديدة'];
    for (var i = 0; i < values.length; i++) {
      final field = find.byType(TextFormField).at(i);
      await t.ensureVisible(field);
      await t.enterText(field, values[i]);
    }
    await t.ensureVisible(find.text('إرسال للمراجعة'));
    await t.tap(find.text('إرسال للمراجعة'));
    await t.pumpAndSettle();
    expect(posted, {'name': 'كارديو', 'description': 'تمرين كارديو', 'points': 15, 'durationMinutes': 30, 'reason': 'إضافة خدمة جديدة'});
    expect(find.byType(BranchServiceForm), findsNothing);
    expect(t.takeException(), isNull);
  });
  testWidgets('pending price request preserves approved values and disables another edit', (t) async {
    final api = client('GYM_OWNER', (_) async => reply({'items': [{
      'id': 's1', 'name': 'كارديو', 'description': '', 'points': 15, 'durationMinutes': 30,
      'version': 1, 'approvedAt': '2026-10-22T00:00:00Z', 'active': true,
      'requests': [{'id': 'r2', 'points': 25, 'status': 'PENDING'}],
    }]}));
    await t.pumpWidget(page(BranchServicesScreen(api: api, gymId: 'g1', branchId: 'b1', branchName: 'فرع اختبار')));
    await t.pumpAndSettle();
    expect(find.text('15 نقطة · 30 دقيقة · متاحة'), findsOneWidget);
    final edit = find.widgetWithText(TextButton, 'طلب تعديل الخدمة والسعر');
    expect(t.widget<TextButton>(edit).onPressed, isNull);
    expect(find.text('يوجد طلب تعديل بانتظار مراجعة الإدارة'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
