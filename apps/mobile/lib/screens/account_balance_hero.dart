import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

class BalanceHeroAction {
 final String label;final IconData icon;final VoidCallback? onPressed;
 const BalanceHeroAction(this.label,this.icon,this.onPressed);
}
/// One layout for every role. Width and alignment include the logo's real bounds.
class AccountBalanceHero extends StatelessWidget {
 final ApiClient api;final String subtitle,label,status;final String? points;
 final bool loading;final VoidCallback notifications;
 final BalanceHeroAction primary,secondary,footer;
 const AccountBalanceHero({super.key,required this.api,required this.subtitle,required this.label,required this.status,required this.points,required this.loading,required this.notifications,required this.primary,required this.secondary,required this.footer});
 @override Widget build(BuildContext context){
  final name='${api.user?['displayName']??'متدرب'}'.trim();
  Widget button(BalanceHeroAction a,bool filled)=>Expanded(child:FilledButton.icon(style:FilledButton.styleFrom(backgroundColor:filled?lime:Colors.white.withValues(alpha:.10),foregroundColor:filled?ink:Colors.white,disabledBackgroundColor:Colors.white.withValues(alpha:.06),disabledForegroundColor:Colors.white38,minimumSize:const Size(0,52),padding:const EdgeInsets.symmetric(horizontal:7,vertical:10),textStyle:const TextStyle(fontSize:11,fontWeight:FontWeight.w800),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(17))),onPressed:a.onPressed,icon:Icon(a.icon,size:18),label:Text(a.label,textAlign:TextAlign.center)));
  return ClipRRect(key:const ValueKey('account-hero-surface'),borderRadius:const BorderRadius.only(bottomLeft:Radius.circular(36),bottomRight:Radius.circular(36)),child:DecoratedBox(decoration:const BoxDecoration(gradient:LinearGradient(begin:Alignment.topRight,end:Alignment.bottomLeft,colors:[Color(0xff183c34),ink,Color(0xff0b2524)])),child:Padding(padding:const EdgeInsets.fromLTRB(18,14,18,8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   ConstrainedBox(constraints:const BoxConstraints(minHeight:52),child:Row(crossAxisAlignment:CrossAxisAlignment.center,children:[
    Container(width:36,height:36,decoration:BoxDecoration(shape:BoxShape.circle,color:lime.withValues(alpha:.12),border:Border.all(color:lime.withValues(alpha:.45))),child:Center(child:Text(name.isEmpty?'؟':name.characters.first,style:const TextStyle(color:lime,fontSize:20,fontWeight:FontWeight.w800)))),
    const SizedBox(width:8),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('أهلًا، $name',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white,fontSize:17,height:1.3,fontWeight:FontWeight.w800)),Text(subtitle,maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(color:Colors.white60,fontSize:10,height:1.3))])),const SizedBox(width:6),
    // Explicit LTR order: B at the screen's left edge, bell immediately inward.
    Row(textDirection:TextDirection.ltr,mainAxisSize:MainAxisSize.min,children:[
     const GymBankTransparentMark(),const SizedBox(width:8),
     SizedBox(key:const ValueKey('account-hero-notifications'),width:40,height:44,child:IconButton(tooltip:'الإشعارات',onPressed:notifications,style:IconButton.styleFrom(backgroundColor:Colors.white.withValues(alpha:.07),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(14))),icon:const Icon(Icons.notifications_none_rounded,color:Colors.white,size:23))),
    ]),
   ])),
   const SizedBox(height:14),Wrap(spacing:10,runSpacing:6,crossAxisAlignment:WrapCrossAlignment.center,children:[Text(label,style:const TextStyle(color:Colors.white60,fontSize:12)),Container(padding:const EdgeInsets.symmetric(horizontal:9,vertical:3),decoration:BoxDecoration(color:lime.withValues(alpha:.1),borderRadius:BorderRadius.circular(20)),child:Text(status,style:const TextStyle(color:lime,fontSize:10)))]),const SizedBox(height:5),
   if(loading&&points==null)const SizedBox(height:46,child:Center(child:LinearProgressIndicator(color:lime,minHeight:2)))
   else if(points==null)const SizedBox(height:46,child:Align(alignment:AlignmentDirectional.centerStart,child:Text('تعذر تحميل رصيد النقاط',style:TextStyle(color:Colors.white,fontSize:12))))
   else SizedBox(width:double.infinity,child:FittedBox(fit:BoxFit.scaleDown,alignment:AlignmentDirectional.centerStart,child:Text.rich(TextSpan(children:[TextSpan(text:points,style:const TextStyle(color:Colors.white,fontSize:40,fontWeight:FontWeight.w900,height:1.15)),const TextSpan(text:' نقطة',style:TextStyle(color:lime,fontSize:17,fontWeight:FontWeight.w800))])))),
   const SizedBox(height:13),Row(children:[button(primary,true),const SizedBox(width:10),button(secondary,false)]),
   Align(alignment:AlignmentDirectional.centerEnd,child:TextButton(onPressed:footer.onPressed,style:TextButton.styleFrom(foregroundColor:Colors.white60,minimumSize:const Size(44,44),tapTargetSize:MaterialTapTargetSize.shrinkWrap,padding:const EdgeInsets.symmetric(horizontal:4,vertical:3),textStyle:const TextStyle(fontSize:10)),child:Text(footer.label))),
  ]))));
 }
}
class GymBankTransparentMark extends StatelessWidget {
 const GymBankTransparentMark({super.key});
 @override Widget build(BuildContext context)=>Semantics(label:'GYMBANK',image:true,child:SizedBox(key:const ValueKey('account-hero-brand'),width:36,height:44,child:ClipRect(child:OverflowBox(minWidth:64,maxWidth:64,minHeight:64,maxHeight:64,alignment:Alignment.center,child:ColorFiltered(colorFilter:const ColorFilter.matrix([
  1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,3,0,0,-153,
 ]),child:Image.asset('assets/brand/gymbank-icon.png',width:64,height:64,excludeFromSemantics:true))))));
}
