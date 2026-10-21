import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/owner.dart';
import 'package:gym_network/screens/operations.dart';
import 'package:gym_network/screens/work_balance_hero.dart';
import 'operations_test.dart' show client,page,reply;
void main(){
 for(final role in ['GYM_OWNER','BRANCH_MANAGER','CASHIER']){
  testWidgets('$role home shows its authorized stock and user in the shared header at 320',(t)async{
   await t.binding.setSurfaceSize(const Size(320,850));addTearDown(()=>t.binding.setSurfaceSize(null));
   final paths=<String>[];
   final api=client(role,(r)async{paths.add(r.url.path);if(r.url.path.endsWith('/point-wallet'))return reply({'available':'450','branchesTotal':'50','total':'500'});if(r.url.path.endsWith('/summary')&&r.url.path.contains('/operations/'))return reply({'stock':100,'visitPricePoints':20,'sessionMinutes':120});if(r.url.path.contains('/reports/'))return reply({'visits':{'count':'1'},'sales':{'points':'10'},'currentBalances':[]});return reply({'items':[]});});
   final child=role=='GYM_OWNER'?OwnerHome(api:api,gym:const {'id':'g1','name':'جيم اختبار','status':'ACTIVE'},showBranches:(){},showMoney:(){},showOperations:(){}):BranchDashboard(api:api,branch:{'id':'b1','gymId':'g1','name':'فرع اختبار','gymName':'جيم اختبار','canSell':true,'canCancel':role=='BRANCH_MANAGER'});
   await t.pumpWidget(page(Scaffold(body:child)));await t.pumpAndSettle();
   expect(find.byType(WorkBalanceHero),findsOneWidget);expect(find.text('أهلًا، موظف تجريبي'),findsOneWidget);
   expect(find.text(role=='GYM_OWNER'?'450 نقطة':'100 نقطة'),findsOneWidget);
   expect(paths.any((p)=>p.contains('trainee/wallet')),false);expect(t.takeException(),isNull);
  });
 }
 testWidgets('shared role header grows for large Arabic text without clipping',(t)async{
  await t.binding.setSurfaceSize(const Size(320,1000));addTearDown(()=>t.binding.setSurfaceSize(null));
  final api=client('CASHIER',(_)async=>reply({}));
  await t.pumpWidget(page(Scaffold(body:MediaQuery(data:const MediaQueryData(size:Size(320,1000),textScaler:TextScaler.linear(1.7)),child:ListView(children:[WorkBalanceHero(api:api,scope:'كاشير الفرع · اسم جيم وفرع طويل لاختبار العربية',label:'رصيد الفرع لبيع النقاط',points:'123456789',loading:false)])))));await t.pumpAndSettle();
  expect(find.text('123456789 نقطة'),findsOneWidget);expect(t.takeException(),isNull);
 });
}
