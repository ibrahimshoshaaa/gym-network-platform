import '../l10n/language.dart';
import 'home_cards.dart';
import 'directory.dart';
import 'ratings.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'topup.dart';
import 'account.dart';

typedef HomeLocation = ({double latitude,double longitude});
class TraineeHome extends StatefulWidget {
 final ApiClient api;
 final VoidCallback showGyms,showQr;
 final VoidCallback? showWork;
 final Future<HomeLocation> Function()? locate;
 const TraineeHome({super.key,required this.api,required this.showGyms,required this.showQr,this.showWork,this.locate});
 @override State<TraineeHome> createState()=>_TraineeHomeState();
}
class _TraineeHomeState extends State<TraineeHome>{
 Json? wallet;List<Json>? visits;List<Json> nearby=[];
 Object? walletError,visitsError,locationError;
 bool walletLoading=true,visitsLoading=true,locating=true;
 HomeLocation? location;int generation=0,locationGeneration=0;
 @override void initState(){super.initState();load();locate();}
 @override void dispose(){generation++;locationGeneration++;super.dispose();}
 Future<void> load()async{
  final current=++generation;setState((){walletLoading=visitsLoading=true;walletError=visitsError=null;});
  Future<void> part(bool balance)async{try{final r=await widget.api.request(balance?'trainee/wallet':'trainee/visits?limit=3');if(mounted&&current==generation)setState((){if(balance){wallet=Map<String,dynamic>.from(r);}else{visits=rows(r);}});}catch(e){if(mounted&&current==generation)setState((){if(balance){wallet=null;walletError=e;}else{visits=null;visitsError=e;}});}finally{if(mounted&&current==generation)setState((){if(balance){walletLoading=false;}else{visitsLoading=false;}});}}
  await Future.wait([part(true),part(false)]);
 }
 Future<void> locate()async{
  final current=++locationGeneration;setState((){locating=true;locationError=null;});
  try{final HomeLocation p;if(widget.locate!=null){p=await widget.locate!();}else{final gps=await currentPosition().timeout(const Duration(seconds:25));p=(latitude:gps.latitude,longitude:gps.longitude);}
   final r=await widget.api.request('directory/branches?limit=8&latitude=${p.latitude}&longitude=${p.longitude}');if(mounted&&current==locationGeneration)setState((){location=p;nearby=rows(r);});
  }catch(e){if(mounted&&current==locationGeneration)setState((){locationError=e;location=null;nearby=[];});}finally{if(mounted&&current==locationGeneration)setState(()=>locating=false);}
 }
 Future<void> topup()async{await open(context,TopupScreen(api:widget.api));if(mounted)await load();}
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return ColoredBox(color:canvas,child:RefreshIndicator(onRefresh:()async{await Future.wait([load(),locate()]);},child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.only(bottom:28),children:[
  TraineeBalanceHero(api:widget.api,wallet:wallet,loading:walletLoading,topup:topup,qr:widget.showQr,history:()=>open(context,WalletHistory(api:widget.api)),notifications:()=>open(context,NotificationsScreen(api:widget.api)),workplace:widget.showWork),
  if(widget.showWork!=null)Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:Align(alignment:AlignmentDirectional.centerEnd,child:TextButton(onPressed:widget.showWork,child:Text(appText('s16'))))),
  if(walletError!=null)Padding(padding:const EdgeInsets.all(16),child:ErrorNote(walletError,retry:load)),
  if((int.tryParse('${wallet?['unavailablePoints']}')??0)>0)Padding(padding:const EdgeInsets.all(16),child:PortalNote(appText('s640', [wallet!['unavailablePoints']]))),
  Padding(padding:const EdgeInsets.fromLTRB(20,12,20,4),child:Row(children:[Expanded(child:Text(appText('s641'),style:Theme.of(context).textTheme.titleLarge)),TextButton(onPressed:widget.showGyms,child:Text(appText('s642')))])),
  if(locating)const Padding(padding:EdgeInsets.all(20),child:LinearProgressIndicator(minHeight:2))
  else if(locationError!=null)Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(appText('s643'),style:TextStyle(fontWeight:FontWeight.w800)),const SizedBox(height:8),Text(appText('s644'),style:TextStyle(color:muted,fontSize:12)),const SizedBox(height:12),Wrap(spacing:8,runSpacing:8,children:[TextButton.icon(onPressed:locate,icon:const Icon(Icons.my_location_rounded),label:Text(appText('s645'))),TextButton(onPressed:widget.showGyms,child:Text(appText('s646')))])]))),
  if(!locating&&locationError==null&&nearby.isEmpty)Padding(padding:EdgeInsets.symmetric(horizontal:20,vertical:12),child:Text(appText('s647'),style:TextStyle(color:muted))),
  if(nearby.isNotEmpty)SizedBox(height:270,child:ListView.separated(scrollDirection:Axis.horizontal,padding:const EdgeInsets.symmetric(horizontal:20),itemCount:nearby.length,separatorBuilder:(_,_)=>const SizedBox(width:14),itemBuilder:(context,i)=>SizedBox(width:(MediaQuery.sizeOf(context).width*.72).clamp(230.0,320.0).toDouble(),child:NearbyGymCard(branch:nearby[i],onTap:()=>open(context,BranchDetail(api:widget.api,id:'${nearby[i]['id']}')))))),
  Padding(padding:EdgeInsets.fromLTRB(20,0,20,2),child:SectionTitle(appText('s648'))),
  HomeOffers(api:widget.api,latitude:location?.latitude,longitude:location?.longitude),
  Padding(padding:const EdgeInsets.fromLTRB(20,4,20,0),child:SectionTitle(appText('s649'),trailing:TextButton(onPressed:()=>open(context,Screen(title:appText('s650'),child:VisitsScreen(api:widget.api))),child:Text(appText('s651'))))),
  if(visitsLoading)const Padding(padding:EdgeInsets.all(20),child:LinearProgressIndicator(minHeight:2))
  else if(visitsError!=null)Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:ErrorNote(visitsError,retry:load))
  else if(visits?.isEmpty==true)Padding(padding:EdgeInsets.symmetric(horizontal:20,vertical:12),child:Text(appText('s652'),style:TextStyle(color:muted,fontSize:12)))
  else ...?visits?.map((v)=>Padding(padding:const EdgeInsets.fromLTRB(20,0,20,14),child:RatedVisitCard(api:widget.api,visit:v))),
 ]))); }
}

