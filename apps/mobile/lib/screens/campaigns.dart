import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'account.dart';
import 'directory.dart';
import 'money.dart';
import 'operations.dart';
import 'owner.dart';
import 'topup.dart';
import 'trainee.dart';
Future<void> openCampaign(BuildContext context,ApiClient api,String destination)async{
 if(api.pending!=null)return;
 if(destination=='wallet'||destination=='home'){Navigator.of(context).popUntil((r)=>r.isFirst);return;}
 if(destination=='support'){await open(context,SupportScreen(api:api));return;}
 if(destination=='qr'){await open(context,Screen(title:'رمز الدخول',child:QrScreen(api:api)));return;}
 if(destination=='topup'){await open(context,TopupScreen(api:api));return;}
 if(destination=='cashier'){await open(context,Screen(title:'التشغيل',child:OperationsHome(api:api)));return;}
 if(!['gyms','purchases','point-wallet','withdrawals'].contains(destination))return;
 try{
  final access=await api.request('me/access');if(!context.mounted)return;final gyms=List<Json>.from((access['ownedGyms'] as List? ??[]).map((g)=>Map<String,dynamic>.from(g)));
  if(gyms.isEmpty){if(destination=='gyms')await open(context,DirectoryScreen(api:api));return;}
  Json? gym=gyms.first;
  if(gyms.length>1)gym=await showDialog<Json>(context:context,builder:(c)=>SimpleDialog(title:const Text('اختار الجيم'),children:[for(final g in gyms)SimpleDialogOption(onPressed:()=>Navigator.pop(c,g),child:Text('${g['name']}'))]));
  if(!context.mounted||gym==null)return;
  await open(context,switch(destination){'gyms'=>BranchesScreen(api:api,gym:gym),'purchases'=>TopupScreen(api:api,gymId:gym['id']),'point-wallet'=>SendPoints(api:api,gym:gym),_=>MoneyScreen(api:api,gym:gym)});
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
 List<Json> get active=>items.where((c)=>DateTime.tryParse('${c['endsAt']}')?.isAfter(DateTime.now())==true).toList();
 void rotate(){rotation?.cancel();if(paused||!foreground||active.length<2)return;rotation=Timer.periodic(const Duration(seconds:4),(_){if(!mounted)return;final count=active.length;if(count<2){setState(()=>index=0);rotation?.cancel();return;}if(controller.hasClients)controller.animateToPage((index+1)%count,duration:const Duration(milliseconds:320),curve:Curves.easeInOut);});}
 Future<void> load()async{final current=++generation;try{final r=await widget.api.request('campaigns?placement=${widget.placement}');if(mounted&&generation==current){setState((){items=rows(r);index=0;});if(controller.hasClients)controller.jumpToPage(0);rotate();}}catch(_){if(mounted&&generation==current){setState(()=>items=[]);rotation?.cancel();}}}
 String copy(Json c,String key)=>'${c[key]??''}'.trim();
 bool hasImage(Json c)=>c['imageUrl'] is String&&Uri.tryParse(c['imageUrl'])?.host=='res.cloudinary.com';
 double textHeight(String value,TextStyle style,double width){if(value.isEmpty)return 0;final painter=TextPainter(text:TextSpan(text:value,style:style),textDirection:Directionality.of(context),textScaler:MediaQuery.textScalerOf(context))..layout(maxWidth:width);return painter.height;}
 @override Widget build(BuildContext context){final visible=active;if(visible.isEmpty)return const SizedBox.shrink();return LayoutBuilder(builder:(context,box){
 final baseStyle=DefaultTextStyle.of(context).style;final titleStyle=baseStyle.merge(const TextStyle(fontWeight:FontWeight.w800,fontSize:17)),bodyStyle=baseStyle.merge(const TextStyle(fontSize:13));
 final width=box.maxWidth;double height=0;
 for(final c in visible){final title=copy(c,'title'),body=copy(c,'description'),action=c['hasAction']==true;final hasCopy=title.isNotEmpty||body.isNotEmpty||action;
 final h=(hasImage(c)?width/1.9:0)+(hasCopy?32:0)+textHeight(title,titleStyle,width-40)+textHeight(body,bodyStyle,width-40)+(title.isNotEmpty&&body.isNotEmpty?8:0)+(action?52:0);
 if(h>height)height=h;
 }
 return Padding(padding:const EdgeInsets.only(bottom:16),child:Column(mainAxisSize:MainAxisSize.min,children:[
 SizedBox(height:height+4,child:NotificationListener<ScrollNotification>(onNotification:(n){if(n is ScrollStartNotification&&n.dragDetails!=null)rotation?.cancel();if(n is ScrollEndNotification)rotate();return false;},child:PageView.builder(controller:controller,itemCount:visible.length,onPageChanged:(i){setState(()=>index=i);rotate();},itemBuilder:(context,i){final c=visible[i],title=copy(c,'title'),body=copy(c,'description'),action=c['hasAction']==true;return Align(alignment:Alignment.topCenter,child:Semantics(label:'إعلان ${i+1} من ${visible.length}',child:ClipRRect(borderRadius:BorderRadius.circular(22),child:ColoredBox(color:Colors.white,child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
 if(hasImage(c))AspectRatio(aspectRatio:1.9,child:ColoredBox(color:const Color(0xfff3f6f5),child:Image.network(c['imageUrl'],fit:BoxFit.contain,errorBuilder:(_,error,stack)=>const Center(child:Text('تعذر تحميل الإعلان'))))),
 if(title.isNotEmpty||body.isNotEmpty||action)Padding(padding:const EdgeInsets.symmetric(horizontal:20,vertical:16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
 if(title.isNotEmpty)Text(title,style:titleStyle),if(title.isNotEmpty&&body.isNotEmpty)const SizedBox(height:8),if(body.isNotEmpty)Text(body,style:bodyStyle),
 if(action)TextButton(onPressed:()=>openCampaign(context,widget.api,'${c['destination']}'),child:const Text('اعرف التفاصيل')),
 ])),
 ]))))); }))),
 if(visible.length>1)Row(mainAxisAlignment:MainAxisAlignment.center,children:[
 Flexible(child:SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(mainAxisSize:MainAxisSize.min,children:[for(var i=0;i<visible.length;i++)Semantics(label:'عرض الإعلان ${i+1}',selected:index==i,button:true,child:GestureDetector(behavior:HitTestBehavior.opaque,onTap:()=>controller.animateToPage(i,duration:const Duration(milliseconds:320),curve:Curves.easeInOut),child:Padding(padding:const EdgeInsets.symmetric(horizontal:5,vertical:18),child:AnimatedContainer(duration:const Duration(milliseconds:200),width:index==i?22:7,height:7,decoration:BoxDecoration(color:index==i?green:const Color(0xffc4d6cf),borderRadius:BorderRadius.circular(8))))))]))),
 IconButton(tooltip:paused?'تشغيل تبديل الإعلانات':'إيقاف تبديل الإعلانات',onPressed:(){setState(()=>paused=!paused);rotate();},icon:Icon(paused?Icons.play_arrow_rounded:Icons.pause_rounded,size:18,color:green)),
 ]),
 ]));
 });}
}
