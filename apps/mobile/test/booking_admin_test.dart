import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/booking_admin.dart';
import 'api_test.dart' show MemoryStore;
void main(){
 test('native booking distributions preserve basis point totals',(){
  for(final kind in ['TRAINEE','GYM','TRAINEE_GYM','GYM_PLATFORM']){
   final a=bookingAllocation(kind,50);
   expect(a.values.fold<int>(0,(sum,v)=>sum+(v as int)),10000);
  }
  expect(bookingAllocation('GYM_PLATFORM',60),{'traineeBps':0,'gymBps':6000,'platformBps':4000});
 });
 testWidgets('administrator publishes manual policy only on save',(t)async{
  int writes=0;dynamic posted;
  final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{
   final body=r.url.path.endsWith('/review')?{'items':[]}:{'policy':null};
   if(r.method=='POST'){writes++;posted=jsonDecode(r.body);}
   return http.Response(jsonEncode(body),200,headers:{'content-type':'application/json; charset=utf-8'});
  }))..restored=true..token='synthetic'..user={'id':'admin','role':'PLATFORM_ADMIN'};
  addTearDown(api.dispose);
  await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(textDirection:TextDirection.rtl,child:BookingAdminScreen(api:api))));await t.pumpAndSettle();
  expect(writes,0);
  await t.ensureVisible(find.text('حفظ سياسة الحجز'));await t.tap(find.text('حفظ سياسة الحجز'));await t.pumpAndSettle();
  expect(writes,1);
  expect(posted,{'expectedVersion':0,'policy':{'mode':'MANUAL','graceMinutes':60}});
  expect(find.text('تم حفظ سياسة الحجز للحجوزات الجديدة.'),findsOneWidget);
 });
}
