import 'package:flutter/material.dart';
import '../l10n/language.dart';
import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'owner.dart';
import 'branch_services.dart';
import 'money.dart';
import 'account.dart';
import 'operations.dart';
import 'branch_entry.dart';
import 'market.dart';
import 'maintenance.dart';
import 'promotions.dart';
import 'work_balance_hero.dart';

String ownerDay(DateTime d)=>'${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
DateTime ownerToday(){final n=DateTime.now();return DateTime(n.year,n.month,n.day);}
String ownerRange(int days,{DateTime? from,DateTime? to}){final end=to??ownerToday();return 'from=${ownerDay(from??end.subtract(Duration(days:days-1)))}&to=${ownerDay(end)}';}
Widget ownerHeading(String title,{Widget? trailing})=>Padding(padding:const EdgeInsets.fromLTRB(18,14,18,10),child:Row(children:[Expanded(child:Text(title,style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800))),if(trailing!=null)trailing]));
Widget ownerLink(String title,IconData icon,VoidCallback action,{String? detail})=>Material(color:Colors.transparent,child:ListTile(contentPadding:const EdgeInsets.symmetric(horizontal:14,vertical:2),leading:Icon(icon,color:green),title:Text(title,style:const TextStyle(fontSize:14,fontWeight:FontWeight.w700)),subtitle:detail==null?null:Text(detail,style:const TextStyle(fontSize:11,color:muted)),trailing:const Icon(Icons.chevron_right_rounded,size:20),onTap:action));

