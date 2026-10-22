import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/screens/branch_entry.dart';
import 'bookings_test.dart' show client,page,reply;
const branchId='00000000-0000-4000-8000-000000000001';
final token=List.filled(43,'A').join();
final payload='gymbranch:$branchId:$token';
final booking=<String,dynamic>{'id':'booking','branchId':branchId,'points':25};
Future<void> paste(WidgetTester t,String text) async {
  final expand=find.text('لصق كود الفرع بدل الكاميرا');
  await t.scrollUntilVisible(expand,180);await t.pumpAndSettle();await t.tap(expand);await t.pumpAndSettle();
  await t.enterText(find.byType(TextField),text);
  FocusManager.instance.primaryFocus?.unfocus();await t.pumpAndSettle();
  final submit=find.widgetWithText(FilledButton,'تأكيد حضوري');
  await t.scrollUntilVisible(submit,180);await t.pumpAndSettle();await t.tap(submit.hitTestable());await t.pumpAndSettle();
}
void main(){
  test('branch QR cannot be confused with a personal or booking token',(){
    expect(parseBranchQr(payload),{'branchId':branchId,'token':token});
    for(final raw in [token,'gymbooking:$token','gymqr:$token','https://example.test/$payload'])expect(parseBranchQr(raw),isNull);
  });
  testWidgets('wrong branch is rejected before requesting location or posting attendance',(t)async{
    var located=0,posted=0;
    final api=client((r)async{posted++;return reply({});});addTearDown(api.dispose);
    await t.pumpWidget(page(BranchCheckInScreen(api:api,booking:booking,locate:()async{located++;return {};})));
    await paste(t,payload.replaceFirst(branchId,'00000000-0000-4000-8000-000000000002'));
    expect(located,0);expect(posted,0);expect(find.text('الكود لفرع مختلف عن الفرع المحجوز.'),findsOneWidget);
  });
  testWidgets('valid branch scan posts fresh location and successful attendance cannot be submitted again',(t)async{
    var located=0,posted=0;
    final location=<String,dynamic>{'latitude':30.6,'longitude':31.0,'accuracy':10,'capturedAt':'2026-11-01T12:00:00Z','isMocked':false};
    final api=client((r)async{
      posted++;expect(r.url.path,endsWith('/trainee/bookings/booking/check-in'));
      expect(jsonDecode(r.body),{'branchId':branchId,'token':token,...location});
      return reply({'points':25,'status':'ATTENDED'});
    });addTearDown(api.dispose);
    await t.pumpWidget(page(BranchCheckInScreen(api:api,booking:booking,locate:()async{located++;return location;})));
    await paste(t,payload);
    expect(located,1);expect(posted,1);expect(find.text('تم تأكيد حضورك'),findsOneWidget);
    expect(find.widgetWithText(FilledButton,'تأكيد حضوري'),findsNothing);
    expect(t.takeException(),isNull);
  });
  testWidgets('location failure does not submit attendance',(t)async{
    var posted=0;
    final api=client((r)async{posted++;return reply({});});addTearDown(api.dispose);
    await t.pumpWidget(page(BranchCheckInScreen(api:api,booking:booking,locate:()async=>throw const ApiFailure('LOCATION_PERMISSION_REQUIRED'))));
    await paste(t,payload);
    expect(posted,0);expect(find.text('شغّل الموقع واسمح للتطبيق بالوصول إليه لتأكيد حضورك.'),findsOneWidget);
  });
}
