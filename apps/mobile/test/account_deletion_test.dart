import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/account_deletion.dart';
import 'api_test.dart' show MemoryStore;

http.Response reply(Object data,[int status=200])=>http.Response(jsonEncode(data),status,headers:{'content-type':'application/json; charset=utf-8'});
Json receipt(String status)=>{'request':{'id':'synthetic-deletion','status':status,'erasedAt':status=='PENDING'?null:'2026-10-24T00:00:00Z','reviewDueAt':'2026-10-31T00:00:00Z'},'blockers':<dynamic>[]};
void main(){
 test('only confirmed erasure clears tokens and the deleted actor financial envelope',()async{
  final store=MemoryStore()..values['session']='saved'..values['pending.u1']='synthetic envelope'..values['pending.other']='other envelope';
  var pending=true;
  final api=ApiClient(storage:store,transport:MockClient((r)async{
   expect(r.url.path,endsWith('/me/account-deletion'));
   final b=jsonDecode(r.body);expect(b['confirmation'],'DELETE');expect(b['phone'],'01055550123');expect(b.containsKey('currentPassword'),false);expect(store.values['deletion.u1'],b['requestKey']);
   expect(store.values['deletion.pending'],isNotNull);
   return reply(receipt(pending?'PENDING':'COMPLETED'));
  }))..user={'id':'u1','role':'TRAINEE'}..token='saved';
  await api.deleteAccount('01055550123');expect(api.user,isNotNull);expect(api.token,'saved');expect(store.values['pending.u1'],isNotNull);
  pending=false;await api.deleteAccount('01055550123');expect(api.user,isNull);expect(api.token,isNull);expect(store.values['session'],isNull);expect(store.values['pending.u1'],isNull);expect(store.values['pending.other'],'other envelope');expect(api.deletionReceipt?['request']['status'],'COMPLETED');
 });
 test('lost destructive response is recovered by private receipt before restoring a dead session',()async{
  final store=MemoryStore()..values['session']='saved';
  var lost=true;
  final transport=MockClient((r)async{
   if(r.url.path.endsWith('/me/account-deletion'))throw http.ClientException('Synthetic response loss');
   expect(r.url.path,endsWith('/auth/account-deletion/status'));expect(r.headers.containsKey('authorization'),false);
   expect(jsonDecode(r.body)['requestKey'],store.values['deletion.u1']);
   return reply(receipt(lost?'ERASING':'COMPLETED'));
  });
  final api=ApiClient(storage:store,transport:transport)..user={'id':'u1','role':'TRAINEE'}..token='saved';
  await expectLater(api.deleteAccount('01055550123'),throwsA(isA<ApiFailure>()));expect(api.token,'saved');
  final restored=ApiClient(storage:store,transport:transport);await restored.restore();expect(restored.user,isNull);expect(restored.token,isNull);expect(restored.deletionReceipt?['request']['status'],'ERASING');
  lost=false;await restored.checkDeletionReceipt();expect(restored.deletionReceipt?['request']['status'],'COMPLETED');
 });
 test('receipt service failure preserves a live session and another identity cannot clear it',()async{
  final store=MemoryStore()..values['session']='saved'..values['deletion.pending']=jsonEncode({'actorId':'u1','requestKey':newKey()});
  final api=ApiClient(storage:store,transport:MockClient((r)async=>reply({'code':'SERVICE_UNAVAILABLE'},503)))..user={'id':'u1'}..token='saved';
  await expectLater(api.checkDeletionReceipt(),throwsA(isA<ApiFailure>()));expect(api.token,'saved');expect(api.user,isNotNull);
  api.user={'id':'other'};expect(await api.checkDeletionReceipt(),false);expect(api.token,'saved');
 });
 testWidgets('iPhone deletion requires explicit confirmation and presents settlement blockers',(t)async{
  t.view.devicePixelRatio=1;
  t.view.physicalSize=const Size(375,812);
  addTearDown(t.view.resetDevicePixelRatio);addTearDown(t.view.resetPhysicalSize);
  final calls=<String>[];
  final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{
   calls.add(r.method);if(r.method=='GET')return reply({...receipt('PENDING'),'blockers':[{'code':'POINT_BALANCE','count':1}]});
   return reply(receipt('PENDING'));
  }))..user={'id':'u1','role':'TRAINEE'}..token='saved';
  await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(textDirection:TextDirection.rtl,child:AccountDeletionScreen(api:api))));await t.pumpAndSettle();
  await t.scrollUntilVisible(find.text('رصيد نقاط يحتاج تسوية'),180,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();
  expect(find.text('رصيد نقاط يحتاج تسوية'),findsOneWidget);
  await t.scrollUntilVisible(find.text('إعادة فحص التسوية وإتمام الحذف'),180,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();await t.tap(find.text('إعادة فحص التسوية وإتمام الحذف'));await t.pumpAndSettle();expect(calls.where((c)=>c=='POST'),isEmpty);
  await t.scrollUntilVisible(find.byKey(const Key('deletion-phone')),-180,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();await t.enterText(find.byKey(const Key('deletion-phone')),'01055550123');
  await t.scrollUntilVisible(find.byKey(const Key('deletion-confirmation')),100,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();await t.enterText(find.byKey(const Key('deletion-confirmation')),'DELETE');
  FocusManager.instance.primaryFocus?.unfocus();await t.pumpAndSettle();
  await t.scrollUntilVisible(find.text('إعادة فحص التسوية وإتمام الحذف'),180,scrollable:find.byType(Scrollable).first);await t.pumpAndSettle();await t.tap(find.text('إعادة فحص التسوية وإتمام الحذف'));await t.pumpAndSettle();expect(calls.where((c)=>c=='POST').length,1);
 },variant:TargetPlatformVariant.only(TargetPlatform.iOS));
}
