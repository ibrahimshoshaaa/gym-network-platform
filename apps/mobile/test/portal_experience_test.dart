import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/portal_ui.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/owner.dart';
import 'package:gym_network/screens/trainee.dart';
import 'package:gym_network/screens/topup.dart';
import 'api_test.dart' show MemoryStore;

http.Response reply(Object data) => http.Response(
  jsonEncode(data),
  200,
  headers: {'content-type': 'application/json; charset=utf-8'},
);
const gym = {'id': 'g1', 'name': 'جيم التجربة', 'status': 'ACTIVE'};
const branch = {
  'id': 'b1',
  'gymId': 'g1',
  'gymName': 'جيم التجربة',
  'name': 'فرع شبين',
  'canSell': true,
  'canCancel': true,
};
ApiClient portalApi(
  String role, {
  List<Json> ownedGyms = const [],
  void Function(String)? onRequest,
}) =>
    ApiClient(
        storage: MemoryStore(),
        transport: MockClient((r) async {
          final p = r.url.path;
          onRequest?.call(p);
          if (p.endsWith('me/access'))
            return reply({'ownedGyms': ownedGyms, 'assignments': []});
          if (p.endsWith('me/gym-application'))
            return reply({'application': null});
          if (p.endsWith('/gyms'))
            return reply({
              'items': [gym],
            });
          if (p.endsWith('/point-wallet'))
            return reply({'total': '500', 'available': '450'});
          if (p.endsWith('/summary'))
            return reply({
              'visits': {'count': '12'},
              'sales': {'points': '100'},
              'currentBalances': [
                {'type': 'GYM_AVAILABLE', 'balancePiasters': '25000'},
              ],
            });
          if (p.endsWith('operations/branches'))
            return reply({
              'items': [branch],
            });
          if (p.endsWith('trainee/wallet'))
            return reply({
              'spendablePoints': 120,
              'unavailablePoints': 0,
              'expiresAt': '2027-01-01T12:00:00Z',
            });
          if (p.endsWith('wallet/movements'))
            return reply({
              'items': [
                {
                  'delta': 20,
                  'sourceLabel': 'شحن من الجيم',
                  'eventAt': '2026-10-19T10:00:00Z',
                },
              ],
            });
          return reply({'items': []});
        }),
      )
      ..restored = true
      ..token = 'synthetic'
      ..user = {
        'id': 'u1',
        'role': role,
        'displayName': 'إبراهيم اختبار',
        'email': 'person@example.test',
        'phone': '+201000000000',
      };

