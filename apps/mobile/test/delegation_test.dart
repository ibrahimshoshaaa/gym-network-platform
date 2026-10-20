import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/delegation.dart';
import 'package:gym_network/screens/owner.dart';
import 'api_test.dart' show MemoryStore;
void main(){
 testWidgets('owner saves versioned branch authority without changing membership',(t)async{
  Json? body;final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{if(r.method=='PUT'){body=Map<String,dynamic>.from(jsonDecode(r.body));return http.Response('{}',200);}return http.Response('{"items":[]}',200);}))..token='synthetic';
  await t.pumpWidget(MaterialApp(theme:appTheme(),home:StaffDelegation(api:api,gymId:'g1',userId:'u1',branchId:'b1',name:'مدير')));await t.pumpAndSettle();
  await t.tap(find.text('تعيين الكاشير وإيقاف تعيينه'));await t.pumpAndSettle();
  await t.scrollUntilVisible(find.text('حفظ الصلاحيات'),150,scrollable:find.byType(Scrollable).first);await t.tap(find.text('حفظ الصلاحيات'));await t.pumpAndSettle();
  expect(body?['branchId'],'b1');expect(body?['expectedVersion'],0);expect(body?['permissions'],['MANAGE_CASHIERS']);expect(body?['fullAccess'],false);expect(t.takeException(),isNull);
 });
 testWidgets('delegated cashier invitation cannot offer manager role',(t)async{
  final api=ApiClient(storage:MemoryStore(),transport:MockClient((_)async=>http.Response('{}',200)));
  await t.pumpWidget(MaterialApp(theme:appTheme(),home:InviteStaff(api:api,gymId:'g',branchId:'b',allowManager:false)));
  expect(find.text('كاشير'),findsOneWidget);expect(find.text('مدير فرع'),findsNothing);
  expect(t.takeException(),isNull);
 });
}
