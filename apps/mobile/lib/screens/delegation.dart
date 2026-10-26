import '../l10n/language.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
Map<String, String> get delegationRights => {
 'MANAGE_CASHIERS':appText('s247'),
 'EDIT_BRANCH':appText('s248'),
 'REQUEST_PRICING':appText('s249'),
 'REQUEST_WITHDRAWAL':appText('s250'),
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
 void select(){final c=current;rights=Set<String>.from(c?['permissions']??[]).where(delegationRights.containsKey).toSet();full=c?['fullAccess']==true;active=c?['active']!=false;saved=false;}
 Future<void> load()async{try{final r=await widget.api.request('gyms/${widget.gymId}/delegations');if(mounted)setState((){grants=rows(r);select();});}catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> save()async{if(busy||grants==null)return;setState((){busy=true;error=null;});try{await widget.api.request('gyms/${widget.gymId}/delegations',method:'PUT',body:{'userId':widget.userId,'branchId':gymScope?null:widget.branchId,'permissions':rights.toList(),'fullAccess':full,'active':active,'expectedVersion':current?['version']??0});await load();if(mounted)setState(()=>saved=true);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s251', [widget.name]),child:ListView(padding:const EdgeInsets.all(20),children:[
 Text(appText('s252')),const SizedBox(height:20),ErrorNote(error,retry:load),
 if(grants==null&&error==null)const Center(child:CircularProgressIndicator()),
 if(grants!=null)...[
 DropdownButtonFormField<bool>(initialValue:gymScope,decoration:InputDecoration(labelText:appText('s253')),items:const[DropdownMenuItem(value:false,child:Text(appText('s254'))),DropdownMenuItem(value:true,child:Text(appText('s255')))],onChanged:busy?null:(v)=>setState((){gymScope=v!;select();})),
 SwitchListTile(title:Text(appText('s256')),value:active,onChanged:busy?null:(v)=>setState(()=>active=v)),
 CheckboxListTile(title:Text(gymScope?appText('s257'):appText('s258')),value:full,onChanged:busy?null:(v)=>setState(()=>full=v==true)),
 if(!full)for(final r in delegationRights.entries)CheckboxListTile(title:Text(r.value),value:rights.contains(r.key),onChanged:busy?null:(v)=>setState((){if(v==true){rights.add(r.key);}else{rights.remove(r.key);}})),
 const SizedBox(height:16),Text(appText('s259')),const SizedBox(height:16),
 if(saved)Text(appText('s260'),style:TextStyle(color:green)),ActionButton(appText('s261'),busy:busy,onPressed:save),
 ],
 ])); }
}
