import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/bookings.dart';
import 'bookings_test.dart' show client, page, reply;

void main() {
  testWidgets('selects consecutive services and books now using approved versions without client prices', (t) async {
    Map<String,dynamic>? posted;
    final api = client((r) async {
      if(r.method == 'POST') {
        posted = Map<String,dynamic>.from(jsonDecode(r.body));
        return reply({'scheduledAt':'2026-11-01T12:00:00Z','points':35,'sessionMinutes':90});
      }
      if(r.url.path.endsWith('/booking-policy')) return reply({'policy':{'version':3,'policy':{'mode':'MANUAL','graceMinutes':60}}});
      return reply({'serviceBooking':true,'hours':{'openMinute':540,'closeMinute':1380,'version':2},'items':[
        {'id':'s1','name':'كارديو','points':15,'durationMinutes':30,'version':4},
        {'id':'s2','name':'الصالة','points':20,'durationMinutes':60,'version':1},
      ]});
    });
    addTearDown(api.dispose);
    await t.pumpWidget(page(CreateBookingScreen(api:api,branch:{'id':'b1','name':'فرع اختبار','pricingVersion':1,'visitPricePoints':5,'sessionMinutes':10})));
    await t.pumpAndSettle();
    for(final label in ['كارديو','الصالة']) {
      final tile=find.widgetWithText(CheckboxListTile,label);
      await t.scrollUntilVisible(tile,180);await t.pumpAndSettle();await t.tap(tile);await t.pumpAndSettle();
    }
    final now=find.widgetWithText(SwitchListTile,'احجز الآن');
    await t.scrollUntilVisible(now,180);await t.pumpAndSettle();await t.tap(now);await t.pumpAndSettle();
    final consent=find.widgetWithText(CheckboxListTile,'راجعت الموعد وسياسة الإلغاء وعدم الحضور');
    await t.scrollUntilVisible(consent,180);await t.pumpAndSettle();await t.tap(consent);await t.pumpAndSettle();
    final submit=find.widgetWithText(FilledButton,'تأكيد الحجز · 35 نقطة');
    await t.scrollUntilVisible(submit,180);await t.pumpAndSettle();
    expect(submit.hitTestable(),findsOneWidget);await t.tap(submit.hitTestable());await t.pumpAndSettle();
    expect(posted,{'branchId':'b1','startNow':true,'policyVersion':3,'services':[{'id':'s1','version':4},{'id':'s2','version':1}],'hoursVersion':2});
    expect(find.text('تم حجز زيارتك'),findsOneWidget);
    expect(t.takeException(),isNull);
  });
  testWidgets('a service branch with no approved services cannot fall back to the old visit price', (t) async {
    final api=client((r) async => r.url.path.endsWith('/booking-policy')
      ? reply({'policy':{'version':1,'policy':{'mode':'MANUAL','graceMinutes':60}}})
      : reply({'serviceBooking':true,'hours':{'openMinute':540,'closeMinute':1380,'version':1},'items':[]}));
    addTearDown(api.dispose);
    await t.pumpWidget(page(CreateBookingScreen(api:api,branch:{'id':'b1','name':'فرع اختبار','visitPricePoints':5,'sessionMinutes':10})));
    await t.pumpAndSettle();
    expect(find.text('لا توجد خدمات معتمدة متاحة للحجز حاليًا.'),findsOneWidget);
    final submit=find.widgetWithText(FilledButton,'تأكيد الحجز · 0 نقطة');
    await t.scrollUntilVisible(submit,180);await t.pumpAndSettle();
    expect(t.widget<FilledButton>(submit).onPressed,isNull);
  });
  for(final ownHours in [true,false])testWidgets('service hours without branch hours: own=$ownHours',(t)async{
    Map<String,dynamic>? posted;
    final api=client((r)async{
      if(r.method=='POST'){posted=Map<String,dynamic>.from(jsonDecode(r.body));return reply({'scheduledAt':'2026-11-01T12:00:00Z','points':30,'sessionMinutes':30});}
      if(r.url.path.endsWith('/booking-policy'))return reply({'policy':{'version':3,'policy':{'mode':'MANUAL','graceMinutes':60}}});
      return reply({'serviceBooking':true,'hours':{'openMinute':null,'closeMinute':null,'version':0},'items':[{'id':'s1','name':'فنون قتالية','points':30,'durationMinutes':30,'version':1,if(ownHours)'openMinute':0,if(ownHours)'closeMinute':1380}]});
    });addTearDown(api.dispose);
    await t.pumpWidget(page(CreateBookingScreen(api:api,branch:{'id':'b1','name':'فرع اختبار'},initialServiceId:'s1')));await t.pumpAndSettle();
    final now=find.widgetWithText(SwitchListTile,'احجز الآن');await t.scrollUntilVisible(now,180);await t.tap(now);await t.pumpAndSettle();
    final consent=find.widgetWithText(CheckboxListTile,'راجعت الموعد وسياسة الإلغاء وعدم الحضور');await t.scrollUntilVisible(consent,180);await t.tap(consent);await t.pumpAndSettle();
    final submit=find.widgetWithText(FilledButton,'تأكيد الحجز · 30 نقطة');await t.scrollUntilVisible(submit,180);await t.pumpAndSettle();
    expect(t.widget<FilledButton>(submit).onPressed!=null,ownHours);
    if(ownHours){await t.tap(submit);await t.pumpAndSettle();expect(posted?['hoursVersion'],0);expect(posted?['services'],[{'id':'s1','version':1}]);}
    expect(t.takeException(),isNull);
  });

}
