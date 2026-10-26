import '../l10n/language.dart';
import 'account_balance_hero.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'directory.dart';
import 'campaigns.dart';
import 'bookings.dart';

class TraineeBalanceHero extends StatelessWidget {
 final ApiClient api;
 final Json? wallet;
 final bool loading;
 final VoidCallback topup, qr, history, notifications;
 final VoidCallback? workplace;
 const TraineeBalanceHero({super.key,required this.api,required this.wallet,required this.loading,required this.topup,required this.qr,required this.history,required this.notifications,this.workplace});
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return AccountBalanceHero(api:api,subtitle:appText('s262'),label:appText('s263'),status:wallet?['status']=='EXPIRED'?appText('s264'):wallet?['status']=='VALID'?appText('s265'):appText('s114'),points:wallet==null?null:'${wallet!['spendablePoints']}',loading:loading,notifications:notifications,primary:BalanceHeroAction(appText('s115'),Icons.add_rounded,topup),secondary:BalanceHeroAction(appText('s13'),Icons.qr_code_2_rounded,qr),footer:BalanceHeroAction(appText('s266'),Icons.history_rounded,history)); }
}

class NearbyGymCard extends StatelessWidget {
 final Json branch;
 final VoidCallback onTap;
 const NearbyGymCard({super.key,required this.branch,required this.onTap});
 @override Widget build(BuildContext context){
    AppLanguage.watch(context);
  final images=(branch['images'] as List? ??[]).cast<Map>();
  final photos=images.where((i)=>(i['purpose']=='COVER'||i['purpose']=='PHOTO')&&Uri.tryParse('${i['url']}')?.scheme=='https');
  final covers=photos.where((i)=>i['purpose']=='COVER');
  final photo=photos.isEmpty?null:'${(covers.isEmpty?photos.first:covers.first)['url']}';
  final score=branch['ratingAverage'] as num?;
  return Material(color:Colors.white,borderRadius:BorderRadius.circular(26),clipBehavior:Clip.antiAlias,child:InkWell(onTap:onTap,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   Expanded(child:Stack(fit:StackFit.expand,children:[if(photo!=null)Image.network(photo,fit:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.fitness_center_rounded,color:green,size:42))) else const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.fitness_center_rounded,color:green,size:42)),PositionedDirectional(top:12,end:12,child:Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:5),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20)),child:Row(mainAxisSize:MainAxisSize.min,children:[const Icon(Icons.star_rounded,color:Color(0xffe8b13d),size:17),const SizedBox(width:3),Text(score==null?appText('s267'):score.toStringAsFixed(1),style:const TextStyle(fontSize:12,fontWeight:FontWeight.w800))])))])),
   Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${branch['gym']?['name']??branch['name']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800)),const SizedBox(height:4),Text('${branch['name']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:muted,fontSize:11)),const SizedBox(height:10),Wrap(spacing:14,runSpacing:6,children:[Text(branch['serviceBooking']==true?(branch['minimumServicePoints']==null?appText('s268'):appText('s269', [branch['minimumServicePoints']])):appText('s120', [branch['visitPricePoints']]),style:const TextStyle(color:green,fontWeight:FontWeight.w800,fontSize:13)),Text(branch['distanceKm']==null?'${branch['city']}':appText('s270', [(branch['distanceKm'] as num).toStringAsFixed(1), branch['city']]),style:const TextStyle(color:muted,fontSize:11))])])),
  ])));
 }
}
class HomeOffers extends StatefulWidget {
 final ApiClient api;
 final double? latitude,longitude;
 const HomeOffers({super.key,required this.api,this.latitude,this.longitude});
 @override State<HomeOffers> createState()=>_HomeOffersState();
}
class _HomeOffersState extends State<HomeOffers> with WidgetsBindingObserver {
 final pager=PageController(viewportFraction:.90);Timer? rotation;int offerIndex=0;bool foreground=true;
 @override void didChangeAppLifecycleState(AppLifecycleState state){foreground=state==AppLifecycleState.resumed;}
 void rotate(){rotation?.cancel();rotation=Timer.periodic(const Duration(seconds:4),(_){final count=[...platform,...nearby].where((r)=>DateTime.tryParse('${r['endsAt']}')?.isAfter(DateTime.now())==true).length;if(mounted&&foreground&&count>1&&pager.hasClients)pager.animateToPage((offerIndex+1)%count,duration:const Duration(milliseconds:320),curve:Curves.easeInOut);});}
 Future<void> openOffer(Json r)async{if(r['serviceId']==null){await open(context,BranchDetail(api:widget.api,id:'${r['branch']}'));return;}try{final d=await widget.api.request('directory/branches/${r['branch']}');if(mounted)await open(context,CreateBookingScreen(api:widget.api,branch:Map<String,dynamic>.from(d['branch']),initialServiceId:r['serviceId']));}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}}
 List<Json> platform=[],nearby=[];bool loading=true;Object? error;int generation=0;Timer? refresh;
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);rotate();load();refresh=Timer.periodic(const Duration(minutes:1),(_)=>load());}
 @override void didUpdateWidget(HomeOffers old){super.didUpdateWidget(old);if(old.latitude!=widget.latitude||old.longitude!=widget.longitude)load();}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);rotation?.cancel();pager.dispose();refresh?.cancel();generation++;super.dispose();}
 Future<void> load()async{
  final current=++generation;setState((){loading=true;error=null;if(widget.latitude==null||widget.longitude==null)nearby=[];});
  Future<void> part(bool local)async{try{final path=local?'trainee/nearby-promotions?latitude=${widget.latitude}&longitude=${widget.longitude}':'campaigns?placement=HOME';final r=await widget.api.request(path);if(mounted&&current==generation)setState((){if(local){nearby=rows(r);}else{platform=rows(r);}});}catch(e){if(mounted&&current==generation)setState((){error=e;if(local){nearby=[];}else{platform=[];}});}}
  await Future.wait([part(false),if(widget.latitude!=null&&widget.longitude!=null)part(true)]);
  if(mounted&&current==generation)setState(()=>loading=false);
 }
 @override Widget build(BuildContext context){
    AppLanguage.watch(context);
  final now=DateTime.now();final items=[...platform.map((r)=>{...r,'platform':true}),...nearby.map((r)=>{...r,'platform':false})].where((r)=>DateTime.tryParse('${r['endsAt']}')?.isAfter(now)==true).toList();
  if(loading&&items.isEmpty)return const Padding(padding:EdgeInsets.symmetric(vertical:20),child:LinearProgressIndicator(minHeight:2));
  if(items.isEmpty)return Padding(padding:const EdgeInsets.symmetric(horizontal:20,vertical:12),child:error!=null?ErrorNote(error,retry:load):Text(appText('s271'),style:TextStyle(color:muted,fontSize:12)));
  final height=165.0+(MediaQuery.textScalerOf(context).scale(100)-100).clamp(0.0,180.0);
  return SizedBox(height:height,child:PageView.builder(controller:pager,onPageChanged:(i)=>offerIndex=i,itemCount:items.length,itemBuilder:(context,i){final r=items[i],isPlatform=r['platform']==true;final image=r['imageUrl'];return Padding(padding:const EdgeInsets.symmetric(horizontal:7),child:Material(color:ink,borderRadius:BorderRadius.circular(28),clipBehavior:Clip.antiAlias,child:InkWell(onTap:isPlatform?(r['hasAction']==true?()=>openCampaign(context,widget.api,'${r['destination']}'):null):()=>openOffer(r),child:Stack(fit:StackFit.expand,children:[
   if(image!=null)Image.network('$image',fit:isPlatform?BoxFit.contain:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:ink)),
   if(!isPlatform||image==null)const DecoratedBox(decoration:BoxDecoration(gradient:LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,colors:[Color(0x10101719),Color(0xf0101719)]))),
   PositionedDirectional(top:10,start:10,child:Container(padding:const EdgeInsets.symmetric(horizontal:11,vertical:6),decoration:BoxDecoration(color:lime,borderRadius:BorderRadius.circular(18)),child:Text(isPlatform?appText('s272'):appText('s273'),style:const TextStyle(color:ink,fontSize:10,fontWeight:FontWeight.w800)))),
   if('${r['title']??''}'.isNotEmpty||!isPlatform)Positioned(bottom:12,left:14,right:14,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${r['title']??''}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontSize:16,fontWeight:FontWeight.w800)),const SizedBox(height:5),Text('${r['description']??''}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white70,fontSize:11,height:1.3)),if(!isPlatform)...[const SizedBox(height:10),Text('${r['gymName']} · ${r['city']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:lime,fontSize:11))]])),
  ]))));}));
 }
}
