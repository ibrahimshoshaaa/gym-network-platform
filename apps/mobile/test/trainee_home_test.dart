import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/trainee.dart';
import 'package:gym_network/screens/home_cards.dart';
import 'operations_test.dart' show client,page,reply;
void main(){
 testWidgets('home orders balance, nearby gyms, offers and real visits with rating',(t)async{
  await t.binding.setSurfaceSize(const Size(393,1800));addTearDown(()=>t.binding.setSurfaceSize(null));
  final calls=<Uri>[];Map<String,dynamic>? rating;
  final api=client('TRAINEE',(r)async{
   calls.add(r.url);
   if(r.url.path.endsWith('/rating')){rating=Map<String,dynamic>.from(jsonDecode(r.body));return reply({'score':rating!['score'],'version':1});}
   if(r.url.path.endsWith('/trainee/wallet'))return reply({'spendablePoints':120,'unavailablePoints':0,'status':'VALID'});
   if(r.url.path.endsWith('/directory/branches'))return reply({'items':[{'id':'b1','name':'الفرع الأقرب','gym':{'name':'جيم اختبار'},'city':'شبين الكوم','visitPricePoints':20,'distanceKm':1.2,'ratingAverage':4.5,'ratingCount':2,'images':[]}]});
   if(r.url.path.endsWith('/trainee/visits'))return reply({'items':[{'id':'86d076a7-7827-4013-a6f9-a32f94e0131b','status':'EXPIRED','canRate':true,'rating':null,'pointsCharged':20,'startedAt':'2026-10-01T10:00:00Z','expiresAt':'2026-10-01T12:00:00Z','branch':{'name':'الفرع الأقرب','gym':{'name':'جيم اختبار'}}}]});
   if(r.url.path.endsWith('/campaigns'))return reply({'items':[{'id':'c1','title':'عرض المنصة التجريبي','description':'عروض المنصة','imageUrl':null,'endsAt':DateTime.now().add(const Duration(days:1)).toIso8601String(),'hasAction':false}]});
   return reply({'items':[]});
  });
  await t.pumpWidget(page(Scaffold(body:TraineeHome(api:api,showGyms:(){},showQr:(){},locate:()async=>(latitude:30.0,longitude:31.0)))));await t.pumpAndSettle();
  expect(find.text('120 نقطة'),findsOneWidget);expect(find.byType(NearbyGymCard),findsOneWidget);
  final clip=t.widget<ClipRRect>(find.descendant(of:find.byType(TraineeBalanceHero),matching:find.byType(ClipRRect)).first);
  expect(clip.borderRadius,const BorderRadius.only(bottomLeft:Radius.circular(36),bottomRight:Radius.circular(36)));
  expect(t.getSize(find.byType(TraineeBalanceHero)).height,lessThan(340));
  expect(calls.firstWhere((u)=>u.path.endsWith('/directory/branches')).queryParameters['latitude'],'30.0');
  expect(t.getTopLeft(find.byType(TraineeBalanceHero)).dy,lessThan(t.getTopLeft(find.text('جيمات قريبة منك')).dy));
  expect(t.getTopLeft(find.text('جيمات قريبة منك')).dy,lessThan(t.getTopLeft(find.text('عروض ليك')).dy));
  expect(t.getTopLeft(find.text('عروض ليك')).dy,lessThan(t.getTopLeft(find.text('آخر الزيارات')).dy));
  expect(find.text('عرض المنصة التجريبي'),findsOneWidget);
  expect(t.getSize(find.byType(HomeOffers)).height,165);
  await t.ensureVisible(find.text('قيّم زيارتك'));await t.tap(find.text('قيّم زيارتك'));await t.pumpAndSettle();
  await t.tap(find.byTooltip('4 نجوم'));await t.pump();await t.tap(find.text('حفظ التقييم'));await t.pumpAndSettle();
  expect(rating,{'score':4,'expectedVersion':0});expect(find.text('تقييمك 4 / 5 · تعديل'),findsOneWidget);expect(t.takeException(),isNull);
 });
 testWidgets('denied location does not invent nearby gyms and wallet actions remain usable at 320',(t)async{
  await t.binding.setSurfaceSize(const Size(320,850));addTearDown(()=>t.binding.setSurfaceSize(null));
  var qr=false;final calls=<String>[];
  final api=client('TRAINEE',(r)async{calls.add(r.url.path);return reply(r.url.path.endsWith('/trainee/wallet')?{'spendablePoints':0,'unavailablePoints':0,'status':'EMPTY'}:{'items':[]});});
  await t.pumpWidget(page(Scaffold(body:TraineeHome(api:api,showGyms:(){},showQr:(){qr=true;},locate:()=>Future.error(Exception('Location denied'))))));await t.pumpAndSettle();
  expect(find.text('تفعيل الموقع'),findsOneWidget);expect(find.byType(NearbyGymCard),findsNothing);expect(calls.any((p)=>p.endsWith('/directory/branches')),false);
  await t.tap(find.text('رمز الدخول'));expect(qr,true);expect(t.takeException(),isNull);
 });
}
