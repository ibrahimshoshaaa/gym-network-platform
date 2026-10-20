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
class _CampaignBannerState extends State<CampaignBanner>{
 List<Json> items=[];Timer? timer;int generation=0;
 @override void initState(){super.initState();load();timer=Timer.periodic(const Duration(minutes:1),(_)=>load());}
 @override void dispose(){timer?.cancel();generation++;super.dispose();}
 Future<void> load()async{final current=++generation;try{final r=await widget.api.request('campaigns?placement=${widget.placement}');if(mounted&&generation==current)setState(()=>items=rows(r));}catch(_){if(mounted&&generation==current)setState(()=>items=[]);}}
 @override Widget build(BuildContext context)=>Column(children:[for(final c in items)if(DateTime.tryParse('${c['endsAt']}')?.isAfter(DateTime.now())==true)Padding(padding:const EdgeInsets.only(bottom:16),child:Panel(color:const Color(0xffe2faf1),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
 if(c['imageUrl'] is String&&Uri.tryParse(c['imageUrl'])?.host=='res.cloudinary.com')Padding(padding:const EdgeInsets.only(bottom:12),child:ClipRRect(borderRadius:BorderRadius.circular(14),child:Image.network(c['imageUrl'],width:double.infinity,height:150,fit:BoxFit.cover,errorBuilder:(_,error,stack)=>const SizedBox.shrink()))),
 const Text('من GymBank',style:TextStyle(color:green,fontSize:11)),const SizedBox(height:6),Text('${c['title']}',style:const TextStyle(fontWeight:FontWeight.w800,fontSize:17)),const SizedBox(height:6),Text('${c['description']}',style:const TextStyle(fontSize:13)),if(c['hasAction']==true)TextButton(onPressed:()=>openCampaign(context,widget.api,'${c['destination']}'),child:const Text('اعرف التفاصيل')),
 ])))]);
}
