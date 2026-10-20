import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
const delegationRights = {
 'MANAGE_CASHIERS':'تعيين الكاشير وإيقاف تعيينه',
 'EDIT_BRANCH':'تعديل بيانات الفرع',
 'REQUEST_PRICING':'طلب تعديل سعر الزيارة',
 'REQUEST_WITHDRAWAL':'طلب سحب مستحقات الفرع',
 'TRANSFER_STOCK':'تحويل نقاط الأرصدة المسموح بها',
};
class StaffDelegation extends StatefulWidget {
 final ApiClient api;final String gymId,userId,branchId,name;
 const StaffDelegation({super.key,required this.api,required this.gymId,required this.userId,required this.branchId,required this.name});
 @override State<StaffDelegation> createState()=>_StaffDelegationState();
}
class _StaffDelegationState extends State<StaffDelegation>{
 List<Json>? grants;Set<String> rights={};bool gymScope=false,full=false,active=true,busy=false;Object? error;bool saved=false;
 Json? get current=>grants?.where((g)=>g['userId']==widget.userId&&g['branchId']==(gymScope?null:widget.branchId)).firstOrNull;
 @override void initState(){super.initState();load();}
 void select(){final c=current;rights=Set<String>.from(c?['permissions']??[]);full=c?['fullAccess']==true;active=c?['active']!=false;saved=false;}
 Future<void> load()async{try{final r=await widget.api.request('gyms/${widget.gymId}/delegations');if(mounted)setState((){grants=rows(r);select();});}catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> save()async{if(busy||grants==null)return;setState((){busy=true;error=null;});try{await widget.api.request('gyms/${widget.gymId}/delegations',method:'PUT',body:{'userId':widget.userId,'branchId':gymScope?null:widget.branchId,'permissions':rights.toList(),'fullAccess':full,'active':active,'expectedVersion':current?['version']??0});await load();if(mounted)setState(()=>saved=true);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context)=>Screen(title:'تفويض ${widget.name}',child:ListView(padding:const EdgeInsets.all(20),children:[
 const Text('كل عملية بتتسجل باسم المدير. التفويض لا ينقل ملكية الجيم ولا يسمح بمنح الصلاحيات لغيره.'),const SizedBox(height:20),ErrorNote(error,retry:load),
 if(grants==null&&error==null)const Center(child:CircularProgressIndicator()),
 if(grants!=null)...[
 DropdownButtonFormField<bool>(initialValue:gymScope,decoration:const InputDecoration(labelText:'نطاق التفويض'),items:const[DropdownMenuItem(value:false,child:Text('هذا الفرع فقط')),DropdownMenuItem(value:true,child:Text('الجيم وكل فروعه'))],onChanged:busy?null:(v)=>setState((){gymScope=v!;select();})),
 SwitchListTile(title:const Text('التفويض مفعّل'),value:active,onChanged:busy?null:(v)=>setState(()=>active=v)),
 CheckboxListTile(title:Text(gymScope?'مدير مفوّض بكل صلاحيات الجيم':'كل الصلاحيات الإضافية للفرع'),value:full,onChanged:busy?null:(v)=>setState(()=>full=v==true)),
 if(!full)for(final r in delegationRights.entries)CheckboxListTile(title:Text(r.value),value:rights.contains(r.key),onChanged:busy?null:(v)=>setState((){if(v==true){rights.add(r.key);}else{rights.remove(r.key);}})),
 const SizedBox(height:16),const Text('السحب محصور في نصيب الفرع المتاح. تحويل النقاط يحتاج صلاحية على المصدر والوجهة؛ رصيد صاحب الجيم يحتاج تفويضًا للجيم.'),const SizedBox(height:16),
 if(saved)const Text('تم حفظ الصلاحيات',style:TextStyle(color:green)),ActionButton('حفظ الصلاحيات',busy:busy,onPressed:save),
 ],
 ]));
}