class OwnerOverview extends StatefulWidget{
 final ApiClient api;final Json gym;final VoidCallback branches,finance,scan;final VoidCallback? visits;final Widget? tools;
 const OwnerOverview({super.key,required this.api,required this.gym,required this.branches,required this.finance,required this.scan,this.visits,this.tools});
 @override State<OwnerOverview> createState()=>_OwnerOverviewState();
}
class _OwnerOverviewState extends State<OwnerOverview>{
 Json? today,week;Object? todayError,weekError;bool loading=true;int generation=0;
 @override void initState(){super.initState();load();}
 Future<void> load()async{final g=++generation;setState((){loading=true;todayError=weekError=null;});
 DateTime anchor=ownerToday();try{final c=await widget.api.request('reports/calendar');anchor=DateTime.tryParse('${c['day']}')??anchor;}catch(_){/* Report requests surface any connectivity failure. */}
 Future<void> part(bool daily)async{try{final r=await widget.api.request('reports/summary?gymId=${widget.gym['id']}&${ownerRange(daily?1:7,to:anchor)}');if(mounted&&g==generation)setState((){if(daily){today=Map<String,dynamic>.from(r);}else{week=Map<String,dynamic>.from(r);}});}catch(e){if(mounted&&g==generation)setState((){if(daily){today=null;todayError=e;}else{week=null;weekError=e;}});}}
 await Future.wait([part(true),part(false)]);if(mounted&&g==generation)setState(()=>loading=false);}
 String? available(){if(week==null)return null;final charges=week!['serviceCharges'];if(charges?['netAvailablePiasters']!=null)return money(charges['netAvailablePiasters']);final balances=week!['currentBalances'] as List? ?? [];return money(balances.cast<Map>().where((b)=>b['type']=='GYM_AVAILABLE').firstOrNull?['balancePiasters']??'0');}
 @override Widget build(BuildContext context){AppLanguage.watch(context);final recent=List<Json>.from((week?['recentVisits'] as List? ?? []).map((r)=>Map<String,dynamic>.from(r)));return Material(color:canvas,child:RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.only(bottom:20),physics:const AlwaysScrollableScrollPhysics(),children:[
 WorkBalanceHero(api:widget.api,scope:'${widget.gym['name']}',label:appText('ownerNetAvailable'),points:available(),unit:appText('s106'),loading:loading&&week==null,primary:BalanceHeroAction(appText('s109'),Icons.qr_code_scanner_rounded,widget.gym['status']=='ACTIVE'?widget.scan:null),secondary:BalanceHeroAction(appText('ownerFinance'),Icons.account_balance_wallet_outlined,widget.finance),footer:BalanceHeroAction(appText('ownerManageBranches'),Icons.storefront_outlined,widget.branches)),
 if(widget.tools!=null)widget.tools!,
 Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
 if(todayError!=null)ErrorNote(todayError,retry:load),if(weekError!=null)ErrorNote(weekError,retry:load),
 PortalGrid(children:[_OwnerStat(appText('ownerTodayVisits'),today==null?'—':today!['dailyVisits'] is List?'${(today!['dailyVisits'] as List).fold<int>(0,(n,d)=>n+(int.tryParse('${d['count']}')??0))}':'${today!['visits']?['count']??'0'}',Icons.people_outline),_OwnerStat(appText('ownerTodayEarnings'),today==null?'—':appText('s122',[money(today!['netVisitReceivablesPiasters']??'0')]),Icons.trending_up,accent:true)]),
 const SizedBox(height:12),
 Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(appText('ownerWeekEarnings'),style:const TextStyle(fontWeight:FontWeight.w700)),const SizedBox(height:6),Text(week==null?'—':appText('s122',[money(week!['netVisitReceivablesPiasters']??'0')]),style:const TextStyle(fontSize:24,fontWeight:FontWeight.w800,color:green)),const SizedBox(height:12),if(week!=null)_OwnerChart(end:DateTime.tryParse('${week!['period']?['to']}')??ownerToday(),days:List<Json>.from((week!['dailyVisits'] as List? ?? []).map((r)=>Map<String,dynamic>.from(r))))])),
 PortalGrid(children:[PortalTask(appText('s449'),icon:Icons.campaign_outlined,onTap:()=>open(context,PromotionsScreen(api:widget.api))),PortalTask(appText('s681'),icon:Icons.build_outlined,onTap:()=>open(context,MaintenanceScreen(api:widget.api)))]),
 ownerLink(appText('s742'),Icons.insights_outlined,()=>open(context,Screen(title:appText('ownerReports'),child:OwnerVisits(api:widget.api,gym:widget.gym,reportMode:true)))),
 Row(children:[Expanded(child:Text(appText('ownerRecentVisits'),style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800))),TextButton(onPressed:widget.visits??()=>open(context,Screen(title:appText('ownerVisits'),child:OwnerVisits(api:widget.api,gym:widget.gym))),child:Text(appText('s642')))]),
 if(week!=null&&recent.isEmpty)Text(appText('ownerNoRecent'),style:const TextStyle(color:muted)),for(final r in recent)OwnerVisitTile(row:r),
 ]) )
 ])));}
}
class _OwnerStat extends StatelessWidget{
 final String label,value;final IconData icon;final bool accent;const _OwnerStat(this.label,this.value,this.icon,{this.accent=false});
 @override Widget build(BuildContext context)=>Container(width:double.infinity,padding:const EdgeInsets.all(14),decoration:BoxDecoration(color:accent?const Color(0xffdff8ee):Colors.white,borderRadius:BorderRadius.circular(18)),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(icon,color:green,size:21),const SizedBox(height:8),Text(label,style:const TextStyle(color:muted,fontSize:12)),const SizedBox(height:4),Text(value,style:const TextStyle(fontSize:21,fontWeight:FontWeight.w800))]));
}
class _OwnerChart extends StatelessWidget{
 final List<Json> days;final DateTime end;const _OwnerChart({required this.days,required this.end});
 @override Widget build(BuildContext context){final points=List.generate(7,(i){final date=ownerDay(end.subtract(Duration(days:6-i)));return (date:date,count:int.tryParse('${days.where((d)=>d['day']==date).firstOrNull?['count']??0}')??0);});final max=points.fold<int>(1,(m,d)=>d.count>m?d.count:m);return Semantics(label:appText('ownerDailyVisits'),child:Row(crossAxisAlignment:CrossAxisAlignment.end,children:[for(final p in points)Expanded(child:Padding(padding:const EdgeInsets.symmetric(horizontal:3),child:Column(children:[Text('${p.count}',style:const TextStyle(fontSize:11)),const SizedBox(height:5),Container(height:8+60*p.count/max,decoration:BoxDecoration(color:p.count==0?const Color(0xffe5ece9):green,borderRadius:BorderRadius.circular(6))),const SizedBox(height:6),Text(p.date.substring(5),style:const TextStyle(fontSize:9,color:muted))])))]));}
}
class OwnerVisitTile extends StatelessWidget{
 final Json row;const OwnerVisitTile({super.key,required this.row});
 @override Widget build(BuildContext context)=>Panel(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Row(children:[const Icon(Icons.fitness_center_rounded,size:19,color:green),const SizedBox(width:8),Expanded(child:Text('${row['branchName']??''}',style:const TextStyle(fontWeight:FontWeight.w700))),Text(appText('s122',[money(row['amountPiasters']??'0')]),style:const TextStyle(color:green,fontWeight:FontWeight.w800))]),const SizedBox(height:7),Wrap(spacing:10,runSpacing:5,children:[Text(shortDate(row['eventAt']),style:const TextStyle(fontSize:11,color:muted)),if(row['points']!=null)Text(appText('s120',[row['points']]),style:const TextStyle(fontSize:11)),StatusPill(row['status'])]),if(row['referenceId']!=null)Reference('${row['referenceId']}')]));
}

