import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/inventory.dart';
import 'api_test.dart' show MemoryStore;

const gym = <String, dynamic>{'id': 'g1', 'name': 'جيم التجربة', 'status': 'ACTIVE'};
const inventory = <String, dynamic>{
  'status': 'ACTIVE', 'central': '100', 'branchesTotal': '40', 'total': '140',
  'branches': [
    {'id': 'b1', 'name': 'فرع ١', 'stock': 40, 'status': 'ACTIVE'},
    {'id': 'b2', 'name': 'فرع ٢', 'stock': 0, 'status': 'ACTIVE'},
  ],
};
http.Response reply(Object value) => http.Response(jsonEncode(value), 200,
  headers: {'content-type': 'application/json; charset=utf-8'});
Widget page(Widget child) => MaterialApp(theme: appTheme(), home: Directionality(
  textDirection: TextDirection.rtl, child: child));

void main() {
  for (final direction in [
    (from: null, to: 'b2', target: 'فرع ٢ · 0 نقطة'),
    (from: 'b1', to: 'b2', target: 'فرع ٢ · 0 نقطة'),
    (from: 'b1', to: null, target: 'رصيد صاحب الجيم · 100 نقطة'),
  ]) {
    testWidgets('review then transfer ${direction.from} to ${direction.to}', (t) async {
      Json? posted;
      final api = ApiClient(storage: MemoryStore(), transport: MockClient((r) async {
        if (r.method == 'GET') return reply(inventory);
        expect(r.headers['idempotency-key'], isNotNull);
        posted = Map<String, dynamic>.from(jsonDecode(r.body));
        return reply({'id': 'transfer1', ...posted!});
      }))..token = 'synthetic'..user = {'id': 'owner1', 'role': 'GYM_OWNER'};
      await t.pumpWidget(page(StockTransfer(api: api, gym: gym, fromBranchId: direction.from)));
      await t.pumpAndSettle();
      await t.tap(find.byType(DropdownButtonFormField<String>).last);
      await t.pumpAndSettle();
      await t.tap(find.text(direction.target).last);
      await t.pumpAndSettle();
      await t.enterText(find.byType(TextField), '٢٠');
      await t.ensureVisible(find.text('مراجعة التحويل'));
      await t.tap(find.text('مراجعة التحويل'));
      await t.pumpAndSettle();
      expect(posted, isNull);
      expect(find.text('رصيد المصدر بعد التحويل'), findsOneWidget);
      await t.scrollUntilVisible(find.text('تأكيد التحويل'), 150,
        scrollable: find.byType(Scrollable).first);
      await t.tap(find.text('تأكيد التحويل'));
      await t.pumpAndSettle();
      expect(posted, {'fromBranchId': direction.from, 'toBranchId': direction.to, 'points': 20});
      expect(find.text('تم تحويل النقاط'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('fresh balance blocks a transfer that no longer has enough stock', (t) async {
    int reads = 0, writes = 0;
    final api = ApiClient(storage: MemoryStore(), transport: MockClient((r) async {
      if (r.method != 'GET') { writes++; return reply({'id': 'unexpected'}); }
      reads++;
      return reply({...inventory, 'central': reads == 1 ? '100' : '0'});
    }))..token = 'synthetic'..user = {'id': 'owner1', 'role': 'GYM_OWNER'};
    await t.pumpWidget(page(StockTransfer(api: api, gym: gym)));
    await t.pumpAndSettle();
    await t.tap(find.byType(DropdownButtonFormField<String>).last);
    await t.pumpAndSettle();
    await t.tap(find.text('فرع ٢ · 0 نقطة').last);
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField), '20');
    await t.ensureVisible(find.text('مراجعة التحويل'));
    await t.tap(find.text('مراجعة التحويل'));
    await t.pumpAndSettle();
    expect(reads, 2); expect(writes, 0);
    expect(find.text('تأكيد التحويل'), findsNothing);
    expect(t.takeException(), isNull);
  });
}
