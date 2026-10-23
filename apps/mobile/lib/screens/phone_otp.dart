import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

const phoneOtpPreview = bool.fromEnvironment('GYM_PHONE_OTP_PREVIEW', defaultValue: true);

Future<Json?> requestPhoneCode(BuildContext context, ApiClient api, String phone, String purpose, {Future<void> Function(Json)? onConfirm, bool english = false}) async {
 final challenge=Map<String,dynamic>.from(await api.request('auth/phone/challenge',method:'POST',body:{'phone':phone,'purpose':purpose}));
 if(!context.mounted)return null;
 return showDialog<Json>(context:context,barrierDismissible:false,builder:(_)=>Directionality(textDirection:english?TextDirection.ltr:TextDirection.rtl,child:_PhoneCodeDialog(api:api,phone:phone,purpose:purpose,challenge:challenge,onConfirm:onConfirm,english:english)));
}
class _PhoneCodeDialog extends StatefulWidget{
 final ApiClient api;final bool english;final String phone,purpose;final Json challenge;final Future<void> Function(Json)? onConfirm;
 const _PhoneCodeDialog({required this.api,required this.phone,required this.purpose,required this.challenge,this.onConfirm,required this.english});
 @override State<_PhoneCodeDialog> createState()=>_PhoneCodeDialogState();
}
class _PhoneCodeDialogState extends State<_PhoneCodeDialog>{
 final code=TextEditingController();late Json challenge;bool busy=false;Object? error;Timer? timer;int wait=60;
 @override void initState(){super.initState();challenge=widget.challenge;fillTestCode();countdown();}
 void fillTestCode(){code.text=challenge['testMode']==true?'123456':'';}
 void countdown(){timer?.cancel();wait=60;timer=Timer.periodic(const Duration(seconds:1),(t){if(!mounted){t.cancel();return;}setState(()=>wait--);if(wait<=0)t.cancel();});}
 @override void dispose(){timer?.cancel();code.dispose();super.dispose();}
 String tr(String ar, String en) => widget.english ? en : ar;
 @override Widget build(BuildContext context)=>PopScope(canPop:!busy,child:AlertDialog(title:Text(tr('تأكيد رقم الموبايل — تجربة','Verify mobile number — test')),content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
  Text(widget.phone,textDirection:TextDirection.ltr),const SizedBox(height:12),
  Text(tr('وضع تجريبي: لا يتم إرسال SMS. كود التجربة 123456 بيتملّى تلقائيًا، وصلاحيته ٥ دقائق.','Test mode: no SMS is sent. Code 123456 is autofilled and expires in 5 minutes.')),
  TextField(key:const ValueKey('phone.otp.code'),controller:code,enabled:!busy,keyboardType:TextInputType.number,textDirection:TextDirection.ltr,maxLength:6,autofillHints:const [AutofillHints.oneTimeCode],decoration:InputDecoration(labelText:tr('كود التأكيد','Verification code'))),
  ErrorNote(error),TextButton(onPressed:busy||wait>0?null:()async{setState(()=>busy=true);try{final r=await widget.api.request('auth/phone/challenge',method:'POST',body:{'phone':widget.phone,'purpose':widget.purpose});if(mounted)setState((){challenge=Map<String,dynamic>.from(r);fillTestCode();error=null;countdown();});}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}},child:Text(wait>0?tr('إعادة الطلب بعد $wait ثانية','Request again in $wait seconds'):tr('طلب كود جديد','Request a new code'))),
 ])),actions:[TextButton(onPressed:busy?null:()=>Navigator.pop(context),child:Text(tr('رجوع','Back'))),TextButton(onPressed:busy?null:()async{final value=digits(code.text.trim());if(!RegExp(r'^\d{6}$').hasMatch(value)){setState(()=>error=const ApiFailure('INVALID_INPUT'));return;}final proof=<String,dynamic>{'challengeId':challenge['challengeId'],'code':value};setState((){busy=true;error=null;});try{await widget.onConfirm?.call(proof);if(context.mounted)Navigator.pop(context,proof);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}},child:busy?const SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2)):Text(tr('متابعة','Continue')))]));
}

class PhonePasswordReset extends StatefulWidget{
 final ApiClient api;final bool english;const PhonePasswordReset({super.key,required this.api,this.english=false});
 @override State<PhonePasswordReset> createState()=>_PhonePasswordResetState();
}
class _PhonePasswordResetState extends State<PhonePasswordReset>{
 final phone=TextEditingController(),password=TextEditingController();bool busy=false,done=false;Object? error;
 @override void dispose(){phone.dispose();password.dispose();super.dispose();}
 String tr(String ar, String en) => widget.english ? en : ar;
 @override Widget build(BuildContext context)=>Localizations.override(context:context,locale:Locale(widget.english?'en':'ar'),child:Directionality(textDirection:widget.english?TextDirection.ltr:TextDirection.rtl,child:Screen(title:tr('استرجاع كلمة السر بالموبايل','Reset password by phone'),child:ListView(padding:const EdgeInsets.all(22),children:[
  Text(tr('تجربة بدون SMS، لحسابات الموبايل التجريبية فقط. الحسابات القديمة تُسترجع من خلال الدعم.','No SMS is sent. This trial supports accounts created through phone test mode only. Contact support for older accounts.')),const SizedBox(height:16),
  if(done)...[Text(tr('تم تغيير كلمة السر وإغلاق الجلسات القديمة. سجّل الدخول بنفس الرقم وكلمة السر الجديدة.','Password changed and previous sessions revoked. Sign in with your phone and new password.')),ActionButton(tr('رجوع للدخول','Back to sign in'),onPressed:()=>Navigator.pop(context))]else...[
   TextField(key:const ValueKey('phone.reset.phone'),controller:phone,enabled:!busy,keyboardType:TextInputType.phone,textDirection:TextDirection.ltr,decoration:InputDecoration(labelText:tr('نفس رقم الموبايل المسجّل','Your registered mobile number'))),
   TextField(key:const ValueKey('phone.reset.password'),controller:password,enabled:!busy,obscureText:true,decoration:InputDecoration(labelText:tr('كلمة السر الجديدة — ١٥ حرفًا على الأقل','New password — at least 15 characters'))),
   ErrorNote(error),const SizedBox(height:16),ActionButton(tr('طلب كود وتغيير كلمة السر','Request code and change password'),busy:busy,onPressed:()async{if(busy)return;if(password.text.runes.length<15){setState(()=>error=const ApiFailure('INVALID_INPUT'));return;}setState((){busy=true;error=null;});try{final proof=await requestPhoneCode(context,widget.api,phone.text,'RESET',english:widget.english,onConfirm:(proof)async{await widget.api.request('auth/phone/reset',method:'POST',body:{'phone':phone.text,...proof,'newPassword':password.text});});if(proof==null)return;if(mounted)setState(()=>done=true);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}),
  ],
 ]))));
}