class OwnerVisits extends StatefulWidget{
 final ApiClient api;final Json gym;final Json? branch;final bool reportMode;
 const OwnerVisits({super.key,required this.api,required this.gym,this.branch,this.reportMode=false});
 @override State<OwnerVisits> createState()=>_OwnerVisitsState();
}
class _OwnerVisitsState extends State<OwnerVisits>{
 int days=1,revision=0;String? branchId;String status='',kind='VISITS';DateTime? from,to;DateTime anchor=ownerToday();List<Json> branches=[];
 @override void initState(){super.initState();branchId=widget.branch?['id'];if(widget.reportMode)days=30;loadBranches();loadCalendar();}
 Future<void> loadCalendar()async{try{final c=await widget.api.request('reports/calendar');final d=DateTime.tryParse('${c['day']}');if(d!=null&&mounted)setState(()=>anchor=d);}catch(_){}}
 Future<void> loadBranches()async{try{final r=await widget.api.request('reports/gyms/${widget.gym['id']}/branches?limit=100');if(mounted)setState(()=>branches=rows(r));}catch(_){/* Records still provide the authoritative access/error state. */}}
 String get query=>'gymId=${widget.gym['id']}&${ownerRange(days,from:from,to:to??anchor)}${branchId==null?'':'&branchId=$branchId'}';
 Future<void> custom()async{final end=anchor;final range=await showDateRangePicker(context:context,firstDate:end.subtract(const Duration(days:3650)),lastDate:end,initialDateRange:DateTimeRange(start:from??end.subtract(const Duration(days:6)),end:to??end));if(range!=null&&mounted&&range.end.difference(range.start).inDays>=366){ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('ownerMaxPeriod'))));return;}if(range!=null&&mounted)setState((){from=range.start;to=range.end;revision++;});}
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[ownerHeading(appText(widget.reportMode?'ownerReports':'ownerVisits')),
 Padding(padding:const EdgeInsets.symmetric(horizontal:16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
 SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[for(final d in [1,7,30])Padding(padding:const EdgeInsetsDirectional.only(end:8),child:ChoiceChip(label:Text(appText('ownerRange$d')),selected:from==null&&days==d,onSelected:(_)=>setState((){days=d;from=to=null;revision++;}))),ActionChip(label:Text(appText('ownerCustomRange')),onPressed:custom)])),
 if(from!=null)Text('${ownerDay(from!)} – ${ownerDay(to!)}',textDirection:TextDirection.ltr,style:const TextStyle(fontSize:11,color:muted)),
 if(widget.branch==null&&kind!='WITHDRAWALS'&&branches.length>1)DropdownButton<String>(value:branchId??'',isExpanded:true,items:[DropdownMenuItem(value:'',child:Text(appText('ownerAllBranches'))),for(final b in branches)DropdownMenuItem(value:'${b['id']}',child:Text('${b['name']}'))],onChanged:(v)=>setState((){branchId=v==''?null:v;revision++;})),
 if(widget.reportMode)SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[for(final k in ['VISITS','CANCELLATIONS',if(widget.branch==null)'WITHDRAWALS'])Padding(padding:const EdgeInsetsDirectional.only(end:8),child:ChoiceChip(label:Text(appText('ownerKind$k')),selected:kind==k,onSelected:(_)=>setState((){kind=k;status='';if(k=='WITHDRAWALS')branchId=null;revision++;})))])),
 if(!widget.reportMode)SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[for(final s in ['', 'ACTIVE','EXPIRED','CANCELLED'])Padding(padding:const EdgeInsetsDirectional.only(end:7),child:FilterChip(selected:status==s,label:Text(s.isEmpty?appText('ownerAll'):statusName(s)),onSelected:(_)=>setState((){status=s;revision++;})))])),
 Text(appText('ownerCairoDates'),style:const TextStyle(fontSize:11,color:muted)),const SizedBox(height:6),
 ])),
 _OwnerPeriodTotals(key:ValueKey('owner.totals.$query.$kind'),api:widget.api,query:query,kind:kind),
 Expanded(child:KeyedSubtree(key:ValueKey('owner.records.$query.$kind.$status.$revision'),child:PagedRecords(api:widget.api,path:'reports/rows?$query&kind=$kind${status.isEmpty?'':'&status=$status'}',item:(r)=>OwnerVisitTile(row:r)))),
 ]);}
}

