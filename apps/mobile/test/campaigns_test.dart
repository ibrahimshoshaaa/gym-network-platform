import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/campaigns.dart';
import 'api_test.dart' show MemoryStore;
void main(){testWidgets('live campaigns render beside primary content and expired campaigns stay hidden',(t)async{
 final api=ApiClient(storage:MemoryStore(),transport:MockClient((_)async=>http.Response(jsonEncode({'items':[
 {'id':'live','title':'حملة متاحة','description':'تفاصيل الحملة','endsAt':DateTime.now().add(const Duration(hours:1)).toIso8601String(),'hasAction':false},
 {'id':'expired','title':'حملة منتهية','description':'لا تظهر','endsAt':DateTime.now().subtract(const Duration(seconds:1)).toIso8601String(),'hasAction':false},
 ]}),200,headers:{'content-type':'application/json; charset=utf-8'})))..token='synthetic';
 await t.pumpWidget(MaterialApp(theme:appTheme(),home:Scaffold(body:ListView(children:[const Text('رصيدك'),CampaignBanner(api:api)]))));await t.pumpAndSettle();
 expect(find.text('حملة متاحة'),findsOneWidget);expect(find.text('حملة منتهية'),findsNothing);expect(find.text('رصيدك'),findsOneWidget);expect(t.takeException(),isNull);
 await t.pumpWidget(const SizedBox());
});}
