import '../l10n/language.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

String get deletionNotice => appText('s508');
Map<String, String> get deletionBlockerNames => {
  'UPLOADS':appText('s509'),
  'ACCOUNT_REVIEW':appText('s510'),
  'GYM_CLOSURE':appText('s511'),
  'ARCHIVED_FINANCIAL_REVIEW':appText('s512'),
  'POINT_BALANCE':appText('s513'), 'MONEY_BALANCE':appText('s514'),
  'BOOKINGS':appText('s515'), 'VISITS':appText('s516'),
  'TOPUPS':appText('s517'), 'WITHDRAWALS':appText('s518'),
  'DISPUTES':appText('s519'), 'REVIEWS':appText('s520'),
  'SUPPORT':appText('s521'), 'MAINTENANCE':appText('s522'),
  'PROMOTIONS':appText('s523'), 'SERVICE_CHARGES':appText('s524'),
};

class AccountDeletionScreen extends StatefulWidget {
  final ApiClient api;
  const AccountDeletionScreen({super.key,required this.api});
  @override State<AccountDeletionScreen> createState()=>_AccountDeletionScreenState();
}
class _AccountDeletionScreenState extends State<AccountDeletionScreen>{
  final phone=TextEditingController(),confirmation=TextEditingController();
  Json? data;
  bool loading=true,busy=false;
  Object? error;
  @override void initState(){super.initState();load();}
  @override void dispose(){phone.dispose();confirmation.dispose();super.dispose();}
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
    if(phone.text.trim().isEmpty){
      setState(()=>error=appText('s525'));return;
    }
    if(!cancel&&confirmation.text!='DELETE'){
      setState(()=>error=appText('s526'));return;
    }
    FocusScope.of(context).unfocus();
    setState((){busy=true;error=null;});
    try{
      final r=cancel?await widget.api.request('me/account-deletion/cancel',method:'POST',body:{'phone':phone.text})
        :await widget.api.deleteAccount(phone.text);
      phone.clear();confirmation.clear();
      if(mounted)setState(()=>data=Map<String,dynamic>.from(r));
    }catch(e){if(mounted)setState(()=>error=e is ApiFailure&&e.code=='INVALID_CREDENTIALS'?appText('s527'):e);}
    finally{if(mounted)setState(()=>busy=false);}
  }
  @override Widget build(BuildContext context){
    AppLanguage.watch(context);
    final pending=data?['request']?['status']=='PENDING';
    return PopScope(canPop:!busy,child:Screen(title:appText('s4'),child:ListView(
      padding:const EdgeInsets.all(24),children:[
        const Icon(Icons.delete_forever_outlined,size:42,color:Colors.redAccent),
        const SizedBox(height:16),const Text(deletionNotice),
        const SizedBox(height:16),
        Text(appText('s528')),
        if(loading)const Padding(padding:EdgeInsets.all(24),child:Center(child:CircularProgressIndicator())),
        if(data!=null)...[
          if(pending)...[
            SectionTitle(appText('s529')),
            Text(appText('s530', [shortDate(data!['request']['reviewDueAt'])])),
            Text(appText('s531')),
          ],
          for(final b in (data!['blockers'] as List? ?? []))
            ListTile(contentPadding:EdgeInsets.zero,leading:const Icon(Icons.info_outline),
              title:Text(deletionBlockerNames[b['code']]??appText('s532')),trailing:Text('${b['count']}')),
          const SizedBox(height:20),
          TextField(key:const Key('deletion-phone'),controller:phone,enabled:!busy,keyboardType:TextInputType.phone,textDirection:TextDirection.ltr,
            autofillHints:const [AutofillHints.telephoneNumber],decoration:InputDecoration(labelText:appText('s533'),hintText:appText('s534'),prefixIcon:Icon(Icons.phone_iphone_rounded))),
          const SizedBox(height:16),
          TextField(key:const Key('deletion-confirmation'),controller:confirmation,enabled:!busy,autocorrect:false,enableSuggestions:false,textDirection:TextDirection.ltr,
            decoration:InputDecoration(labelText:appText('s535'))),
          const SizedBox(height:20),
          Theme(data:Theme.of(context).copyWith(colorScheme:Theme.of(context).colorScheme.copyWith(primary:const Color(0xffba1a1a))),child:ActionButton(pending?appText('s536'):appText('s537'),busy:busy,onPressed:()=>submit(false),icon:Icons.delete_forever_outlined)),
          if(pending)TextButton(onPressed:busy?null:()=>submit(true),child:Text(appText('s538'))),
        ],
        ErrorNote(error),
        TextButton(onPressed:busy||loading?null:load,child:Text(appText('s321'))),
      ])));
  }
}

class AccountDeletionReceipt extends StatelessWidget{
 final ApiClient api;
 const AccountDeletionReceipt({super.key,required this.api});
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s539'),child:ListView(
   padding:const EdgeInsets.all(24),children:[
     const SizedBox(height:24),
     Icon(api.deletionReceipt?['request']?['status']=='COMPLETED'?Icons.check_circle_outline:Icons.hourglass_top,size:56,color:green),
     const SizedBox(height:24),
     Text(api.deletionReceipt?['request']?['status']=='COMPLETED'?appText('s540'):appText('s541'),style:Theme.of(context).textTheme.titleLarge),
     const SizedBox(height:16),Text(appText('s542')),
     const SizedBox(height:20),
     TextButton(onPressed:()async{
       try{await api.checkDeletionReceipt();}catch(e){if(context.mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('s543'))));}
     },child:Text(appText('s544'))),
     TextButton(onPressed:()=>api.dismissDeletionReceipt(),child:Text(appText('s545'))),
   ])); }
}
