import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'bookings.dart';

Json bookingAllocation(String kind,int percent) {
 if(percent<0||percent>100)throw const ApiFailure('INVALID_INPUT');
 return switch(kind){
  'TRAINEE'=>{'traineeBps':10000,'gymBps':0,'platformBps':0},
  'GYM'=>{'traineeBps':0,'gymBps':10000,'platformBps':0},
  'TRAINEE_GYM'=>{'traineeBps':percent*100,'gymBps':10000-percent*100,'platformBps':0},
  _=>{'traineeBps':0,'gymBps':percent*100,'platformBps':10000-percent*100},
 };
}
class _SplitFields extends StatelessWidget {
 final String kind;
 final ValueChanged<String> onKind;
 final TextEditingController percent;
 final bool disabled;
 const _SplitFields({super.key,required this.kind,required this.onKind,required this.percent,required this.disabled});
 @override Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
  DropdownButtonFormField<String>(isExpanded:true,initialValue:kind,decoration:const InputDecoration(labelText:'مصير النقاط'),items:const [
   DropdownMenuItem(value:'TRAINEE',child:Text('إرجاع بالكامل للمتدرب')),
   DropdownMenuItem(value:'GYM',child:Text('بالكامل للجيم')),
   DropdownMenuItem(value:'TRAINEE_GYM',child:Text('المتدرب والجيم')),
   DropdownMenuItem(value:'GYM_PLATFORM',child:Text('الجيم والمنصة')),
  ],onChanged:disabled?null:(v){if(v!=null)onKind(v);}),
  if(kind.contains('_'))...[
   const SizedBox(height:12),
   TextField(controller:percent,enabled:!disabled,keyboardType:TextInputType.number,decoration:InputDecoration(labelText:kind=='TRAINEE_GYM'?'نسبة المتدرب %':'نسبة الجيم %',helperText:kind=='TRAINEE_GYM'?'الباقي للجيم':'الباقي للمنصة')),
  ],
 ]);
}
class BookingAdminScreen extends StatefulWidget {
 final ApiClient api;
 const BookingAdminScreen({super.key,required this.api});
 @override State<BookingAdminScreen> createState()=>_BookingAdminScreenState();
}
class _BookingAdminScreenState extends State<BookingAdminScreen>{
 Json? current;
 List<Json> items=[];
 final grace=TextEditingController(text:'60'),percent=TextEditingController(text:'50');
 String mode='MANUAL',kind='TRAINEE';
 bool loading=true,busy=false,loaded=false;
 Object? error;
 String success='';
 @override void initState(){super.initState();load();}
 @override void dispose(){grace.dispose();percent.dispose();super.dispose();}
 Future<void> load()async{
  setState((){loading=true;error=null;});
  try{
   final values=await Future.wait([widget.api.request('admin/booking-policy'),widget.api.request('admin/bookings/review')]);
   if(!mounted)return;
   setState((){
    current=values[0]['policy']==null?null:Map<String,dynamic>.from(values[0]['policy']);items=rows(values[1]);loaded=true;
    if(current!=null){
     final p=Map<String,dynamic>.from(current!['policy']);
     grace.text='${p['graceMinutes']}';mode=p['mode'];
     if(mode=='AUTOMATIC'){
      final a=Map<String,dynamic>.from(p['allocation']);
      if(a['traineeBps']==10000){kind='TRAINEE';}
      else if(a['gymBps']==10000){kind='GYM';}
      else if(a['platformBps']==0){kind='TRAINEE_GYM';percent.text='${(a['traineeBps'] as num)/100}';}
      else{kind='GYM_PLATFORM';percent.text='${(a['gymBps'] as num)/100}';}
     }
    }
   });
  }catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> save()async{
  if(busy||!loaded)return;
  setState((){busy=true;error=null;success='';});
  try{
   final minutes=int.tryParse(digits(grace.text));
   final ratio=num.tryParse(digits(percent.text));
   if(minutes==null||minutes<0||minutes>10080||mode=='AUTOMATIC'&&kind.contains('_')&&(ratio==null||ratio!=ratio.round()||ratio<0||ratio>100))throw const ApiFailure('INVALID_INPUT');
   final policy=<String,dynamic>{'mode':mode,'graceMinutes':minutes,if(mode=='AUTOMATIC')'allocation':bookingAllocation(kind,ratio?.toInt()??50)};
   await widget.api.request('admin/booking-policy',method:'POST',body:{'expectedVersion':current?['version']??0,'policy':policy});
   await load();if(mounted){setState(()=>success='تم حفظ سياسة الحجز للحجوزات الجديدة.');ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(success)));}
  }catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Scaffold(
  appBar:AppBar(title:const Text('الحجوزات وسياسة الحضور'),actions:[
   IconButton(tooltip:'لوحة الويب',onPressed:()=>launchUrl(Uri.parse('https://gym-network-platform.vercel.app/'),mode:LaunchMode.externalApplication),icon:const Icon(Icons.open_in_browser_rounded)),
   IconButton(tooltip:'تسجيل الخروج',onPressed:busy?null:()=>widget.api.logout(),icon:const Icon(Icons.logout_rounded)),
  ]),
  body:SafeArea(child:RefreshIndicator(onRefresh:load,child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.all(20),children:[
   const Text('السياسة للحجوزات الجديدة؛ كل حجز يحتفظ بسياسته.',style:TextStyle(color:muted)),
   ErrorNote(error,retry:load),
   if(success.isNotEmpty)Padding(padding:const EdgeInsets.all(12),child:Text(success,style:const TextStyle(color:green))),
   if(loading)const LinearProgressIndicator(),
   if(loaded)...[
    const SectionTitle('سياسة الحجز وعدم الحضور'),
    Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     TextField(controller:grace,enabled:!busy&&!loading,keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'مهلة السماح بعد الموعد — بالدقائق')),
     const SizedBox(height:12),
     const Text('الإلغاء خلال المهلة يرجّع النقاط بالكامل. بعد المهلة:'),
     const SizedBox(height:12),
     DropdownButtonFormField<String>(isExpanded:true,key:ValueKey(mode),initialValue:mode,decoration:const InputDecoration(labelText:'طريقة اتخاذ القرار'),items:const [
      DropdownMenuItem(value:'MANUAL',child:Text('مراجعة يدوية من صاحب المنصة')),
      DropdownMenuItem(value:'AUTOMATIC',child:Text('توزيع تلقائي بنسب ثابتة')),
     ],onChanged:busy||loading?null:(v){if(v!=null)setState(()=>mode=v);}),
     const SizedBox(height:12),
     if(mode=='AUTOMATIC')_SplitFields(key:ValueKey(kind),kind:kind,onKind:(v)=>setState(()=>kind=v),percent:percent,disabled:busy||loading)
     else const Text('النقاط تفضل معلقة حتى تراجع سبب عدم الحضور وتقرر توزيعها.'),
     const SizedBox(height:16),ActionButton('حفظ سياسة الحجز',busy:busy,onPressed:loading?null:save),
    ])),
    const SectionTitle('حجوزات بانتظار القرار'),
    if(items.isEmpty)const EmptyState('مفيش حجوزات محتاجة قرار'),
    for(final b in items)Padding(padding:const EdgeInsets.only(bottom:14),child:Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text('${b['traineeName']??'متدرب'} · ${b['branch']?['gym']?['name']??'زيارة'}',style:const TextStyle(fontWeight:FontWeight.w800)),
     Text('${b['branch']?['name']??''}'),
     Fact('موعد الزيارة',shortDate(b['scheduledAt'])),Fact('النقاط المعلقة','${b['points']} نقطة'),
     Text('سبب عدم الحضور: ${b['absenceReason']??'لم يُرسل سبب بعد.'}'),
     const SizedBox(height:12),ActionButton('مراجعة واتخاذ قرار',onPressed:busy?null:()async{await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>BookingDecisionScreen(api:widget.api,booking:b)));if(mounted)await load();}),
    ]))),
   ],
  ]))),
 );
}
class BookingDecisionScreen extends StatefulWidget {
 final ApiClient api;
 final Json booking;
 const BookingDecisionScreen({super.key,required this.api,required this.booking});
 @override State<BookingDecisionScreen> createState()=>_BookingDecisionScreenState();
}
class _BookingDecisionScreenState extends State<BookingDecisionScreen>{
 String kind='TRAINEE';
 final percent=TextEditingController(text:'50'),reason=TextEditingController();
 bool busy=false;
 Object? error;
 @override void dispose(){percent.dispose();reason.dispose();super.dispose();}
 Future<void> decide()async{
  if(busy)return;
  setState((){busy=true;error=null;});
  try{
   final ratio=num.tryParse(digits(percent.text));
   if(reason.text.trim().isEmpty||kind.contains('_')&&(ratio==null||ratio!=ratio.round()||ratio<0||ratio>100))throw const ApiFailure('INVALID_INPUT');
   await widget.api.request('admin/bookings/${widget.booking['id']}/decision',method:'POST',body:{'reason':reason.text.trim(),'allocation':bookingAllocation(kind,ratio?.toInt()??50)});
   if(mounted)Navigator.pop(context);
  }catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context)=>Screen(title:'قرار عدم الحضور',child:ListView(padding:const EdgeInsets.all(20),children:[
  Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text('${widget.booking['traineeName']??'متدرب'} · ${widget.booking['points']} نقطة'),
   Text('السبب: ${widget.booking['absenceReason']??'لم يُرسل سبب بعد.'}'),
   const SizedBox(height:12),Text(policySummary(Map<String,dynamic>.from(widget.booking['policySnapshot']))),
   const SizedBox(height:16),_SplitFields(kind:kind,onKind:(v)=>setState(()=>kind=v),percent:percent,disabled:busy),
   const SizedBox(height:12),TextField(controller:reason,enabled:!busy,maxLength:1000,decoration:const InputDecoration(labelText:'سبب القرار')),
   ErrorNote(error),ActionButton('تأكيد القرار وتوزيع النقاط',busy:busy,onPressed:decide),
  ])),
 ]));
}
