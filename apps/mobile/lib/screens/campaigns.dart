import '../l10n/language.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'account.dart';
import 'maintenance.dart';
import 'promotions.dart';
import 'market.dart';
import 'directory.dart';
import 'money.dart';
import 'operations.dart';
import 'owner.dart';
import 'topup.dart';
import 'trainee.dart';
Future<void> openCampaign(BuildContext context,ApiClient api,String destination)async{
 if(api.pending!=null)return;
 if(destination=='maintenance'){await open(context,MaintenanceScreen(api:api));return;}
 if(destination=='promotion-requests'){await open(context,PromotionsScreen(api:api));return;}
 if(destination=='market'){await open(context,Screen(title:appText('s9'),child:MarketScreen(api:api)));return;}
 if(destination=='wallet'||destination=='home'){Navigator.of(context).popUntil((r)=>r.isFirst);return;}
 if(destination=='support'){await open(context,SupportScreen(api:api));return;}
 if(destination=='qr'){await open(context,Screen(title:appText('s13'),child:QrScreen(api:api)));return;}
 if(destination=='topup'){await open(context,TopupScreen(api:api));return;}
 if(destination=='cashier'){await open(context,Screen(title:appText('s8'),child:OperationsHome(api:api)));return;}
 if(!['gyms','withdrawals'].contains(destination))return;
 try{
  final access=await api.request('me/access');if(!context.mounted)return;final gyms=List<Json>.from((access['ownedGyms'] as List? ??[]).map((g)=>Map<String,dynamic>.from(g)));
  if(gyms.isEmpty){if(destination=='gyms')await open(context,DirectoryScreen(api:api));return;}
  Json? gym=gyms.first;
  if(gyms.length>1)gym=await showDialog<Json>(context:context,builder:(c){ AppLanguage.watch(c); return SimpleDialog(title:Text(appText('s502')),children:[for(final g in gyms)SimpleDialogOption(onPressed:()=>Navigator.pop(c,g),child:Text('${g['name']}'))]); });
  if(!context.mounted||gym==null)return;
  await open(context,switch(destination){'gyms'=>BranchesScreen(api:api,gym:gym),_=>MoneyScreen(api:api,gym:gym)});
 }catch(e){if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}
}
class CampaignBanner extends StatefulWidget{
 final ApiClient api;final String placement;
 const CampaignBanner({super.key,required this.api,this.placement='HOME'});
 @override State<CampaignBanner> createState()=>_CampaignBannerState();
}
class _CampaignBannerState extends State<CampaignBanner> with WidgetsBindingObserver {
 List<Json> items=[];Timer? refresh,rotation;final controller=PageController();int generation=0,index=0;bool paused=false,foreground=true;
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);load();refresh=Timer.periodic(const Duration(minutes:1),(_){if(foreground)load();});}
 @override void dispose(){WidgetsBinding.instance.removeObserver(this);refresh?.cancel();rotation?.cancel();controller.dispose();generation++;super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state){foreground=state==AppLifecycleState.resumed;if(foreground){load();rotate();}else{rotation?.cancel();}}
 List<Json> get active=>items.where((c)=>hasImage(c)&&DateTime.tryParse('${c['endsAt']}')?.isAfter(DateTime.now())==true).toList();
 void rotate(){rotation?.cancel();if(paused||!foreground||active.length<2)return;rotation=Timer.periodic(const Duration(seconds:4),(_){if(!mounted)return;final count=active.length;if(count<2){setState(()=>index=0);rotation?.cancel();return;}if(controller.hasClients)controller.animateToPage((index+1)%count,duration:const Duration(milliseconds:320),curve:Curves.easeInOut);});}
 Future<void> load()async{final current=++generation;try{final r=await widget.api.request('campaigns?placement=${widget.placement}');if(mounted&&generation==current){setState((){items=rows(r);index=0;});if(controller.hasClients)controller.jumpToPage(0);rotate();}}catch(_){if(mounted&&generation==current){setState(()=>items=[]);rotation?.cancel();}}}
 bool hasImage(Json c)=>c['imageUrl'] is String&&Uri.tryParse(c['imageUrl'])?.host=='res.cloudinary.com';
 @override Widget build(BuildContext context){
    AppLanguage.watch(context);final visible=active;if(visible.isEmpty)return const SizedBox.shrink();return Padding(padding:const EdgeInsets.only(bottom:16),child:AspectRatio(aspectRatio:1.9,child:ClipRRect(borderRadius:BorderRadius.circular(22),child:Stack(fit:StackFit.expand,children:[
 NotificationListener<ScrollNotification>(onNotification:(n){if(n is ScrollStartNotification&&n.dragDetails!=null)rotation?.cancel();if(n is ScrollEndNotification)rotate();return false;},child:PageView.builder(controller:controller,itemCount:visible.length,onPageChanged:(i){setState(()=>index=i);rotate();},itemBuilder:(context,i){final c=visible[i];return Semantics(label:appText('s503', [i+1, visible.length]),child:GestureDetector(onTap:c['hasAction']==true?()=>openCampaign(context,widget.api,'${c['destination']}'):null,child:Image.network(c['imageUrl'],fit:BoxFit.contain,errorBuilder:(_,error,stack)=>Center(child:Text(appText('s504'))))));})),
 if(visible.length>1)Positioned(bottom:0,left:0,right:0,child:Center(child:Container(decoration:BoxDecoration(color:Colors.black.withValues(alpha:.55),borderRadius:BorderRadius.circular(24)),child:Row(mainAxisSize:MainAxisSize.min,children:[
 Flexible(child:SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(mainAxisSize:MainAxisSize.min,children:[for(var i=0;i<visible.length;i++)Semantics(label:appText('s505', [i+1]),selected:index==i,button:true,child:GestureDetector(behavior:HitTestBehavior.opaque,onTap:()=>controller.animateToPage(i,duration:const Duration(milliseconds:320),curve:Curves.easeInOut),child:Padding(padding:const EdgeInsets.symmetric(horizontal:5,vertical:18),child:AnimatedContainer(duration:const Duration(milliseconds:200),width:index==i?18:6,height:6,decoration:BoxDecoration(color:index==i?const Color(0xff00d5a0):Colors.white70,borderRadius:BorderRadius.circular(8))))))]))),
 IconButton(tooltip:paused?appText('s506'):appText('s507'),onPressed:(){setState(()=>paused=!paused);rotate();},icon:Icon(paused?Icons.play_arrow_rounded:Icons.pause_rounded,size:16,color:Colors.white)),
 ]))))
 ]))));}
}