void main() {
  testWidgets(
    'switching an owned gym reloads that gym wallet in a mixed trainee account',
    (t) async {
      t.view.physicalSize = const Size(320, 740);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final paths = <String>[];
      const second = {
        'id': 'g2',
        'name': 'الجيم الثاني باسم طويل لاختبار اختيار الحساب',
        'status': 'ACTIVE',
      };
      final api = portalApi(
        'TRAINEE',
        ownedGyms: [gym, second],
        onRequest: paths.add,
      );
      await t.pumpWidget(GymNetworkApp(api: api));
      await t.pumpAndSettle();
      await t.tap(find.text('عملي في الجيم'));
      await t.pumpAndSettle();
      expect(paths, contains('/api/mobile/gyms/g1/point-wallet'));
      await t.tap(find.byType(DropdownButton<int>));
      await t.pumpAndSettle();
      await t.tap(find.text(second['name']!).last);
      await t.pumpAndSettle();
      expect(paths, contains('/api/mobile/gyms/g2/point-wallet'));
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'topup selection stays readable at narrow width with larger text',
    (t) async {
      t.view.physicalSize = const Size(320, 740);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      final api =
          ApiClient(
              storage: MemoryStore(),
              transport: MockClient(
                (r) async => reply({
                  'paymentMethods': [
                    {
                      'type': 'INSTAPAY',
                      'account': 'test',
                      'accountName': 'اختبار',
                      'version': 1,
                    },
                  ],
                  'packages': [],
                }),
              ),
            )
            ..user = {'id': 'u1', 'role': 'TRAINEE'}
            ..token = 'synthetic';
      await t.pumpWidget(
        MaterialApp(
          theme: appTheme(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(1.4)),
            child: child!,
          ),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: TopupScreen(api: api),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(
        find.widgetWithText(SegmentedButton<bool>, 'عدد النقاط'),
        findsOneWidget,
      );
      expect(t.takeException(), isNull);
    },
  );
  for (final role in ['TRAINEE', 'GYM_OWNER', 'BRANCH_MANAGER', 'CASHIER']) {
    for (final size in [const Size(320, 740), const Size(1024, 900)]) {
      testWidgets('$role portal renders at ${size.width} without overflow', (
        t,
      ) async {
        t.view.physicalSize = size;
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.resetPhysicalSize);
        addTearDown(t.view.resetDevicePixelRatio);
        await t.pumpWidget(GymNetworkApp(api: portalApi(role)));
        await t.pumpAndSettle();
        expect(find.byType(NavigationBar), findsOneWidget);
        expect(t.takeException(), isNull);
        if (role == 'TRAINEE') {
          await t.scrollUntilVisible(
            find.text('شحن من الجيم'),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          await t.pumpAndSettle();
          expect(find.text('+20'), findsOneWidget);
        }
        if (role == 'GYM_OWNER') {
          await t.scrollUntilVisible(
            find.text('تقارير الجيم'),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
        }
      });
    }
  }
  testWidgets(
    'large Arabic text and long balances grow without clipping actions',
    (t) async {
      t.view.physicalSize = const Size(320, 740);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize);
      addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(
        MaterialApp(
          theme: appTheme(),
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 740),
              textScaler: TextScaler.linear(1.8),
            ),
            child: Directionality(
              textDirection: TextDirection.rtl,
              child: Scaffold(
                body: ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    PortalGrid(
                      children: [
                        PortalTask(
                          'تسجيل زيارة للمتدرب في الفرع',
                          detail: 'تأكد من الفرع والهوية قبل تسجيل الحضور',
                          icon: Icons.qr_code,
                          onTap: () {},
                        ),
                        const PortalMetric(
                          'رصيد طويل للاختبار',
                          '123456789012345 نقطة',
                          icon: Icons.wallet,
                        ),
                      ],
                    ),
                    const FlowSteps(
                      labels: ['المتدرب', 'النقاط', 'التأكيد'],
                      current: 1,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    },
  );
  testWidgets(
    'staff deactivation targets only the confirmed branch assignment',
    (t) async {
      String? patched;
      Json? body;
      final api =
          ApiClient(
              storage: MemoryStore(),
              transport: MockClient((r) async {
                if (r.method == 'PATCH') {
                  patched = r.url.path;
                  body = Map<String, dynamic>.from(jsonDecode(r.body));
                  return reply({'active': false});
                }
                expect(r.url.queryParameters['branchId'], 'b1');
                return reply({
                  'items': [
                    {
                      'id': 'a1',
                      'branchId': 'b1',
                      'active': true,
                      'role': 'CASHIER',
                      'user': {'displayName': 'كاشير اختبار'},
                    },
                  ],
                });
              }),
            )
            ..user = {'id': 'owner', 'role': 'GYM_OWNER'}
            ..token = 'synthetic';
      await t.pumpWidget(
        MaterialApp(
          theme: appTheme(),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: StaffScreen(api: api, gymId: 'g1', branch: branch),
          ),
        ),
      );
      await t.pumpAndSettle();
      await t.ensureVisible(find.text('إيقاف التعيين على الفرع'));
      await t.tap(find.text('إيقاف التعيين على الفرع'));
      await t.pumpAndSettle();
      expect(patched, isNull);
      await t.tap(find.widgetWithText(TextButton, 'إيقاف'));
      await t.pumpAndSettle();
      expect(patched, '/api/mobile/gyms/g1/staff/a1');
      expect(body, {'active': false});
      expect(find.text('موقوف'), findsOneWidget);
      expect(t.takeException(), isNull);
    },
  );
  testWidgets('wallet and entry stay usable while movement history is still loading', (t) async {
    t.view.physicalSize = const Size(320, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final history = Completer<http.Response>();
    var qrOpened = false;
    final api = ApiClient(storage: MemoryStore(), transport: MockClient((r) async {
      if (r.url.path.endsWith('wallet/movements')) return history.future;
      if (r.url.path.endsWith('trainee/wallet')) return reply({
        'spendablePoints': 120, 'unavailablePoints': 0,
        'expiresAt': '2027-01-01T12:00:00Z', 'status': 'VALID',
      });
      return reply({'items': []});
    }))..token = 'synthetic'..user = {'id':'u1','role':'TRAINEE','displayName':'إبراهيم'};
    await t.pumpWidget(MaterialApp(theme: appTheme(), home: Directionality(
      textDirection: TextDirection.rtl,
      child: Scaffold(body: TraineeHome(api:api,showGyms:(){},showQr:(){qrOpened=true;})),
    )));
    await t.pump();
    await t.pump(const Duration(milliseconds:100));
    expect(find.text('120 نقطة'), findsOneWidget);
    expect(find.text('رمز الدخول').hitTestable(), findsOneWidget);
    expect(find.text('اشحن رصيدك').hitTestable(), findsOneWidget);
    await t.tap(find.text('رمز الدخول'));
    expect(qrOpened,isTrue);
    history.complete(reply({'items':[]}));
    await t.pumpAndSettle();
    expect(t.takeException(),isNull);
  });
  testWidgets('history failure does not replace a valid wallet or claim an empty history', (t) async {
    final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{
      if(r.url.path.endsWith('wallet/movements')) return http.Response('{"code":"SERVICE_UNAVAILABLE"}',503);
      if(r.url.path.endsWith('trainee/wallet'))return reply({
        'spendablePoints':120,'unavailablePoints':0,'expiresAt':null,
      });
      return reply({'items':[]});
    }))..token='synthetic'..user={'id':'u1','role':'TRAINEE','displayName':'إبراهيم'};
    await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(
      textDirection:TextDirection.rtl,child:Scaffold(body:TraineeHome(api:api,showGyms:(){},showQr:(){})),
    )));
    await t.pumpAndSettle();
    expect(find.text('120 نقطة'),findsOneWidget);
    expect(find.text('أول شحن أو زيارة هتظهر هنا.'),findsNothing);
    expect(find.byType(ErrorNote),findsOneWidget);
    expect(t.takeException(),isNull);
  });

}
