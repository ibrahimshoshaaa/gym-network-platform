import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/owner_portal.dart';
import 'package:gym_network/screens/branch_services.dart';
import 'package:gym_network/screens/operations.dart';
import 'package:gym_network/main.dart' show NativeShell;
import 'operations_test.dart' show client,page,reply;

const gym={'id':'g1','name':'جيم التجربة','status':'ACTIVE'};
const branch={'id':'b1','gymId':'g1','name':'فرع التجربة','canOperate':true};
void main(){
 setUpAll(()async{
  final file=File('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
  if(await file.exists()){final bytes=ByteData.sublistView(await file.readAsBytes());for(final name in ['GymReviewSans','Roboto','Ahem']){final loader=FontLoader(name)..addFont(Future.value(bytes));await loader.load();}}
  final icons=FontLoader('MaterialIcons')..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'));await icons.load();
 });
 testWidgets('single branch owner can open services directly from More without traversing branch settings',(t)async{
  final api=client('GYM_OWNER',(r)async{
   if(r.url.path.endsWith('/branches'))return reply({'items':[branch]});
   if(r.url.path.endsWith('/services'))return reply({'hours':{'version':0},'items':[]});
   return reply({'items':[]});
  });
  await t.pumpWidget(page(Scaffold(body:OwnerMore(api:api,gym:gym))));await t.pumpAndSettle();
  await t.tap(find.text('خدمات الفرع'));await t.pumpAndSettle();
  expect(find.byType(BranchServicesScreen),findsOneWidget);
  expect(find.text('إضافة خدمة'),findsOneWidget);
  expect(find.byType(TabBar),findsOneWidget);
  expect(t.takeException(),isNull);
 });
 testWidgets('single branch QR tab opens the existing confirmation flow without choosing a branch again',(t)async{
  final api=client('GYM_OWNER',(_)async=>reply({'items':[branch]}));
  await t.pumpWidget(page(Scaffold(body:OwnerScan(api:api,gym:gym))));await t.pumpAndSettle();
  expect(find.byType(RecordVisit),findsOneWidget);expect(find.byType(Scaffold),findsOneWidget);expect(t.takeException(),isNull);
 });
 testWidgets('visit filters send selected branch and status to scoped paginated reports',(t)async{
  final paths=<Uri>[];
  final api=client('GYM_OWNER',(r)async{paths.add(r.url);
   if(r.url.path.endsWith('/calendar'))return reply({'day':'2026-11-02'});
   if(r.url.path.endsWith('/branches'))return reply({'items':[branch,{'id':'b2','name':'فرع تاني'}]});
   if(r.url.path.endsWith('/summary'))return reply({'visits':{'count':'0'},'netVisitReceivablesPiasters':'0'});
   return reply({'items':[]});
  });
  await t.pumpWidget(page(Scaffold(body:OwnerVisits(api:api,gym:gym))));await t.pumpAndSettle();
  await t.tap(find.widgetWithText(ChoiceChip,'٧ أيام'));await t.pumpAndSettle();
  expect(paths.where((p)=>p.path.endsWith('/rows')).last.queryParameters['from'],'2026-10-27');
  await t.tap(find.byType(DropdownButton<String>));await t.pumpAndSettle();await t.tap(find.text('فرع تاني').last);await t.pumpAndSettle();
  expect(paths.where((p)=>p.path.endsWith('/rows')).last.queryParameters['branchId'],'b2');
  expect(t.takeException(),isNull);
 });
 testWidgets('owner overview renders bilingual-ready compact cards and retains a visual review frame',(t)async{
  t.view.physicalSize=const Size(393,851);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
  final api=client('GYM_OWNER',(r)async{if(r.url.path.endsWith('/calendar'))return reply({'day':'2026-11-02'});return reply({'period':{'to':'2026-11-02'},'visits':{'count':'4'},'netVisitReceivablesPiasters':'18000','currentBalances':[{'type':'GYM_AVAILABLE','balancePiasters':'230000'}],'dailyVisits':[{'day':'2026-11-02','count':'4'}],'recentVisits':[]});});
  const key=ValueKey('owner.review');
  await t.pumpWidget(RepaintBoundary(key:key,child:page(Scaffold(body:OwnerOverview(api:api,gym:gym,branches:(){},finance:(){},scan:(){})))));await t.pumpAndSettle();
  expect(find.text('زيارات اليوم'),findsOneWidget);expect(t.takeException(),isNull);
  await t.runAsync(()async{final boundary=t.renderObject<RenderRepaintBoundary>(find.byKey(key));final image=await boundary.toImage(pixelRatio:1);final data=await image.toByteData(format:ui.ImageByteFormat.png);await Directory('build/verification').create(recursive:true);await File('build/verification/owner-home.png').writeAsBytes(data!.buffer.asUint8List());image.dispose();});
 });
 testWidgets('all five owner tabs render on narrow Android and iOS with large text',(t)async{
  t.view.physicalSize=const Size(320,900);t.view.devicePixelRatio=1;addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
  final api=client('GYM_OWNER',(r)async{
   if(r.url.path.endsWith('/calendar'))return reply({'day':'2026-11-02'});
   if(r.url.path.endsWith('/summary'))return reply({'period':{'to':'2026-11-02'},'visits':{'count':'4'},'netVisitReceivablesPiasters':'18000','currentBalances':[{'type':'GYM_AVAILABLE','balancePiasters':'230000'}],'dailyVisits':[{'day':'2026-11-02','count':'4'}],'recentVisits':[]});
   if(r.url.path.endsWith('/branches'))return reply({'items':[branch]});return reply({'items':[]});
  });
  const key=ValueKey('owner.tabs.review');
  await t.pumpWidget(RepaintBoundary(key:key,child:page(MediaQuery(data:const MediaQueryData(size:Size(320,900),textScaler:TextScaler.linear(1.5)),child:NativeShell(api:api,gyms:const [gym])))));await t.pumpAndSettle();
  for(var i=0;i<5;i++){
   await t.tap(find.byType(NavigationDestination).at(i));await t.pumpAndSettle();
   await t.runAsync(()async{final boundary=t.renderObject<RenderRepaintBoundary>(find.byKey(key));final image=await boundary.toImage(pixelRatio:1);final data=await image.toByteData(format:ui.ImageByteFormat.png);await Directory('build/verification').create(recursive:true);await File('build/verification/owner-tab-$i.png').writeAsBytes(data!.buffer.asUint8List());image.dispose();});
   expect(t.takeException(),isNull,reason:'owner tab $i');
  }
 },variant:TargetPlatformVariant({TargetPlatform.android,TargetPlatform.iOS}));

}
