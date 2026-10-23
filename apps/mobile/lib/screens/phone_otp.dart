import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

const phoneOtpPreview = bool.fromEnvironment('GYM_PHONE_OTP_PREVIEW');
const testTraineePhone = '+15555550123';
const testOwnerPhone = '+15555550124';

Future<Json?> requestPhoneCode(BuildContext context, ApiClient api, String phone, String purpose, {Future<void> Function(Json)? onConfirm}) async {
 final challenge=Map<String,dynamic>.from(await api.request('auth/phone/challenge',method:'POST',body:{'phone':phone,'purpose':purpose}));
 if(!context.mounted)return null;
 return showDialog<Json>(context:context,barrierDismissible:false,builder:(_)=>_PhoneCodeDialog(api:api,phone:phone,purpose:purpose,challenge:challenge,onConfirm:onConfirm));
}
class _PhoneCodeDialog extends StatefulWidget{
 final ApiClient api;final String phone,purpose;final Json challenge;final Future<void> Function(Json)? onConfirm;
 const _PhoneCodeDialog({required this.api,required this.phone,required this.purpose,required this.challenge,this.onConfirm});
 @override State<_PhoneCodeDialog> createState()=>_PhoneCodeDialogState();
}
class _PhoneCodeDialogState extends State<_PhoneCodeDialog>{
 final code=TextEditingController();late Json challenge;bool busy=false;Object? error;Timer? timer;int wait=60;
 @override void initState(){super.initState();challenge=widget.challenge;fillTestCode();countdown();}
 void fillTestCode(){code.text=challenge['testMode']==true?'123456':'';}
 void countdown(){timer?.cancel();wait=60;timer=Timer.periodic(const Duration(seconds:1),(t){if(!mounted){t.cancel();return;}setState(()=>wait--);if(wait<=0)t.cancel();});}
 @override void dispose(){timer?.cancel();code.dispose();super.dispose();}
 @override Widget build(BuildContext context)=>AlertDialog(title:const Text('تأكيد رقم الموبايل — تجربة'),content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
  Text(widget.phone,textDirection:TextDirection.ltr),const SizedBox(height:12),
  const Text('وضع تجريبي: لا يتم إرسال SMS. كود التجربة 123456 بيتملّى تلقائيًا، وصلاحيته ٥ دقائق.'),
  TextField(key:const ValueKey('phone.otp.code'),controller:code,enabled:!busy,keyboardType:TextInputType.number,textDirection:TextDirection.ltr,maxLength:6,autofillHints:const [AutofillHints.oneTimeCode],decoration:const InputDecoration(labelText:'كود التأكيد')),
  ErrorNote(error),TextButton(onPressed:busy||wait>0?null:()async{setState(()=>busy=true);try{final r=await widget.api.request('auth/phone/challenge',method:'POST',body:{'phone':widget.phone,'purpose':widget.purpose});if(mounted)setState((){challenge=Map<String,dynamic>.from(r);fillTestCode();error=null;countdown();});}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}},child:Text(wait>0?'إعادة الطلب بعد $wait ثانية':'طلب كود جديد')),
 ])),actions:[TextButton(onPressed:busy?null:()=>Navigator.pop(context),child:const Text('رجوع')),TextButton(onPressed:busy?null:()async{final value=digits(code.text.trim());if(!RegExp(r'^\d{6}$').hasMatch(value)){setState(()=>error=const ApiFailure('INVALID_INPUT'));return;}final proof=<String,dynamic>{'challengeId':challenge['challengeId'],'code':value};setState((){busy=true;error=null;});try{await widget.onConfirm?.call(proof);if(context.mounted)Navigator.pop(context,proof);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}},child:const Text('متابعة'))]);
}

class PhonePasswordReset extends StatefulWidget{
 final ApiClient api;const PhonePasswordReset({super.key,required this.api});
 @override State<PhonePasswordReset> createState()=>_PhonePasswordResetState();
}
class _PhonePasswordResetState extends State<PhonePasswordReset>{
 final phone=TextEditingController(text:testTraineePhone),password=TextEditingController();bool busy=false,done=false;Object? error;
 @override void dispose(){phone.dispose();password.dispose();super.dispose();}
 @override Widget build(BuildContext context)=>Screen(title:'استرجاع كلمة السر بالموبايل',child:ListView(padding:const EdgeInsets.all(22),children:[
  const Text('تجربة بدون SMS، لحسابات الموبايل التجريبية فقط. الحسابات القديمة تُسترجع من خلال الدعم.'),const SizedBox(height:16),
  if(done)...[const Text('تم تغيير كلمة السر وإغلاق الجلسات القديمة. سجّل الدخول بنفس الرقم وكلمة السر الجديدة.'),ActionButton('رجوع للدخول',onPressed:()=>Navigator.pop(context))]else...[
   TextField(key:const ValueKey('phone.reset.phone'),controller:phone,enabled:!busy,keyboardType:TextInputType.phone,textDirection:TextDirection.ltr,decoration:const InputDecoration(labelText:'نفس رقم الموبايل المسجّل')),
   TextField(key:const ValueKey('phone.reset.password'),controller:password,enabled:!busy,obscureText:true,decoration:const InputDecoration(labelText:'كلمة السر الجديدة — ١٥ حرفًا على الأقل')),
   ErrorNote(error),const SizedBox(height:16),ActionButton('طلب كود وتغيير كلمة السر',busy:busy,onPressed:()async{if(busy)return;if(password.text.runes.length<15){setState(()=>error=const ApiFailure('INVALID_INPUT'));return;}setState((){busy=true;error=null;});try{final proof=await requestPhoneCode(context,widget.api,phone.text,'RESET',onConfirm:(proof)async{await widget.api.request('auth/phone/reset',method:'POST',body:{'phone':phone.text,...proof,'newPassword':password.text});});if(proof==null)return;if(mounted)setState(()=>done=true);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}),
  ],
 ]));
}