class WalletHistory extends StatelessWidget {
  final ApiClient api;
  const WalletHistory({super.key, required this.api});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s653'),
    child: PagedRecords(
      api: api,
      path: 'trainee/wallet/movements',
      item: (r) {
        final positive = (r['delta'] as num) > 0;
        return Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: positive ? const Color(0xffe5f4e9) : canvas,
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Icon(
                      positive
                          ? Icons.south_west_rounded
                          : Icons.north_east_rounded,
                      color: green,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      {
                            'TOPUP': appText('s654'),
                            'VISIT': appText('s655'),
                            'VISIT_CANCELLATION': appText('s656'),
                            'EXPIRY': appText('s657'),
                            'ADJUSTMENT': appText('s658'),
                          }[r['operation']] ??
                          appText('s659'),
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text(
                    '${positive ? '+' : ''}${r['delta']}',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: positive ? green : ink,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                '${r['sourceLabel'] ?? r['branch']?['name'] ?? appText('s1008')}',
                style: const TextStyle(color: muted),
              ),
              Text(
                shortDate(r['eventAt']),
                style: const TextStyle(color: muted, fontSize: 11),
              ),
              Reference('${r['referenceId']}'),
            ],
          ),
        );
      },
    ),
  ); }
}

class VisitCard extends StatelessWidget {
  final Json visit;
  final Widget? rating;
  const VisitCard(this.visit, {super.key, this.rating});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Panel(
    padding:const EdgeInsets.all(16),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Container(padding:const EdgeInsets.all(10),
          decoration:BoxDecoration(color:const Color(0xffe3fbf3),borderRadius:BorderRadius.circular(12)),
          child:const Icon(Icons.fitness_center_rounded,color:green,size:21)),
        const SizedBox(width:10),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('${visit['branch']?['gym']?['name'] ?? appText('s1009')}',
            style:const TextStyle(fontWeight:FontWeight.w800,fontSize:15)),
          Text('${visit['branch']?['name'] ?? visit['branchName'] ?? ''}',
            style:const TextStyle(color:muted,fontSize:12)),
        ])),
        const SizedBox(width:8),
        StatusPill(visit['status']),
      ]),
      const SizedBox(height:14),
      Wrap(spacing:14,runSpacing:8,children:[
        Text(appText('s120', [visit['pointsCharged']]),
          style:const TextStyle(color:green,fontWeight:FontWeight.w800,fontSize:16)),
        Text(shortDate(visit['startedAt']),style:const TextStyle(color:muted,fontSize:11)),
      ]),
      if(visit['status']=='ACTIVE')...[
        const SizedBox(height:10),
        Text(appText('s660', [shortDate(visit['expiresAt'])]),
          style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.w600)),
      ],
      if (rating != null) ...[const SizedBox(height: 12), rating!],
      Reference('${visit['id']}'),
    ]),
  ); }
}

