import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/money.dart';
import 'bookings_test.dart' show client,page,reply;

void main(){
 testWidgets('owner sees net withdrawable money and outstanding service charges separately from gross funds',(t)async{
  final api=client((r)async{
   if(r.url.path.contains('/reports/summary'))return reply({
    'currentBalances':[{'type':'GYM_AVAILABLE','balancePiasters':'100000'}],
    'serviceCharges':{'grossAvailablePiasters':'100000','debtPiasters':'30000','scheduledPiasters':'5000','netAvailablePiasters':'70000','items':[{'description':'صيانة جهاز الجري','amountPiasters':'30000','collectedPiasters':'0','outstandingPiasters':'30000'}]},
   });
   return reply({'items':[]});
  });addTearDown(api.dispose);
  await t.pumpWidget(page(MoneyScreen(api:api,gym:{'id':'test-gym','name':'جيم اختبار','status':'ACTIVE'})));
  await t.pumpAndSettle();
  expect(find.text('700 ج.م'),findsWidgets);
  final title=find.text('مديونيات الخدمات');
  await t.scrollUntilVisible(title,180,scrollable:find.byType(Scrollable).first);
  expect(title,findsOneWidget);
  expect(find.text('مديونية مستحقة'),findsOneWidget);
  expect(t.takeException(),isNull);
 });
}
