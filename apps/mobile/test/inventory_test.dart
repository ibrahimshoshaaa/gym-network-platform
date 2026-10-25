import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/screens/inventory.dart';
import 'api_test.dart' show MemoryStore;
void main(){testWidgets('retired stock transfer has no inputs and makes no request',(t)async{
 var calls=0;final api=ApiClient(storage:MemoryStore(),transport:MockClient((r)async{calls++;throw StateError('Retired request');}))..token='synthetic'..user={'id':'owner','role':'GYM_OWNER'};
 await t.pumpWidget(MaterialApp(theme:appTheme(),home:const Directionality(textDirection:TextDirection.rtl,child:SizedBox())));
 await t.pumpWidget(MaterialApp(theme:appTheme(),home:Directionality(textDirection:TextDirection.rtl,child:StockTransfer(api:api,gym:const {'id':'g1'}))));await t.pumpAndSettle();
 expect(find.text('شحن النقاط من صاحب المنصة فقط'),findsOneWidget);expect(find.byType(TextField),findsNothing);expect(calls,0);
});}
