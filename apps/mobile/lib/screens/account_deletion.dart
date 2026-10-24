import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

const deletionNotice = 'حذف الحساب نهائي. هنحذف الاسم وبيانات الاتصال وكلمة السر والمحتوى الشخصي والصور غير المالية، وننهي جلساتك. بنحتفظ بسجلات العمليات والإيصالات المالية وسجلات الأمان اللازمة للمحاسبة والنزاعات. الحذف مش بيلغي رصيد أو مستحقات.';
const deletionBlockerNames = {
  'UPLOADS':'رفع صور جاري أو تعذر تأكيد نتيجته؛ أعد المحاولة بعد 10 دقائق',
  'ACCOUNT_REVIEW':'الحساب محتاج مراجعة الإدارة',
  'GYM_CLOSURE':'إغلاق الجيم من الإدارة قبل الحذف',
  'POINT_BALANCE':'رصيد نقاط يحتاج تسوية', 'MONEY_BALANCE':'مستحقات مالية تحتاج تسوية',
  'BOOKINGS':'حجوزات لم تنتهِ', 'VISITS':'زيارات ما زالت سارية',
  'TOPUPS':'طلبات شحن قيد المراجعة', 'WITHDRAWALS':'طلبات سحب مفتوحة',
  'DISPUTES':'مبالغ محل نزاع', 'REVIEWS':'طلبات مراجعة عمليات',
  'SUPPORT':'طلبات دعم مالية مفتوحة', 'MAINTENANCE':'طلبات صيانة مفتوحة',
  'PROMOTIONS':'طلبات إعلان أو إعلانات سارية', 'SERVICE_CHARGES':'رسوم خدمات تحتاج تسوية',
};

class AccountDeletionScreen extends StatefulWidget {
  final ApiClient api;
  const AccountDeletionScreen({super.key,required this.api});
  @override State<AccountDeletionScreen> createState()=>_AccountDeletionScreenState();
}
class _AccountDeletionScreenState extends State<AccountDeletionScreen>{
  final password=TextEditingController(),confirmation=TextEditingController();
  Json? data;
  bool loading=true,busy=false;
  Object? error;
  @override void initState(){super.initState();load();}
  @override void dispose(){password.dispose();confirmation.dispose();super.dispose();}
  Future<void> load()async{
    setState((){loading=true;error=null;});
    try{
      // Resolve a response lost after erasure before trying the now-revoked session.
      if(await widget.api.checkDeletionReceipt())return;
      final r=await widget.api.request('me/account-deletion');
      if(mounted)setState(()=>data=Map<String,dynamic>.from(r));
    }catch(e){if(mounted)setState(()=>error=e);}
    finally{if(mounted)setState(()=>loading=false);}
  }
  Future<void> submit(bool cancel)async{
    if(busy)return;
    if(password.text.isEmpty||(!cancel&&confirmation.text!='DELETE')){
      setState(()=>error=const ApiFailure('INVALID_INPUT'));return;
    }
    FocusScope.of(context).unfocus();
    setState((){busy=true;error=null;});
    try{
      final r=cancel?await widget.api.request('me/account-deletion/cancel',method:'POST',body:{'currentPassword':password.text})
        :await widget.api.deleteAccount(password.text);
      password.clear();confirmation.clear();
      if(mounted)setState(()=>data=Map<String,dynamic>.from(r));
    }catch(e){if(mounted)setState(()=>error=e);}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context){
    final pending=data?['request']?['status']=='PENDING';
    return PopScope(canPop:!busy,child:Screen(title:'حذف الحساب',child:ListView(
      padding:const EdgeInsets.all(24),children:[
        const Icon(Icons.delete_forever_outlined,size:42,color:Colors.redAccent),
        const SizedBox(height:16),const Text(deletionNotice),
        const SizedBox(height:16),
        const Text('لو فيه رصيد أو طلبات مفتوحة، هنسجل طلب الحذف ونوضح المطلوب تسويته. الإدارة تراجع الطلب خلال 7 أيام؛ الإتمام مرتبط بانتهاء التسوية. حذف الصور من التخزين ممكن يحتاج وقت إضافي.'),
        if(loading)const Padding(padding:EdgeInsets.all(24),child:Center(child:CircularProgressIndicator())),
        if(data!=null)...[
          if(pending)...[
            const SectionTitle('طلب الحذف مسجل'),
            Text('موعد مراجعة الطلب: ${shortDate(data!['request']['reviewDueAt'])}'),
            const Text('تقدر تستخدم الحساب لتسوية الالتزامات، أو تلغي الطلب قبل بدء الحذف.'),
          ],
          for(final b in (data!['blockers'] as List? ?? []))
            ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.info_outline),
              title:Text(deletionBlockerNames[b['code']]??'التزام يحتاج مراجعة'),trailing:Text('${b['count']}')),
          const SizedBox(height:20),
          TextField(controller:password,enabled:!busy,obscureText:true,autocorrect:false,enableSuggestions:false,
            autofillHints:const [AutofillHints.password],decoration:const InputDecoration(labelText:'كلمة السر الحالية')),
          const SizedBox(height:16),
          TextField(controller:confirmation,enabled:!busy,autocorrect:false,enableSuggestions:false,textDirection:TextDirection.ltr,
            decoration:const InputDecoration(labelText:'اكتب DELETE لتأكيد الحذف')),
          const SizedBox(height:20),
          ActionButton(pending?'إعادة فحص التسوية وإتمام الحذف':'تأكيد حذف الحساب',busy:busy,onPressed:()=>submit(false),icon:Icons.delete_forever_outlined),
          if(pending)TextButton(onPressed:busy?null:()=>submit(true),child:const Text('إلغاء طلب الحذف بكلمة السر')),
        ],
        ErrorNote(error),
        TextButton(onPressed:busy||loading?null:load,child:const Text('تحديث حالة الطلب')),
      ])));
  }
}

class AccountDeletionReceipt extends StatelessWidget{
 final ApiClient api;
 const AccountDeletionReceipt({super.key,required this.api});
 @override Widget build(BuildContext context)=>Screen(title:'حالة حذف الحساب',child:ListView(
   padding:const EdgeInsets.all(24),children:[
     const SizedBox(height:24),
     Icon(api.deletionReceipt?['request']?['status']=='COMPLETED'?Icons.check_circle_outline:Icons.hourglass_top,size:56,color:green),
     const SizedBox(height:24),
     Text(api.deletionReceipt?['request']?['status']=='COMPLETED'?'تم حذف الحساب':'تم حذف بيانات الحساب، وجاري حذف الصور',style:Theme.of(context).textTheme.titleLarge),
     const SizedBox(height:16),const Text('انتهت صلاحية تسجيل الدخول. السجلات المالية وسجلات الأمان المطلوبة للمحاسبة والنزاعات محفوظة بصورة مقيدة.'),
     const SizedBox(height:20),
     TextButton(onPressed:()async{
       try{await api.checkDeletionReceipt();}catch(e){if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('تعذر تحديث الحالة. حاول مرة تانية.')));}
     },child:const Text('تحديث حالة حذف الصور')),
     TextButton(onPressed:()=>api.dismissDeletionReceipt(),child:const Text('الرجوع لتسجيل الدخول')),
   ]));
}