class OwnerFinance extends StatelessWidget{
 final ApiClient api;final Json gym;const OwnerFinance({super.key,required this.api,required this.gym});
 @override Widget build(BuildContext context){AppLanguage.watch(context);return DefaultTabController(length:3,child:Column(children:[ownerHeading(appText('ownerFinance')),TabBar(isScrollable:true,tabAlignment:TabAlignment.center,tabs:[Tab(text:appText('ownerOverview')),Tab(text:appText('ownerWithdrawals')),Tab(text:appText('ownerReports'))]),Expanded(child:TabBarView(children:[MoneyScreen(api:api,gym:gym,embedded:true,section:0),MoneyScreen(api:api,gym:gym,embedded:true,section:1),OwnerVisits(api:api,gym:gym,reportMode:true)]))]));}
}
class OwnerMore extends StatefulWidget{
 final ApiClient api;final Json gym;const OwnerMore({super.key,required this.api,required this.gym});
 @override State<OwnerMore> createState()=>_OwnerMoreState();
}
class _OwnerMoreState extends State<OwnerMore>{
 bool busy=false;Object? error;
 ApiClient get api=>widget.api;Json get gym=>widget.gym;
 Future<void> tool(bool services)async{if(busy)return;setState((){busy=true;error=null;});try{final data=await api.request('gyms/${gym['id']}/branches?limit=100');final items=rows(data);if(!mounted)return;Json? branch;
 if(items.length==1){branch=items.first;}else if(items.isNotEmpty){branch=await showModalBottomSheet<Json>(context:context,showDragHandle:true,builder:(ctx)=>SafeArea(child:ListView(shrinkWrap:true,children:[Padding(padding:const EdgeInsets.all(16),child:Text(appText('ownerPickBranch'),style:const TextStyle(fontWeight:FontWeight.w800))),for(final b in items)ListTile(title:Text('${b['name']}'),trailing:const Icon(Icons.chevron_right_rounded),onTap:()=>Navigator.pop(ctx,b))])));}
 if(!mounted)return;if(branch==null){if(items.isEmpty)setState(()=>error=appText('s748'));return;}
 if(services){await open(context,BranchServicesScreen(api:api,gymId:'${gym['id']}',branchId:'${branch['id']}',branchName:'${branch['name']}'));}else{await open(context,StaffScreen(api:api,gymId:'${gym['id']}',branch:branch));}
 }catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context){AppLanguage.watch(context);void branches()=>open(context,Screen(title:appText('ownerManageBranches'),child:BranchesScreen(api:api,gym:gym)));return ListView(padding:const EdgeInsets.fromLTRB(16,0,16,20),children:[ownerHeading(appText('ownerMore')),Text('${gym['name']}',style:const TextStyle(color:green,fontWeight:FontWeight.w700)),const SizedBox(height:12),if(busy)const LinearProgressIndicator(),ErrorNote(error),
 Panel(padding:EdgeInsets.zero,child:Column(children:[ownerLink(appText('ownerManageBranches'),Icons.storefront_outlined,branches,detail:appText('ownerBranchDetail')),ownerLink(appText('s753'),Icons.fitness_center_outlined,()=>tool(true),detail:appText('ownerServiceDetail')),ownerLink(appText('ownerTeam'),Icons.people_outline,()=>tool(false),detail:appText('ownerTeamDetail'))])),
 Panel(padding:EdgeInsets.zero,child:Column(children:[ownerLink(appText('s449'),Icons.campaign_outlined,()=>open(context,PromotionsScreen(api:api))),ownerLink(appText('s681'),Icons.build_outlined,()=>open(context,MaintenanceScreen(api:api))),ownerLink(appText('s9'),Icons.shopping_bag_outlined,()=>open(context,Screen(title:appText('s9'),child:MarketScreen(api:api))))])),
 Panel(padding:EdgeInsets.zero,child:Column(children:[ownerLink(appText('s368'),Icons.notifications_none_rounded,()=>open(context,NotificationsScreen(api:api))),ownerLink(appText('ownerAccountSettings'),Icons.manage_accounts_outlined,()=>open(context,Screen(title:appText('ownerAccountSettings'),child:AccountScreen(api:api,workplace:true,ownerView:true)))),ownerLink(appText('s971'),Icons.support_agent_rounded,()=>open(context,SupportScreen(api:api)))])),
 ]);}
}

