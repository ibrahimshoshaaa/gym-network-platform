import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/market.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
  for (final role in ['TRAINEE', 'GYM_OWNER', 'BRANCH_MANAGER', 'CASHIER']) {
    testWidgets('$role can open the shared market without a branch assignment', (t) async {
      await t.binding.setSurfaceSize(const Size(320, 800));
      addTearDown(() => t.binding.setSurfaceSize(null));
      final requested = <Uri>[];
      final api = client(role, (r) async {
        requested.add(r.url);
        if (r.url.path.endsWith('/market/options')) return reply({'governorates': ['القاهرة']});
        return reply({'items': [], 'nextCursor': null});
      });
      await t.pumpWidget(page(NativeShell(api: api, gyms: role == 'GYM_OWNER'
        ? [{'id': 'g1', 'name': 'جيم اختبار', 'status': 'ACTIVE'}] : const [])));
      await t.pumpAndSettle();
      await t.tap(find.widgetWithText(NavigationDestination, 'الماركت'));
      await t.pumpAndSettle();
      expect(find.byType(MarketScreen), findsOneWidget);
      expect(find.text('كل المعروض'), findsOneWidget);
      expect(find.text('إعلان جديد'), findsOneWidget);
      expect(requested.where((u) => u.path.endsWith('/market/listings')).length, 1);
      expect(requested.where((u) => u.path.endsWith('/market/listings')).single.queryParameters.containsKey('gymId'), isFalse);
      await t.tap(find.text('إعلاناتي'));
      await t.pumpAndSettle();
      expect(requested.any((u) => u.path.endsWith('/market/mine')), isTrue);
      expect(t.takeException(), isNull);
      await t.tap(find.byKey(const Key('market.create')));
      await t.pumpAndSettle();
      expect(find.byType(MarketEditor), findsOneWidget);
    });
  }

  testWidgets('a late search response cannot replace the newer market results', (t) async {
    final old = Completer<void>();
    final started = Completer<void>();
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/market/options')) return reply({'governorates': ['القاهرة']});
      if (!r.url.queryParameters.containsKey('q')) {
        started.complete();
        await old.future;
        return reply({'items': [], 'nextCursor': null});
      }
      return reply({'items': [{
        'id': 'item', 'title': 'دامبل للبيع', 'condition': 'USED',
        'pricePiasters': '120050', 'governorate': 'القاهرة', 'city': 'المعادي', 'images': [],
      }], 'nextCursor': null});
    });
    await t.pumpWidget(page(Scaffold(body: MarketScreen(api: api))));
    await t.pump();
    await started.future;
    await t.enterText(find.byType(TextField), 'دامبل');
    await t.testTextInput.receiveAction(TextInputAction.done);
    await t.pumpAndSettle();
    expect(find.text('دامبل للبيع'), findsOneWidget);
    old.complete();
    await t.pumpAndSettle();
    expect(find.text('دامبل للبيع'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
