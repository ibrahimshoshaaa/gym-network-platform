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
 {'id':'live','imageUrl':'https://res.cloudinary.com/test/live.png','title':'حملة متاحة','description':'تفاصيل الحملة','endsAt':DateTime.now().add(const Duration(hours:1)).toIso8601String(),'hasAction':false},
 {'id':'expired','imageUrl':'https://res.cloudinary.com/test/expired.png','title':'حملة منتهية','description':'لا تظهر','endsAt':DateTime.now().subtract(const Duration(seconds:1)).toIso8601String(),'hasAction':false},
 ]}),200,headers:{'content-type':'application/json; charset=utf-8'})))..token='synthetic';
 await t.pumpWidget(MaterialApp(theme:appTheme(),home:Scaffold(body:ListView(children:[const Text('رصيدك'),CampaignBanner(api:api)]))));await t.pumpAndSettle();
 expect(find.text('حملة متاحة'),findsNothing);expect(find.text('تفاصيل الحملة'),findsNothing);expect(find.text('اعرف التفاصيل'),findsNothing);expect(t.getSize(find.byType(PageView)).height,closeTo(t.getSize(find.byType(PageView)).width/1.9,1));expect(find.text('حملة منتهية'),findsNothing);expect(find.text('رصيدك'),findsOneWidget);expect(t.takeException(),isNull);
 await t.pumpWidget(const SizedBox());
});
testWidgets('campaign carousel rotates after four seconds, supports swipe and disposes timers',(t)async{
 final api=ApiClient(storage:MemoryStore(),transport:MockClient((_)async=>http.Response(jsonEncode({'items':[
 for(var i=1;i<=3;i++){'id':'ad-$i','imageUrl':'https://res.cloudinary.com/test/ad-$i.png','title':'إعلان $i','description':'','endsAt':DateTime.now().add(const Duration(hours:1)).toIso8601String(),'hasAction':false},
 ]}),200,headers:{'content-type':'application/json; charset=utf-8'})))..token='synthetic';
 await t.pumpWidget(MaterialApp(theme:appTheme(),home:Scaffold(body:ListView(children:[CampaignBanner(api:api)]))));await t.pumpAndSettle();
 expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-1.png')).hitTestable(),findsOneWidget);expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-2.png')).hitTestable(),findsNothing);
 await t.pump(const Duration(milliseconds:3500));expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-1.png')).hitTestable(),findsOneWidget);
 await t.pump(const Duration(milliseconds:500));await t.pumpAndSettle();expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-2.png')).hitTestable(),findsOneWidget);
 await t.drag(find.byType(PageView),const Offset(-600,0));await t.pumpAndSettle();expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-3.png')).hitTestable(),findsOneWidget);
 await t.tap(find.byTooltip('إيقاف تبديل الإعلانات'));await t.pumpAndSettle();await t.pump(const Duration(seconds:8));expect(find.byWidgetPredicate((w)=>w is Image&&(w.image as NetworkImage).url.endsWith('ad-3.png')).hitTestable(),findsOneWidget);
 expect(t.takeException(),isNull);await t.pumpWidget(const SizedBox());await t.pump(const Duration(seconds:5));
});
}
