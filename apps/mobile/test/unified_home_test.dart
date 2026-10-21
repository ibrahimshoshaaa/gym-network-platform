import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/account_balance_hero.dart';
import 'operations_test.dart' show client,reply;
void main(){
 testWidgets('all native home roles start with one identical full-width compact card and aligned brand',(t)async{
  await t.binding.setSurfaceSize(const Size(393,850));addTearDown(()=>t.binding.setSurfaceSize(null));
  final heights=<double>[];
  for(final role in ['TRAINEE','GYM_OWNER','BRANCH_MANAGER','CASHIER']){
   final api=client(role,(r)async{
    if(r.url.path.endsWith('/gyms'))return reply({'items':[{'id':'g1','name':'جيم اختبار','status':'ACTIVE'}]});
    if(r.url.path.endsWith('me/gym-application'))return reply({'application':null});
    if(r.url.path.endsWith('me/access'))return reply({'ownedGyms':role=='GYM_OWNER'?[{'id':'g1','name':'جيم اختبار','status':'ACTIVE'}]:[],'assignments':role=='BRANCH_MANAGER'||role=='CASHIER'?[{'role':role}]:[]});
    if(r.url.path.endsWith('operations/branches'))return reply({'items':[{'id':'b1','gymId':'g1','name':'فرع اختبار','gymName':'جيم اختبار','canSell':true,'canCancel':role=='BRANCH_MANAGER'}]});
    if(r.url.path.endsWith('/point-wallet'))return reply({'available':265,'total':265,'branchesTotal':0});
    if(r.url.path.contains('/operations/')&&r.url.path.endsWith('/summary'))return reply({'stock':265,'visitPricePoints':20,'sessionMinutes':180});
    if(r.url.path.endsWith('trainee/wallet'))return reply({'spendablePoints':500,'unavailablePoints':0,'status':'VALID','expiresAt':'2027-01-19T00:00:00Z'});
    if(r.url.path.contains('/reports/'))return reply({'currentBalances':[],'visits':{'count':1},'sales':{'points':0}});
    return reply({'items':[]});
   });
   await t.pumpWidget(GymNetworkApp(key:ValueKey(role),api:api));await t.pumpAndSettle();
   expect(find.byType(AccountBalanceHero),findsOneWidget,reason:role);expect(find.byType(AppBar),findsNothing);
   final card=t.getRect(find.byType(AccountBalanceHero));expect(card.left,0);expect(card.width,393);expect(card.top,0);expect(card.height,lessThan(290));heights.add(card.height);
   final logo=t.getRect(find.byKey(const ValueKey('account-hero-brand'))),bell=t.getRect(find.byKey(const ValueKey('account-hero-notifications')));
   expect(logo.right+8,lessThanOrEqualTo(bell.left+.01));expect((logo.center.dy-bell.center.dy).abs(),lessThan(.01));expect(logo.left,greaterThanOrEqualTo(card.left+12));
   expect(find.textContaining('صالح حتى'),findsNothing);expect(t.takeException(),isNull);
   await t.pumpWidget(const SizedBox());await t.pumpAndSettle();
  }
  expect(heights.reduce((a,b)=>a>b?a:b)-heights.reduce((a,b)=>a<b?a:b),lessThan(1));
 });
}
