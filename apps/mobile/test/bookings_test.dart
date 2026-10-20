import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/main.dart' show GymEntryScreen;
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/bookings.dart';
import 'api_test.dart' show MemoryStore;

http.Response reply(Object value)=>http.Response(jsonEncode(value),200,headers:{'content-type':'application/json; charset=utf-8'});
ApiClient client(Future<http.Response> Function(http.Request) handle)=>ApiClient(storage:MemoryStore(),transport:MockClient(handle))
 ..restored=true..token='synthetic'..user={'id':'t','role':'TRAINEE','displayName':'متدرب'};
Widget page(Widget child)=>MaterialApp(theme:appTheme(),home:Directionality(textDirection:TextDirection.rtl,child:child));
void main(){
 testWidgets('walk-in QR is available without a booking and history remains reachable',(t)async{
  final calls=<String>[];
  final api=client((r)async{
   calls.add(r.url.path);
   if(r.url.path.endsWith('/trainee/qr'))return reply({'token':List.filled(43,'a').join(),'expiresAt':DateTime.now().add(const Duration(minutes:1)).toUtc().toIso8601String(),'serverTime':DateTime.now().toUtc().toIso8601String()});
   return reply({'items':[],'serverTime':DateTime.now().toUtc().toIso8601String()});
  });addTearDown(api.dispose);
  await t.pumpWidget(page(Scaffold(body:GymEntryScreen(api:api))));await t.pumpAndSettle();
  expect(find.text('رمزك الشخصي'),findsOneWidget);
  expect(calls.where((p)=>p.endsWith('/trainee/qr')).length,1);
  expect(calls.any((p)=>p.endsWith('/trainee/bookings')),isFalse);
  await t.tap(find.widgetWithText(OutlinedButton,'حجوزاتي'));await t.pumpAndSettle();
  expect(calls.any((p)=>p.endsWith('/trainee/bookings')),isTrue);
  expect(find.text('لسه مفيش حجوزات'),findsOneWidget);
  await t.tap(find.widgetWithText(OutlinedButton,'دخول بدون حجز'));await t.pumpAndSettle();
  expect(find.text('رمزك الشخصي'),findsOneWidget);
  await t.pumpWidget(const SizedBox());await t.pump();
 });

 test('booking QR is distinct from walk-in tokens',(){
  final token=List.filled(43,'a').join();
  expect(bookingToken('gymbooking:$token'),token);
  expect(bookingToken(token),isNull);
  expect(bookingToken('gymqr:$token'),isNull);
  expect(bookingToken('https://example.test/$token'),isNull);
 });
 test('scheduled arrival window is inclusive and closed for settled bookings',(){
  final b=<String,dynamic>{'status':'RESERVED','scheduledAt':'2026-11-01T12:00:00Z','deadlineAt':'2026-11-01T13:00:00Z'};
  expect(bookingWindow(b,DateTime.parse(b['scheduledAt']).subtract(const Duration(hours:1))),isTrue);
  expect(bookingWindow(b,DateTime.parse(b['scheduledAt'])),isTrue);
  expect(bookingWindow(b,DateTime.parse(b['deadlineAt'])),isTrue);
  expect(bookingWindow(b,DateTime.parse(b['deadlineAt']).add(const Duration(milliseconds:1))),isFalse);
  expect(bookingWindow({...b,'status':'ATTENDED'},DateTime.parse(b['scheduledAt'])),isFalse);
 });
 testWidgets('cancellation collects a reason and updates the booking after the server replies',(t)async{
  var status='RESERVED';String? reason;
  final now=DateTime.now(),b=<String,dynamic>{'id':'b','branchId':'branch','points':25,'scheduledAt':now.add(const Duration(hours:1)).toUtc().toIso8601String(),'deadlineAt':now.add(const Duration(hours:2)).toUtc().toIso8601String(),'status':status,'policySnapshot':{'mode':'MANUAL','graceMinutes':60},'branch':{'name':'فرع شبين','gym':{'name':'جيم الاختبار'}},'absenceReason':null,'decisionReason':null,'traineePoints':null,'gymPoints':null,'platformPoints':null};
  final api=client((r)async{
   if(r.url.path.endsWith('/cancel')){reason=jsonDecode(r.body)['reason'];status='CANCELLED';return reply({...b,'status':status});}
   return reply({'items':[{...b,'status':status}],'serverTime':DateTime.now().toUtc().toIso8601String()});
  });addTearDown(api.dispose);
  await t.pumpWidget(page(BookingsScreen(api:api)));await t.pumpAndSettle();
  expect(find.text('حجز مؤكد · نقاط محجوزة'),findsOneWidget);
  await t.ensureVisible(find.text('إلغاء الحجز'));await t.tap(find.text('إلغاء الحجز'));await t.pumpAndSettle();
  await t.enterText(find.byType(TextField),'ظرف شخصي');
  await t.tap(find.text('تأكيد الإلغاء'));await t.pumpAndSettle();
  expect(reason,'ظرف شخصي');
  expect(find.text('تم الإلغاء ورد النقاط'),findsOneWidget);
  expect(find.text('إلغاء الحجز'),findsNothing);
  await t.pumpWidget(const SizedBox());await t.pump();
 });
 testWidgets('paste fallback only submits booking tokens after explicit attendance action',(t)async{
  var scans=0;final token=List.filled(43,'a').join();
  final api=client((r)async{scans++;expect(r.url.path,endsWith('/operations/branches/branch/bookings/scan'));expect(jsonDecode(r.body)['token'],token);return reply({'points':25,'status':'ATTENDED'});});addTearDown(api.dispose);
  await t.pumpWidget(page(ScanBookingScreen(api:api,branch:{'id':'branch','name':'فرع شبين'})));
  expect(scans,0);
  await t.tap(find.text('لصق رمز الحجز بدل الكاميرا'));await t.pumpAndSettle();
  await t.enterText(find.byType(TextField),'gymbooking:$token');
  await t.ensureVisible(find.text('تأكيد الحضور بالرمز'));await t.tap(find.text('تأكيد الحضور بالرمز'));await t.pumpAndSettle();
  expect(scans,1);expect(find.text('تم تأكيد الحضور'),findsOneWidget);
 });
}
