import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'directory.dart';
import 'campaigns.dart';

class TraineeBalanceHero extends StatelessWidget {
 final ApiClient api;
 final Json? wallet;
 final bool loading;
 final VoidCallback topup, qr, history, notifications;
 final VoidCallback? workplace;
 const TraineeBalanceHero({super.key,required this.api,required this.wallet,required this.loading,required this.topup,required this.qr,required this.history,required this.notifications,this.workplace});
 @override Widget build(BuildContext context) {
  final name='${api.user?['displayName']??'متدرب'}'.trim();
  return ClipRRect(borderRadius:const BorderRadius.only(bottomLeft:Radius.circular(42),bottomRight:Radius.circular(42)),child:DecoratedBox(decoration:const BoxDecoration(gradient:LinearGradient(begin:Alignment.topRight,end:Alignment.bottomLeft,colors:[Color(0xff183c34),ink,Color(0xff0b2524)])),child:Stack(children:[
   Positioned(top:-90,right:-70,child:Container(width:220,height:220,decoration:BoxDecoration(shape:BoxShape.circle,color:lime.withValues(alpha:.06),boxShadow:[BoxShadow(color:lime.withValues(alpha:.09),blurRadius:90,spreadRadius:15)]))),
   Padding(padding:const EdgeInsets.fromLTRB(20,16,20,8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Row(children:[Container(width:48,height:48,decoration:BoxDecoration(shape:BoxShape.circle,color:lime.withValues(alpha:.14),border:Border.all(color:lime.withValues(alpha:.6),width:2)),child:Center(child:Text(name.isEmpty?'؟':name.characters.first,style:const TextStyle(color:lime,fontSize:23,fontWeight:FontWeight.w800)))),const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Text('جاهز لتمرينتك؟',style:TextStyle(color:Colors.white60,fontSize:12)),Text('أهلًا، ${name.split(' ').first}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontSize:21,fontWeight:FontWeight.w800))])),const SizedBox(width:8),Container(decoration:BoxDecoration(color:Colors.white.withValues(alpha:.08),borderRadius:BorderRadius.circular(17)),child:IconButton(tooltip:'الإشعارات',onPressed:notifications,icon:const Icon(Icons.notifications_none_rounded,color:Colors.white)))]),
    if(workplace!=null)TextButton(onPressed:workplace,style:TextButton.styleFrom(foregroundColor:lime),child:const Text('عملي في الجيم')),
    const SizedBox(height:14),
    Wrap(spacing:12,runSpacing:8,crossAxisAlignment:WrapCrossAlignment.center,children:[const Text('رصيدك الحالي',style:TextStyle(color:Colors.white60,fontSize:13)),if(wallet!=null)Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:4),decoration:BoxDecoration(color:lime.withValues(alpha:.11),borderRadius:BorderRadius.circular(20)),child:Text(wallet!['status']=='EXPIRED'?'الرصيد منتهي':wallet!['status']=='VALID'?'رصيد متاح':'محفظتك',style:const TextStyle(color:lime,fontSize:10,fontWeight:FontWeight.w700)))]),
    const SizedBox(height:8),
    if(loading&&wallet==null)const Padding(padding:EdgeInsets.symmetric(vertical:14),child:CircularProgressIndicator(color:lime))
    else if(wallet!=null)SizedBox(width:double.infinity,child:FittedBox(fit:BoxFit.scaleDown,alignment:AlignmentDirectional.centerStart,child:Text.rich(TextSpan(children:[TextSpan(text:'${wallet!['spendablePoints']}',style:const TextStyle(color:Colors.white,fontSize:42,fontWeight:FontWeight.w900,height:1.15)),const TextSpan(text:' نقطة',style:TextStyle(color:lime,fontSize:19,fontWeight:FontWeight.w800))]))))
    else const Text('تعذر تحميل الرصيد',style:TextStyle(color:Colors.white)),
    const SizedBox(height:9),Text(wallet?['status']=='EXPIRED'?'انتهت صلاحية الرصيد · راجع الإدارة':wallet?['expiresAt']!=null?'صالح حتى ${shortDate(wallet!['expiresAt']).split(' · ').first}':'رصيد واحد.. كل الجيمات',style:const TextStyle(color:Colors.white54,fontSize:11)),
    if(loading&&wallet!=null)const Padding(padding:EdgeInsets.only(top:8),child:LinearProgressIndicator(color:lime,minHeight:2)),
    const SizedBox(height:14),
    Row(children:[Expanded(child:FilledButton.icon(style:FilledButton.styleFrom(backgroundColor:lime,foregroundColor:ink,minimumSize:const Size(0,48),padding:const EdgeInsets.symmetric(horizontal:8),textStyle:const TextStyle(fontSize:12,fontWeight:FontWeight.w800),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20))),onPressed:topup,icon:const Icon(Icons.add_rounded,size:20),label:const Text('اشحن رصيدك',textAlign:TextAlign.center))),const SizedBox(width:12),Expanded(child:FilledButton.icon(style:FilledButton.styleFrom(backgroundColor:Colors.white.withValues(alpha:.10),foregroundColor:Colors.white,minimumSize:const Size(0,48),padding:const EdgeInsets.symmetric(horizontal:8),textStyle:const TextStyle(fontSize:12,fontWeight:FontWeight.w800),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(20))),onPressed:qr,icon:const Icon(Icons.qr_code_2_rounded,size:20),label:const Text('رمز الدخول',textAlign:TextAlign.center)))]),
    Align(alignment:AlignmentDirectional.centerEnd,child:TextButton(onPressed:history,style:TextButton.styleFrom(foregroundColor:Colors.white60,textStyle:const TextStyle(fontSize:11)),child:const Text('السجل كامل'))),
   ])),
  ])));
 }
}
class NearbyGymCard extends StatelessWidget {
 final Json branch;
 final VoidCallback onTap;
 const NearbyGymCard({super.key,required this.branch,required this.onTap});
 @override Widget build(BuildContext context){
  final images=(branch['images'] as List? ??[]).cast<Map>();
  final photos=images.where((i)=>(i['purpose']=='COVER'||i['purpose']=='PHOTO')&&Uri.tryParse('${i['url']}')?.scheme=='https');
  final covers=photos.where((i)=>i['purpose']=='COVER');
  final photo=photos.isEmpty?null:'${(covers.isEmpty?photos.first:covers.first)['url']}';
  final score=branch['ratingAverage'] as num?;
  return Material(color:Colors.white,borderRadius:BorderRadius.circular(26),clipBehavior:Clip.antiAlias,child:InkWell(onTap:onTap,child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   Expanded(child:Stack(fit:StackFit.expand,children:[if(photo!=null)Image.network(photo,fit:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.fitness_center_rounded,color:green,size:42))) else const ColoredBox(color:Color(0xffe3ede8),child:Icon(Icons.fitness_center_rounded,color:green,size:42)),Positioned(top:12,left:12,child:Container(padding:const EdgeInsets.symmetric(horizontal:10,vertical:5),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(20)),child:Row(mainAxisSize:MainAxisSize.min,children:[const Icon(Icons.star_rounded,color:Color(0xffe8b13d),size:17),const SizedBox(width:3),Text(score==null?'جديد':score.toStringAsFixed(1),style:const TextStyle(fontSize:12,fontWeight:FontWeight.w800))])))])),
   Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${branch['gym']?['name']??branch['name']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800)),const SizedBox(height:4),Text('${branch['name']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:muted,fontSize:11)),const SizedBox(height:10),Wrap(spacing:14,runSpacing:6,children:[Text('${branch['visitPricePoints']} نقطة',style:const TextStyle(color:green,fontWeight:FontWeight.w800,fontSize:13)),Text(branch['distanceKm']==null?'${branch['city']}':'${(branch['distanceKm'] as num).toStringAsFixed(1)} كم · ${branch['city']}',style:const TextStyle(color:muted,fontSize:11))])])),
  ])));
 }
}
class HomeOffers extends StatefulWidget {
 final ApiClient api;
 final double? latitude,longitude;
 const HomeOffers({super.key,required this.api,this.latitude,this.longitude});
 @override State<HomeOffers> createState()=>_HomeOffersState();
}
class _HomeOffersState extends State<HomeOffers>{
 List<Json> platform=[],nearby=[];bool loading=true;Object? error;int generation=0;Timer? refresh;
 @override void initState(){super.initState();load();refresh=Timer.periodic(const Duration(minutes:1),(_)=>load());}
 @override void didUpdateWidget(HomeOffers old){super.didUpdateWidget(old);if(old.latitude!=widget.latitude||old.longitude!=widget.longitude)load();}
 @override void dispose(){refresh?.cancel();generation++;super.dispose();}
 Future<void> load()async{
  final current=++generation;setState((){loading=true;error=null;if(widget.latitude==null||widget.longitude==null)nearby=[];});
  Future<void> part(bool local)async{try{final path=local?'trainee/nearby-promotions?latitude=${widget.latitude}&longitude=${widget.longitude}':'campaigns?placement=HOME';final r=await widget.api.request(path);if(mounted&&current==generation)setState((){if(local){nearby=rows(r);}else{platform=rows(r);}});}catch(e){if(mounted&&current==generation)setState((){error=e;if(local){nearby=[];}else{platform=[];}});}}
  await Future.wait([part(false),if(widget.latitude!=null&&widget.longitude!=null)part(true)]);
  if(mounted&&current==generation)setState(()=>loading=false);
 }
 @override Widget build(BuildContext context){
  final now=DateTime.now();final items=[...platform.map((r)=>{...r,'platform':true}),...nearby.map((r)=>{...r,'platform':false})].where((r)=>DateTime.tryParse('${r['endsAt']}')?.isAfter(now)==true).toList();
  if(loading&&items.isEmpty)return const Padding(padding:EdgeInsets.symmetric(vertical:20),child:LinearProgressIndicator(minHeight:2));
  if(items.isEmpty)return Padding(padding:const EdgeInsets.symmetric(horizontal:20,vertical:12),child:error!=null?ErrorNote(error,retry:load):const Text('مفيش عروض متاحة حاليًا. تابعنا علشان تشوف الجديد.',style:TextStyle(color:muted,fontSize:12)));
  final width=(MediaQuery.sizeOf(context).width*.86).clamp(260.0,440.0).toDouble();
  final height=165.0+(MediaQuery.textScalerOf(context).scale(100)-100).clamp(0.0,180.0);
  return SizedBox(height:height,child:ListView.separated(scrollDirection:Axis.horizontal,padding:const EdgeInsets.symmetric(horizontal:20),itemCount:items.length,separatorBuilder:(_,_)=>const SizedBox(width:14),itemBuilder:(context,i){final r=items[i],isPlatform=r['platform']==true;final image=r['imageUrl'];return SizedBox(width:width,child:Material(color:ink,borderRadius:BorderRadius.circular(28),clipBehavior:Clip.antiAlias,child:InkWell(onTap:isPlatform?(r['hasAction']==true?()=>openCampaign(context,widget.api,'${r['destination']}'):null):()=>open(context,BranchDetail(api:widget.api,id:'${r['branch']}')),child:Stack(fit:StackFit.expand,children:[
   if(image!=null)Image.network('$image',fit:isPlatform?BoxFit.contain:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:ink)),
   if(!isPlatform||image==null)const DecoratedBox(decoration:BoxDecoration(gradient:LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,colors:[Color(0x10101719),Color(0xf0101719)]))),
   Positioned(top:10,right:10,child:Container(padding:const EdgeInsets.symmetric(horizontal:11,vertical:6),decoration:BoxDecoration(color:lime,borderRadius:BorderRadius.circular(18)),child:Text(isPlatform?'عرض المنصة':'عرض قريب منك',style:const TextStyle(color:ink,fontSize:10,fontWeight:FontWeight.w800)))),
   if('${r['title']??''}'.isNotEmpty||!isPlatform)Positioned(bottom:12,left:14,right:14,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${r['title']??''}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontSize:16,fontWeight:FontWeight.w800)),const SizedBox(height:5),Text('${r['description']??''}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white70,fontSize:11,height:1.3)),if(!isPlatform)...[const SizedBox(height:10),Text('${r['gymName']} · ${r['city']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:lime,fontSize:11))]])),
  ]))));}));
 }
}
