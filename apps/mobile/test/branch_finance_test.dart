import 'dart:async';
import 'package:http/http.dart' as http;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/branch_finance.dart';
import 'operations_test.dart' show branch, client, page, reply;

void main() {
  testWidgets('owner sees branch entitlement distinct from stock and period totals', (t) async {
    final paths = <Uri>[];
    final api = client('GYM_OWNER', (r) async {
      paths.add(r.url);
      if (r.url.path.endsWith('/entitlements')) return reply({'available':'12345','earned':'20000','committed':'6000','disputed':'1655','legacyReviewRequired':true});
      if (r.url.path.endsWith('/manage')) return reply({'address':'شارع الفرع', 'city':'شبين', 'governorate':'المنوفية'});
      return reply({'visits':{'count':'8'},'cancellations':{'count':'1'},'netVisitPoints':'140','netVisitReceivablesPiasters':'18000'});
    });
    await t.pumpWidget(page(Scaffold(body: SingleChildScrollView(child: BranchFinance(api: api, branch: {...branch, 'fullAccess':true})))));
    await t.pumpAndSettle();
    expect(find.text('123.45 ج.م'), findsOneWidget);
    expect(find.text('متاح للسحب من الفرع'), findsOneWidget);
    expect(paths.any((u) => u.path.endsWith('/b1/entitlements')), isTrue);
    final query = paths.firstWhere((u) => u.path.contains('reports/')).queryParameters;
    expect(query['branchId'], 'b1');
    expect(query['gymId'], 'g1');
    expect(DateTime.parse(query['to']!).difference(DateTime.parse(query['from']!)).inDays, 29);
    expect(t.takeException(), isNull);
  });
  testWidgets('cashier does not request branch financial data', (t) async {
    var requests = 0;
    final api = client('CASHIER', (_) async {requests++; return reply({});});
    await t.pumpWidget(page(Scaffold(body: BranchFinance(api: api, branch: branch))));
    await t.pumpAndSettle();
    expect(requests, 0);
    expect(find.text('مستحقات الفرع'), findsNothing);
  });
  testWidgets('late response from another branch cannot replace the selected entitlement', (t) async {
    final old = Completer<http.Response>();
    final api = client('GYM_OWNER', (r) async {
      if (r.url.path.endsWith('/b1/entitlements')) return old.future;
      if (r.url.path.endsWith('/entitlements')) return reply({'available':'20000','earned':'20000','committed':'0','disputed':'0'});
      if (r.url.path.endsWith('/manage')) return reply({'address':'العنوان', 'city':'شبين', 'governorate':'المنوفية'});
      return reply({'visits':{'count':'0'},'cancellations':{'count':'0'},'netVisitPoints':'0','netVisitReceivablesPiasters':'0'});
    });
    Widget view(String id) => page(Scaffold(body: SingleChildScrollView(child: BranchFinance(api: api, branch: {...branch, 'id':id, 'fullAccess':true}))));
    await t.pumpWidget(view('b1'));
    await t.pump();
    await t.pumpWidget(view('b2'));
    await t.pumpAndSettle();
    expect(find.text('200 ج.م'), findsNWidgets(2));
    old.complete(reply({'available':'99900','earned':'99900','committed':'0','disputed':'0'}));
    await t.pumpAndSettle();
    expect(find.text('999 ج.م'), findsNothing);
    expect(t.takeException(), isNull);
  });

}