class OwnerScan extends StatelessWidget{
 final ApiClient api;final Json gym;const OwnerScan({super.key,required this.api,required this.gym});
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Column(children:[ownerHeading(appText('ownerScan')),Expanded(child:DataView(load:()=>api.request('operations/branches'),builder:(d,reload){final branches=rows(d).where((b)=>b['gymId']==gym['id']&&b['canOperate']==true).toList();if(branches.isEmpty)return EmptyState(appText('s364'),detail:appText('s389'));if(branches.length==1){final b=branches.first;return Column(children:[Padding(padding:const EdgeInsets.symmetric(horizontal:16),child:Row(children:[Expanded(child:Text('${b['name']}',style:const TextStyle(fontWeight:FontWeight.w700))),TextButton.icon(onPressed:()=>open(context,BranchEntryQrScreen(api:api,branch:b)),icon:const Icon(Icons.qr_code,size:18),label:Text(appText('s370')))])),Expanded(child:RecordVisit(api:api,branch:b,embedded:true))]);}return ListView(padding:const EdgeInsets.all(16),children:[Text(appText('ownerSelectBranch')),const SizedBox(height:12),for(final b in branches)Panel(padding:EdgeInsets.zero,child:Column(children:[ownerLink('${b['name']}',Icons.qr_code_scanner_rounded,()=>open(context,RecordVisit(api:api,branch:b)),detail:appText('ownerScanTrainee')),ownerLink(appText('s370'),Icons.qr_code_2_rounded,()=>open(context,BranchEntryQrScreen(api:api,branch:b)),detail:appText('ownerDisplayBranchQr'))]))]);}))]);}
}

class _OwnerPeriodTotals extends StatefulWidget{
 final ApiClient api;final String query,kind;const _OwnerPeriodTotals({super.key,required this.api,required this.query,required this.kind});
 @override State<_OwnerPeriodTotals> createState()=>_OwnerPeriodTotalsState();
}
class _OwnerPeriodTotalsState extends State<_OwnerPeriodTotals>{
 Json? data;Object? error;bool busy=true;
 @override void initState(){super.initState();load();}
 Future<void> load()async{setState((){busy=true;error=null;});try{final d=await widget.api.request('reports/summary?${widget.query}');if(mounted)setState(()=>data=Map<String,dynamic>.from(d));}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context){AppLanguage.watch(context);if(busy)return const Padding(padding:EdgeInsets.all(10),child:LinearProgressIndicator(minHeight:2));if(error!=null)return ErrorNote(error,retry:load);final key={'VISITS':'visits','CANCELLATIONS':'cancellations','WITHDRAWALS':'paidWithdrawals'}[widget.kind]!;final values=data?[key];return Padding(padding:const EdgeInsets.symmetric(horizontal:16,vertical:8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(appText('ownerPeriodTotals'),style:const TextStyle(fontSize:11,color:muted)),Wrap(spacing:12,runSpacing:4,children:[Text('${appText(widget.kind=='WITHDRAWALS'?'ownerPaidWithdrawals':'ownerKind${widget.kind}')}: ${values?['count']??0}',style:const TextStyle(fontWeight:FontWeight.w700)),Text('${appText(widget.kind=='VISITS'?'ownerPeriodNet':'ownerAmount')}: ${money(widget.kind=='VISITS'?data?['netVisitReceivablesPiasters']??'0':values?['amountPiasters']??'0')} ${appText('s106')}',style:const TextStyle(color:green))])]));}
}
