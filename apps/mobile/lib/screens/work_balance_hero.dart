import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'account.dart';

/// Only the caller's authorized gym/branch stock is shown; never a personal wallet.
class WorkBalanceHero extends StatelessWidget {
 final ApiClient api;final String scope,label,detail;final String? points;
 final bool loading;final List<Widget> actions;
 const WorkBalanceHero({super.key,required this.api,required this.scope,required this.label,required this.points,required this.loading,this.detail='',this.actions=const []});
 @override Widget build(BuildContext context){
  final name='${api.user?['displayName']??'أهلًا بيك'}'.trim();
  return ClipRRect(borderRadius:const BorderRadius.only(bottomLeft:Radius.circular(36),bottomRight:Radius.circular(36)),child:DecoratedBox(decoration:const BoxDecoration(gradient:LinearGradient(begin:Alignment.topRight,end:Alignment.bottomLeft,colors:[Color(0xff183c34),ink,Color(0xff0b2524)])),child:Padding(padding:const EdgeInsets.fromLTRB(20,18,20,16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Row(children:[Container(width:44,height:44,decoration:BoxDecoration(shape:BoxShape.circle,color:lime.withValues(alpha:.12),border:Border.all(color:lime.withValues(alpha:.5))),child:Center(child:Text(name.isEmpty?'؟':name.characters.first,style:const TextStyle(color:lime,fontSize:22,fontWeight:FontWeight.w800)))),const SizedBox(width:12),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('أهلًا، $name',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontSize:19,fontWeight:FontWeight.w800)),Text(scope,maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white60,fontSize:11))])),IconButton(tooltip:'الإشعارات',onPressed:()=>open(context,NotificationsScreen(api:api)),icon:const Icon(Icons.notifications_none_rounded,color:Colors.white))]),
   const SizedBox(height:18),Text(label,style:const TextStyle(color:Colors.white60,fontSize:12)),const SizedBox(height:6),
   if(loading&&points==null)const Padding(padding:EdgeInsets.symmetric(vertical:12),child:LinearProgressIndicator(color:lime,minHeight:2))
   else if(points==null)const Text('تعذر تحميل رصيد النقاط',style:TextStyle(color:Colors.white))
   else FittedBox(fit:BoxFit.scaleDown,alignment:AlignmentDirectional.centerStart,child:Text('$points نقطة',style:const TextStyle(color:lime,fontSize:34,fontWeight:FontWeight.w900,height:1.2))),
   if(detail.isNotEmpty)...[const SizedBox(height:6),Text(detail,style:const TextStyle(color:Colors.white60,fontSize:11))],
   if(actions.isNotEmpty)...[const SizedBox(height:16),Theme(data:Theme.of(context).copyWith(filledButtonTheme:FilledButtonThemeData(style:FilledButton.styleFrom(backgroundColor:lime,foregroundColor:ink,minimumSize:const Size(0,48),textStyle:const TextStyle(fontSize:12,fontWeight:FontWeight.w800),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(18)))),outlinedButtonTheme:OutlinedButtonThemeData(style:OutlinedButton.styleFrom(foregroundColor:Colors.white,side:const BorderSide(color:Colors.white30),minimumSize:const Size(0,48))),textButtonTheme:TextButtonThemeData(style:TextButton.styleFrom(foregroundColor:lime))),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:actions))],
  ]))));
 }
}
