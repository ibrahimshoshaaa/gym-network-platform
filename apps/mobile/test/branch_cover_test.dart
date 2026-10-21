import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/branch_cover.dart';
import 'package:gym_network/screens/auth.dart';
import 'operations_test.dart' show client,page,reply;
void main(){
 testWidgets('owner uploads a cover to the selected branch and can replace it',(t)async{
  var uploaded=false;final calls=<Uri>[];
  final api=client('GYM_OWNER',(r)async{
   calls.add(r.url);
   if(r.method=='POST'){expect(r.url.queryParameters,{'purpose':'COVER','branchId':'b1'});expect(r.bodyBytes,[1,2,3]);uploaded=true;return reply({'id':'image-1','url':'https://res.cloudinary.com/test/image/upload/cover.jpg','purpose':'COVER'});}
   return reply({'items':uploaded?[{'id':'image-1','branchId':'b1','purpose':'COVER','publicUrl':'https://res.cloudinary.com/test/image/upload/cover.jpg'}]:[]});
  });
  await t.pumpWidget(page(BranchCoverScreen(api:api,gymId:'g1',branchId:'b1',branchName:'فرع اختبار',pickCover:()async=>Uint8List.fromList([1,2,3]))));await t.pumpAndSettle();
  await t.ensureVisible(find.text('إضافة غلاف'));await t.tap(find.text('إضافة غلاف'));await t.pumpAndSettle();
  expect(uploaded,true);expect(calls.every((u)=>u.path=='/api/mobile/gyms/g1/images'),true);
  expect(find.text('تغيير الغلاف'),findsOneWidget);expect(find.text('حذف الغلاف'),findsOneWidget);expect(t.takeException(),isNull);
 });
 testWidgets('login remembers the native session by default',(t)async{
  await t.binding.setSurfaceSize(const Size(393,1200));addTearDown(()=>t.binding.setSurfaceSize(null));
  final api=client('TRAINEE',(_)async=>reply({}));await api.storage.write('auth.language','ar');
  await t.pumpWidget(page(AuthScreen(api:api)));await t.pumpAndSettle();
  expect(t.widget<Checkbox>(find.byType(Checkbox).first).value,true);expect(t.takeException(),isNull);
 });
}
