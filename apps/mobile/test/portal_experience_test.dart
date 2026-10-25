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
import 'package:gym_network/screens/directory.dart';
import 'package:gym_network/screens/account.dart';
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
  'canOperate': true,
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
          onRequest?.call(r.url.hasQuery?'$p?${r.url.query}':p);
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
          if (p.endsWith('trainee/qr'))
            return reply({'token': List.filled(43, 'a').join(),
              'serverTime': DateTime.now().toUtc().toIso8601String(),
              'expiresAt': DateTime.now().add(const Duration(minutes: 1)).toUtc().toIso8601String()});
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
    'switching an owned gym reloads that gym visit entitlements in a mixed trainee account',
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
      expect(paths.any((p)=>p.startsWith('/api/mobile/reports/summary?gymId=g1&')),isTrue);
      await t.tap(find.byType(DropdownButton<int>));
      await t.pumpAndSettle();
      await t.tap(find.text(second['name']!).last);
      await t.pumpAndSettle();
      expect(paths.any((p)=>p.startsWith('/api/mobile/reports/summary?gymId=g2&')),isTrue);
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
                  'policy': {'pointPricePiasters': '100', 'gymDiscountBps': 1000},
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
        find.widgetWithText(SegmentedButton<bool>, 'نقاط'),
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
            find.text('أول زيارة مؤكدة هتظهر هنا. جاهز تبدأ؟'),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          await t.pumpAndSettle();
          expect(find.text('آخر الزيارات'), findsOneWidget);
        }
        if (role == 'GYM_OWNER') {
          await t.scrollUntilVisible(
            find.text('تقارير الزيارات والتسويات'),
            160,
            scrollable: find.byType(Scrollable).first,
          );
          await t.pumpAndSettle();
          expect(t.takeException(), isNull);
        }
        if (role == 'TRAINEE' || role == 'GYM_OWNER') {
          final floating = find.byKey(const Key('navigation.qr'));
          final badge = t.getRect(floating);
          final whiteBar = t.getRect(find.byType(NavigationBar));
          expect(badge.top, lessThan(whiteBar.top));
          // Tap the part above the white bar, rather than the ordinary tab area.
          await t.tapAt(Offset(badge.center.dx, badge.top + 4));
          await t.pumpAndSettle();
          expect(t.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 2);
          expect(t.takeException(), isNull);
          await t.pumpWidget(const SizedBox()); await t.pump();
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
  testWidgets('wallet and entry stay usable while visit history is still loading', (t) async {
    t.view.physicalSize = const Size(320, 740);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final history = Completer<http.Response>();
    var qrOpened = false;
    final api = ApiClient(storage: MemoryStore(), transport: MockClient((r) async {
      if (r.url.path.endsWith('trainee/visits')) return history.future;
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
      if(r.url.path.endsWith('trainee/visits')) return http.Response('{"code":"SERVICE_UNAVAILABLE"}',503);
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
    await t.scrollUntilVisible(find.byType(ErrorNote),160,scrollable:find.byType(Scrollable).first);
    await t.pumpAndSettle();
    expect(find.text('أول زيارة مؤكدة هتظهر هنا. جاهز تبدأ؟'),findsNothing);
    expect(find.byType(ErrorNote),findsOneWidget);
    expect(t.takeException(),isNull);
  });

  test('gym thumbnail prefers the logo and ignores invalid image URLs',(){
    expect(gymThumbnail({'images':[
      {'url':'https://example.test/photo.jpg','purpose':'PHOTO'},
      {'url':'https://example.test/logo.png','purpose':'LOGO'},
    ]}),'https://example.test/logo.png');
    expect(gymThumbnail({'images':[
      {'url':'javascript:invalid','purpose':'LOGO'},
      {'url':'https://example.test/photo.jpg','purpose':'PHOTO'},
    ]}),'https://example.test/photo.jpg');
    expect(gymThumbnail({'images':[]} ),isNull);
  });
  testWidgets('map marker shows the gym name above the thumbnail and opens its branch', (t)async{
    var opened=false;
    final b=<String,dynamic>{
      'id':'b1','name':'فرع شبين','gym':{'name':'جيم باسم عربي طويل لاختبار الخريطة'},
      'images':[],
    };
    await t.pumpWidget(MaterialApp(home:MediaQuery(
      data:const MediaQueryData(textScaler:TextScaler.linear(1.8)),
      child:Directionality(textDirection:TextDirection.rtl,
        child:Scaffold(body:Center(child:SizedBox(width:124,height:148,
          child:GymMapMarker(branch:b,onTap:(){opened=true;})))),
      ),
    )));
    await t.pumpAndSettle();
    final name=find.text('جيم باسم عربي طويل لاختبار الخريطة');
    expect(t.getRect(name).bottom,lessThanOrEqualTo(t.getRect(find.byType(GymThumbnail)).top));
    await t.tap(find.byType(GymThumbnail));
    expect(opened,isTrue);
    expect(t.takeException(),isNull);
  });
  testWidgets('trainee QR fits a narrow screen with larger Arabic text', (t)async{
    t.view.physicalSize=const Size(320,740);
    t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final now=DateTime.now().toUtc();
    final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async=>reply({
      'token':'synthetic-entry-token',
      'expiresAt':now.add(const Duration(seconds:60)).toIso8601String(),
      'serverTime':now.toIso8601String(),
    })))..token='synthetic'..user={'id':'u1','role':'TRAINEE'};
    await t.pumpWidget(MaterialApp(theme:appTheme(),home:MediaQuery(
      data:const MediaQueryData(size:Size(320,740),textScaler:TextScaler.linear(1.8)),
      child:const Directionality(textDirection:TextDirection.rtl,child:SizedBox()),
    )));
    await t.pumpWidget(MaterialApp(theme:appTheme(),home:MediaQuery(
      data:const MediaQueryData(size:Size(320,740),textScaler:TextScaler.linear(1.8)),
      child:Directionality(textDirection:TextDirection.rtl,child:Scaffold(body:QrScreen(api:api))),
    )));
    await t.pump();
    await t.pump(const Duration(milliseconds:300));
    expect(find.text('رمزك الشخصي'),findsOneWidget);
    expect(t.takeException(),isNull);
    await t.pumpWidget(const SizedBox());
  });

  testWidgets('trainee gym, visit and account layouts support narrow screens and large text',(t)async{
    t.view.physicalSize=const Size(320,740);
    t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final api=portalApi('TRAINEE');
    api.user!['displayName']='إبراهيم محمد إبراهيم شوشة باسم طويل';
    final pages=<Widget>[
      BranchTile(branch:{
        'name':'فرع شبين الكوم','gym':{'name':'جيم باسم طويل للاختبار'},
        'city':'شبين الكوم','governorate':'المنوفية','images':[],
        'visitPricePoints':25,'sessionMinutes':120,'distanceKm':0.4,
      },onTap:(){}),
      const VisitCard({
        'id':'synthetic-visit','status':'ACTIVE','pointsCharged':25,
        'startedAt':'2026-10-20T09:00:00Z','expiresAt':'2026-10-20T11:00:00Z',
        'branch':{'name':'فرع شبين الكوم','gym':{'name':'جيم باسم طويل للاختبار'}},
      }),
      AccountScreen(api:api),
    ];
    for(final page in pages){
      await t.pumpWidget(MaterialApp(theme:appTheme(),home:MediaQuery(
        data:const MediaQueryData(size:Size(320,740),textScaler:TextScaler.linear(1.8)),
        child:Directionality(textDirection:TextDirection.rtl,child:Scaffold(
          body:page is AccountScreen?page:ListView(padding:const EdgeInsets.all(20),children:[page]),
        )),
      )));
      await t.pumpAndSettle();
      expect(t.takeException(),isNull,reason:'${page.runtimeType} must fit large Arabic text');
      await t.pumpWidget(const SizedBox());
    }
  });

  testWidgets('owner attendance and entitlements stay reachable while reports are delayed',(t)async{
    t.view.physicalSize=const Size(320,740);
    t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final delayed=Completer<http.Response>();
    final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{
      if(r.url.path.endsWith('/point-wallet'))return reply({'total':'500','available':'450'});
      return delayed.future;
    }))..token='synthetic'..user={'id':'owner','role':'GYM_OWNER'};
    await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(
      textDirection:TextDirection.rtl,child:Scaffold(body:OwnerHome(
        api:api,gym:gym,showBranches:(){},showMoney:(){},showOperations:(){},
      )),
    )));
    await t.pump();
    await t.pump(const Duration(milliseconds:100));
    expect(find.text('450 نقطة'),findsNothing);
    expect(find.text('بيع نقاط لمتدرب'),findsNothing);
    expect(find.text('تسجيل زيارة').hitTestable(),findsOneWidget);
    delayed.complete(reply({'currentBalances':[],'visits':{'count':'12'},'sales':{'points':'100'}}));
    await t.pumpAndSettle();
    expect(t.takeException(),isNull);
  });
  testWidgets('report errors do not invent owner entitlements',(t)async{
    final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{
      if(r.url.path.endsWith('/point-wallet'))return reply({'total':'500','available':'450'});
      return http.Response('{"code":"SERVICE_UNAVAILABLE"}',503);
    }))..token='synthetic'..user={'id':'owner','role':'GYM_OWNER'};
    await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(
      textDirection:TextDirection.rtl,child:Scaffold(body:OwnerHome(
        api:api,gym:gym,showBranches:(){},showMoney:(){},showOperations:(){},
      )),
    )));
    await t.pumpAndSettle();
    expect(find.text('450 نقطة'),findsNothing);
    expect(find.text('0 ج.م'),findsNothing);
    expect(find.text('ملخص آخر ٣٠ يوم'),findsNothing);
    expect(t.takeException(),isNull);
  });

}