class VisitsScreen extends StatelessWidget {
  final ApiClient api;
  final VoidCallback? showQr;
  const VisitsScreen({super.key, required this.api, this.showQr});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  PagedRecords(
    api: api,
    path: 'trainee/visits',
    header: TraineeSectionHeader(appText('s650'), subtitle: appText('s661')),
    empty: appText('s662'),
    emptyDetail: appText('s663'),
    emptyAction: showQr == null
        ? null
        : ActionButton(
            appText('s664'),
            icon: Icons.qr_code_2_rounded,
            onPressed: showQr,
          ),
    item: (r) => RatedVisitCard(api: api, visit: r),
  ); }
}

class QrScreen extends StatefulWidget {
  final ApiClient api;
  const QrScreen({super.key, required this.api});
  @override
  State<QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<QrScreen> with WidgetsBindingObserver {
  Json? qr;
  Object? error;
  bool busy = false, foreground = true;
  Timer? timer;
  final clock = Stopwatch();
  Duration validity = Duration.zero;
  int get remaining =>
      (validity.inSeconds - clock.elapsed.inSeconds).clamp(0, 60);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && foreground) setState(() {});
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    clock.stop();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (!foreground) {
      setState(() => qr = null);
    } else {
      load();
    }
  }

  Future<void> load() async {
    if (busy || !foreground) return;
    setState(() {
      busy = true;
      qr = null;
      error = null;
    });
    final requestClock = Stopwatch()..start();
    try {
      final r = Map<String, dynamic>.from(
        await widget.api.request('trainee/qr', method: 'POST'),
      );
      validity =
          DateTime.parse(r['expiresAt'])
              .difference(DateTime.parse(r['serverTime'])) -
          requestClock.elapsed;
      clock
        ..reset()
        ..start();
      if (mounted && foreground) setState(() => qr = r);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final valid=qr!=null && remaining>0 && foreground;
    return ListView(
      padding:const EdgeInsets.fromLTRB(20,8,20,28),
      children:[
        TraineeSectionHeader(appText('s13'),subtitle:appText('s665')),
        Panel(
          padding:const EdgeInsets.all(20),
          child:Column(children:[
            Row(mainAxisAlignment:MainAxisAlignment.center,children:[
              Icon(Icons.verified_user_outlined,size:18,color:green),
              SizedBox(width:7),
              Flexible(child:Text(appText('s666'),textAlign:TextAlign.center,
                style:TextStyle(color:green,fontSize:13,fontWeight:FontWeight.w700))),
            ]),
            const SizedBox(height:20),
            LayoutBuilder(builder:(context,box){
              final size=box.maxWidth.clamp(120.0,250.0);
              return SizedBox(width:size,height:size,child:busy
                ? const Center(child:CircularProgressIndicator())
                : valid
                ? Semantics(label:appText('s667'),
                    child:QrImageView(data:qr!['token'],version:QrVersions.auto,
                      size:size,backgroundColor:Colors.white))
                : Column(mainAxisAlignment:MainAxisAlignment.center,children:[
                    Icon(Icons.qr_code_2_rounded,size:100,color:muted),
                    SizedBox(height:10),
                    Text(appText('s668'),textAlign:TextAlign.center,
                      style:TextStyle(fontSize:12,color:muted)),
                  ]));
            }),
            const SizedBox(height:20),
            Text(valid?appText('s232', [remaining]):appText('s669'),
              style:const TextStyle(fontSize:13,fontWeight:FontWeight.w700,color:green)),
            const SizedBox(height:12),
            ClipRRect(borderRadius:BorderRadius.circular(8),
              child:LinearProgressIndicator(value:valid?remaining/60:0,
                color:green,backgroundColor:canvas,minHeight:4)),
            const SizedBox(height:18),
            ActionButton(appText('s670'),onPressed:load,busy:busy,icon:Icons.refresh_rounded),
          ]),
        ),
        ErrorNote(error,retry:load),
        const SizedBox(height:16),
        PortalNote(appText('s671'),
          icon:Icons.shield_outlined),
        const SizedBox(height:12),
        Text(appText('s672'),
          textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:11)),
      ],
    );
  }
}
