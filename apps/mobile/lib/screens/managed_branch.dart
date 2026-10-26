import '../l10n/language.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'owner.dart';
class ManagedBranch extends StatefulWidget{
 final ApiClient api;final Json branch;final String task;
 const ManagedBranch({super.key,required this.api,required this.branch,required this.task});
 @override State<ManagedBranch> createState()=>_ManagedBranchState();
}
class _ManagedBranchState extends State<ManagedBranch>{
 final name=TextEditingController(),address=TextEditingController(),city=TextEditingController(),governorate=TextEditingController(),points=TextEditingController(),minutes=TextEditingController(),reason=TextEditingController(),amount=TextEditingController(),account=TextEditingController();
 String method='INSTAPAY';bool busy=false,confirmed=false;Object? error;Json? entitlement;int version=0;
 String get path=>'gyms/${widget.branch['gymId']}';
 @override void initState(){super.initState();load();}
 @override void dispose(){for(final c in [name,address,city,governorate,points,minutes,reason,amount,account]){c.dispose();}super.dispose();}
 Future<void> load()async{try{
  if(widget.task=='withdraw'){final r=await widget.api.request('operations/branches/${widget.branch['id']}/entitlements');if(mounted)setState(()=>entitlement=Map<String,dynamic>.from(r));}
  if(widget.task=='edit'){final r=await widget.api.request('branches/${widget.branch['id']}/manage');if(mounted)setState((){name.text=r['name']??'';address.text=r['address']??'';city.text=r['city']??'';governorate.text=r['governorate']??'';});}
 }catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> submit()async{if(busy||widget.api.pending!=null||!confirmed)return;setState((){busy=true;error=null;});try{
  if(widget.task=='edit')await widget.api.request('$path/branches/${widget.branch['id']}',method:'PATCH',body:{'name':name.text,'address':address.text,'city':city.text,'governorate':governorate.text});
  if(widget.task=='price')await widget.api.request('$path/branches/${widget.branch['id']}/price-change-requests',method:'POST',body:{'visitPricePoints':int.tryParse(digits(points.text)),'sessionMinutes':int.tryParse(digits(minutes.text)),'reason':reason.text});
  if(widget.task=='withdraw')await widget.api.transact('$path/withdrawals',{'branchId':widget.branch['id'],'amountPiasters':piasters(amount.text),'paymentMethod':method,'destinationName':name.text,'destinationAccount':account.text});
  if(mounted){setState((){version++;confirmed=false;});ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('s483'))));await load();}
 }catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 Widget field(TextEditingController c,String label,{bool numeric=false})=>Padding(padding:const EdgeInsets.only(bottom:14),child:TextField(controller:c,enabled:!busy&&widget.api.pending==null,keyboardType:numeric?const TextInputType.numberWithOptions(decimal:true):TextInputType.text,onChanged:(_)=>setState(()=>confirmed=false),decoration:InputDecoration(labelText:label)));
 @override Widget build(BuildContext context){
    AppLanguage.watch(context);
 final locked=busy||widget.api.pending!=null;
 if(widget.task=='staff')return Screen(title:appText('s484', [widget.branch['name']]),child:PagedRecords(key:ValueKey(version),api:widget.api,path:'$path/staff?branchId=${widget.branch['id']}',header:ActionButton(appText('s485'),onPressed:()=>open(context,InviteStaff(api:widget.api,gymId:widget.branch['gymId'],branchId:widget.branch['id'],allowManager:false))),item:(s)=>s['role']!='CASHIER'?const SizedBox.shrink():Panel(child:Column(children:[Text('${s['user']['displayName']}'),StatusPill(s['active']==true?'ACTIVE':'SUSPENDED'),TextButton(onPressed:locked?null:()async{setState(()=>busy=true);try{await widget.api.request('$path/staff/${s['id']}',method:'PATCH',body:{'active':s['active']!=true});if(mounted)setState(()=>version++);}catch(e){if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('$e')));}finally{if(mounted)setState(()=>busy=false);}},child:Text(s['active']==true?appText('s486'):appText('s487')))]))));
 return Screen(title:{'edit':appText('s376'),'price':appText('s377'),'withdraw':appText('s378')}[widget.task]??appText('s488'),child:ListView(padding:const EdgeInsets.all(20),children:[
 Panel(child:Text('${widget.branch['gymName']} · ${widget.branch['name']}')),const SizedBox(height:16),ErrorNote(error,retry:load),
 if(widget.task=='edit')...[field(name,appText('s489')),field(address,appText('s327')),field(city,appText('s326')),field(governorate,appText('s298'))],
 if(widget.task=='price')...[field(points,appText('s490'),numeric:true),field(minutes,appText('s491'),numeric:true),field(reason,appText('s492'))],
 if(widget.task=='withdraw')...[
 Panel(child:Column(children:[Text(appText('s493')),Text(entitlement==null?'—':appText('s122', [money(entitlement!['available'])]),style:const TextStyle(fontSize:28,fontWeight:FontWeight.w800)),if(entitlement?['legacyReviewRequired']==true)Text(appText('s494'))])),const SizedBox(height:16),
 field(amount,appText('s136'),numeric:true),DropdownButtonFormField<String>(initialValue:method,items:[DropdownMenuItem(value:'INSTAPAY',child:Text(appText('s145'))),DropdownMenuItem(value:'WALLET',child:Text(appText('s146')))],onChanged:locked?null:(v)=>setState((){method=v!;confirmed=false;})),const SizedBox(height:16),field(name,appText('s495')),field(account,appText('s496')),
 ],
 CheckboxListTile(value:confirmed,onChanged:locked?null:(v)=>setState(()=>confirmed=v==true),title:Text(appText('s497'))),
 ActionButton(widget.task=='withdraw'?appText('s498'):appText('s499'),busy:busy,onPressed:locked||!confirmed||(widget.task=='withdraw'&&(entitlement==null||entitlement!['available']=='0'))?null:submit),
 if(widget.api.pending!=null)PortalNote(appText('s161')),
 if(widget.task=='withdraw')TextButton(onPressed:()=>open(context,Screen(title:appText('s500'),child:PagedRecords(api:widget.api,path:'$path/withdrawals?branchId=${widget.branch['id']}',item:(r)=>Panel(child:Column(children:[Text(appText('s122', [money(r['amountPiasters'])])),StatusPill('${r['status']}'),Reference('${r['id']}')]))))),child:Text(appText('s501'))),
 ]));
 }
}
