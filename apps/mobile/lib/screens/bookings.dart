import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../core/api.dart';
import '../core/ui.dart';

String minuteLabel(int value) => '${(value~/60).toString().padLeft(2,'0')}:${(value%60).toString().padLeft(2,'0')}';

String bookingStatus(dynamic status) => const {
 'RESERVED':'حجز مؤكد · نقاط محجوزة',
 'PENDING_REVIEW':'بانتظار قرار الإدارة',
 'ATTENDED':'تم الحضور',
 'CANCELLED':'تم الإلغاء ورد النقاط',
 'RESOLVED':'تمت تسوية عدم الحضور',
}['$status'] ?? '$status';
String policySummary(Json policy) {
 if(policy['mode']=='MANUAL') return 'بعد المهلة تظل النقاط معلقة لحين مراجعة الإدارة لسبب عدم الحضور وتحديد توزيعها.';
 final a=Map<String,dynamic>.from(policy['allocation']);
 final parts=<String>[];
 for(final pair in [('traineeBps','للمتدرب'),('gymBps','للجيم'),('platformBps','للمنصة')]){
  final n=(a[pair.$1] as num)/100;
  if(n>0)parts.add('${n.toString().replaceAll(RegExp(r"\.0$"),"")}% ${pair.$2}');
 }
 return 'بعد المهلة: ${parts.join(' · ')}.';
}
String? bookingToken(String input) {
 final raw=input.trim();
 if(!raw.startsWith('gymbooking:'))return null;
 final value=raw.substring(11);
 return RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(value)?value:null;
}
bool bookingWindow(Json b,DateTime now) => b['status']=='RESERVED' &&
 now.isBefore(DateTime.parse(b['deadlineAt']));

class CreateBookingScreen extends StatefulWidget {
 final ApiClient api;
 final Json branch;
 const CreateBookingScreen({super.key,required this.api,required this.branch});
 @override State<CreateBookingScreen> createState()=>_CreateBookingScreenState();
}
class _CreateBookingScreenState extends State<CreateBookingScreen>{
 Json? policy,result,frozenBody,hours;
 List<Json> services=[];
 final selected=<String>{};
 bool serviceBooking=false,startNow=false;
 int get points => serviceBooking?services.where((s)=>selected.contains(s['id'])).fold(0,(sum,s)=>sum+(s['points'] as int)):(widget.branch['visitPricePoints'] as num? ?? 0).toInt();
 int get minutes => serviceBooking?services.where((s)=>selected.contains(s['id'])).fold(0,(sum,s)=>sum+(s['durationMinutes'] as int)):(widget.branch['sessionMinutes'] as num? ?? 0).toInt();
 bool get ready => !serviceBooking || (selected.isNotEmpty && hours?['openMinute']!=null && points<=1000000 && minutes<=1440);
 DateTime? when;
 bool loading=true,busy=false,accepted=false;
 Object? error;
 @override void initState(){super.initState();load();}
 Future<void> load() async {
  setState((){loading=true;error=null;});
  try{
   final values=await Future.wait([widget.api.request('booking-policy'),widget.api.request('directory/branches/${widget.branch['id']}/services')]);
   final d=values[0],catalog=values[1];
   if(mounted)setState((){
    policy=d['policy']==null?null:Map<String,dynamic>.from(d['policy']);
    services=rows(catalog);serviceBooking=catalog['serviceBooking']==true;
    hours=catalog['hours']==null?null:Map<String,dynamic>.from(catalog['hours']);
   });
  }
  catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>loading=false);}
 }
 Future<void> choose() async {
  final now=DateTime.now();
  final day=await showDatePicker(context:context,initialDate:when??now,firstDate:DateTime(now.year,now.month,now.day),lastDate:now.add(const Duration(days:365)));
  if(day==null||!mounted)return;
  final time=await showTimePicker(context:context,initialTime:when==null?TimeOfDay.fromDateTime(now.add(const Duration(hours:1))):TimeOfDay.fromDateTime(when!));
  if(time!=null&&mounted)setState((){when=DateTime(day.year,day.month,day.day,time.hour,time.minute);accepted=false;});
 }
 Future<void> book() async {
  if(busy||policy==null||(!startNow&&when==null)||!accepted||!ready)return;
  if(frozenBody==null&&!startNow&&when!.isBefore(DateTime.now())){setState(()=>error=const ApiFailure('INVALID_INPUT'));return;}
  setState((){busy=true;error=null;});
  frozenBody??={'branchId':widget.branch['id'],if(startNow)'startNow':true else 'scheduledAt':when!.toUtc().toIso8601String(),'policyVersion':policy!['version'],
   if(serviceBooking)...{'services':[for(final s in services)if(selected.contains(s['id'])){'id':s['id'],'version':s['version']}],'hoursVersion':hours!['version']}
   else 'branchPricingVersion':widget.branch['pricingVersion']};
  try{final r=await widget.api.transact('trainee/bookings',frozenBody!);if(mounted)setState(()=>result=r);}
  catch(e){if(mounted)setState((){error=e;if(widget.api.pending==null)frozenBody=null;});}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context){
  final p=policy==null?null:Map<String,dynamic>.from(policy!['policy']);
  final locked=busy||widget.api.pending!=null;
  return Screen(title:'احجز زيارتك',child:ListView(padding:const EdgeInsets.all(20),children:[
   Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text('${widget.branch['gym']?['name']??''} · ${widget.branch['name']}',style:const TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
    Fact('إجمالي النقاط','$points نقطة',strong:true),
    Fact('إجمالي المدة','$minutes دقيقة'),
   ])),
   const SizedBox(height:16),ErrorNote(error),
   if(result!=null)...[
    const EmptyState('تم حجز زيارتك',detail:'النقاط اتحجزت للزيارة وتتحول للجيم عند مسح رمز الحضور.',icon:Icons.check_circle_rounded),
    Fact('موعد الزيارة',shortDate(result!['scheduledAt'])),
    ActionButton('عرض حجوزاتي',onPressed:()=>Navigator.pushReplacement(context,MaterialPageRoute<void>(builder:(_)=>BookingsScreen(api:widget.api)))),
   ]else if(loading)const Center(child:CircularProgressIndicator())
   else if(p==null)...[
    const EmptyState('الحجز غير متاح حاليًا',detail:'الإدارة لم تضبط سياسة الحجز بعد.'),
    ActionButton('إعادة المحاولة',onPressed:load),
   ]else...[
    TextButton(onPressed:locked?null:(){setState((){accepted=false;selected.clear();});load();},child:const Text('تحديث الخدمات والسياسة')),
    if(serviceBooking)...[
     const SectionTitle('اختار الخدمات'),
     for(final service in services)CheckboxListTile(contentPadding:EdgeInsets.zero,value:selected.contains(service['id']),
      onChanged:locked?null:(value)=>setState((){if(value==true)selected.add(service['id'] as String);else selected.remove(service['id']);accepted=false;}),
      title:Text('${service['name']}'),subtitle:Text('${service['points']} نقطة · ${service['durationMinutes']} دقيقة')),
     if(services.isEmpty)const Text('لا توجد خدمات معتمدة متاحة للحجز حاليًا.'),
     if(hours?['openMinute']==null)const Text('الفرع لم يحدد مواعيد الحجز بعد.'),
     if(hours?['openMinute']!=null)Text('يوميًا من ${minuteLabel(hours!['openMinute'] as int)} إلى ${minuteLabel(hours!['closeMinute'] as int)} · توقيت القاهرة'),
     if(points>1000000||minutes>1440)const Text('إجمالي الخدمات يتجاوز الحد المسموح لحجز واحد.'),
     const Text('مدد الخدمات متتالية في جلسة واحدة، ولازم الموعد ينتهي قبل إغلاق الفرع.'),
     SwitchListTile(contentPadding:EdgeInsets.zero,title:const Text('احجز الآن'),value:startNow,onChanged:locked?null:(v)=>setState((){startNow=v;accepted=false;})),
    ],
    if(!startNow)OutlinedButton.icon(onPressed:locked?null:choose,icon:const Icon(Icons.calendar_month_outlined),label:Text(when==null?'اختار اليوم والساعة':shortDate(when!.toIso8601String()))),
    const Text('الموعد حسب توقيت جهازك.',style:TextStyle(color:muted,fontSize:12)),
    const SizedBox(height:16),
    Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     const Text('سياسة الحجز',style:TextStyle(fontWeight:FontWeight.w800)),
     const Text('النقاط تتحجز الآن، وتتحول للجيم لما يمسح QR حجزك عند وصولك.'),
     Text('مهلة السماح: ${p['graceMinutes']} دقيقة بعد موعد الزيارة.'),
     if(when!=null&&!startNow)Text('الإلغاء ورد النقاط بالكامل حتى ${shortDate(when!.add(Duration(minutes:p['graceMinutes'] as int)).toIso8601String())}.'),
     Text(policySummary(p)),
    ])),
    CheckboxListTile(contentPadding:EdgeInsets.zero,value:accepted,onChanged:locked?null:(v)=>setState(()=>accepted=v??false),title:const Text('راجعت الموعد وسياسة الإلغاء وعدم الحضور')),
    ActionButton(widget.api.pending!=null?'إعادة نفس الحجز بأمان':'تأكيد الحجز · $points نقطة',busy:busy,onPressed:accepted&&(startNow||when!=null)&&ready?book:null),
    if(widget.api.pending!=null)const Text('نتيجة الطلب غير مؤكدة. أعد نفس الحجز بأمان قبل بدء طلب جديد.'),
   ],
  ]));
 }
}

class BookingsScreen extends StatefulWidget {
 final ApiClient api;
 final bool embedded;
 const BookingsScreen({super.key,required this.api,this.embedded=false});
 @override State<BookingsScreen> createState()=>_BookingsScreenState();
}
class _BookingsScreenState extends State<BookingsScreen>{
 Timer? timer;
 int tick=0;
 Duration offset=Duration.zero;
 Future<dynamic> load() async {final d=await widget.api.request('trainee/bookings');offset=DateTime.parse(d['serverTime']).difference(DateTime.now());return d;}
 @override void initState(){super.initState();timer=Timer.periodic(const Duration(seconds:15),(_){if(mounted)setState(()=>tick++);});}
 @override void dispose(){timer?.cancel();super.dispose();}
 @override Widget build(BuildContext context){
  final view=DataView(load:load,builder:(d,reload){
   final items=rows(d);
   return ListView(padding:const EdgeInsets.all(20),physics:const AlwaysScrollableScrollPhysics(),children:[
    Row(children:[const Expanded(child:Text('حجوزاتي',style:TextStyle(fontSize:24,fontWeight:FontWeight.w800))),IconButton(tooltip:'تحديث الحجوزات',onPressed:reload,icon:const Icon(Icons.refresh_rounded))]),
    const Text('موعدك، نقاطك، ورمز حضورك في مكان واحد.',style:TextStyle(color:muted)),
    const SizedBox(height:16),
    if(items.isEmpty)const EmptyState('لسه مفيش حجوزات',detail:'اختار جيم وحدد موعد تمرينتك من تفاصيله.'),
    for(final b in items)Padding(padding:const EdgeInsets.only(bottom:14),child:_BookingCard(key:ValueKey('${b['id']}:${b['status']}'),api:widget.api,booking:b,reload:reload,now:DateTime.now().add(offset))),
   ]);
  });
  return widget.embedded?view:Screen(title:'حجوزاتي',child:view);
 }
}
class _BookingCard extends StatefulWidget {
 final ApiClient api;
 final Json booking;
 final Future<void> Function() reload;
 final DateTime now;
 const _BookingCard({super.key,required this.api,required this.booking,required this.reload,required this.now});
 @override State<_BookingCard> createState()=>_BookingCardState();
}
class _BookingCardState extends State<_BookingCard>{
 bool busy=false;
 Object? error;
 Future<void> cancel() async {
  if(busy)return;
  String reason='';
  final now=widget.now,b=widget.booking;
  final late=!now.isBefore(DateTime.parse(b['deadlineAt']));
  final value=await showDialog<String>(context:context,builder:(c)=>AlertDialog(
   title:Text(late?'سبب عدم الحضور':'إلغاء الحجز'),
   content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
    Text(late?policySummary(Map<String,dynamic>.from(b['policySnapshot'])):'سيتم إلغاء الحجز ورد النقاط بالكامل إذا كنت داخل مهلة السماح.'),
    const SizedBox(height:12),TextField(onChanged:(v)=>reason=v,maxLength:1000,decoration:const InputDecoration(labelText:'السبب')),
   ])),
   actions:[TextButton(onPressed:()=>Navigator.pop(c),child:const Text('رجوع')),TextButton(onPressed:(){if(reason.trim().isNotEmpty)Navigator.pop(c,reason.trim());},child:Text(late?'إرسال السبب':'تأكيد الإلغاء'))],
  ));
  // Dialog route finishes its closing transition asynchronously.
  if(value==null||!mounted)return;
  setState((){busy=true;error=null;});
  try{await widget.api.request('trainee/bookings/${b['id']}/cancel',method:'POST',body:{'reason':value});await widget.reload();}
  catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context){
  final b=widget.booking,now=widget.now,late=!widget.now.isBefore(DateTime.parse(widget.booking['deadlineAt']));
  return Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text(bookingStatus(b['status']),style:const TextStyle(color:green,fontWeight:FontWeight.w700)),
   const SizedBox(height:6),Text('${b['branch']?['gym']?['name']??'زيارة محجوزة'} · ${b['branch']?['name']??''}',style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800)),
   Fact('موعد الزيارة',shortDate(b['scheduledAt'])),Fact('النقاط','${b['points']} نقطة',strong:true),
   for(final service in (b['serviceSnapshots'] as List? ?? []))Text('${service['name']} · ${service['points']} نقطة · ${service['durationMinutes']} دقيقة'),
   Fact('نهاية مهلة السماح',shortDate(b['deadlineAt'])),
   ExpansionTile(tilePadding:EdgeInsets.zero,title:const Text('سياسة هذا الحجز'),children:[Text(policySummary(Map<String,dynamic>.from(b['policySnapshot'])))]),
   if(b['absenceReason']!=null)Text('سبب عدم الحضور: ${b['absenceReason']}'),
   if(b['decisionReason']!=null)Text('القرار: ${b['decisionReason']}'),
   if(b['traineePoints']!=null)Text('لك: ${b['traineePoints']} · للجيم: ${b['gymPoints']} · للمنصة: ${b['platformPoints']} نقطة'),
   ErrorNote(error),
   if(bookingWindow(b,now))ActionButton('اعرض QR الحجز',icon:Icons.qr_code_2_rounded,onPressed:()async{await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>BookingQrScreen(api:widget.api,booking:b)));if(mounted)await widget.reload();}),
   if(b['status']=='RESERVED'&&!late)const Text('رمز الحجز متاح الآن، وتقدر تدخل قبل موعدك.',style:TextStyle(color:muted,fontSize:12)),
   if(['RESERVED','PENDING_REVIEW'].contains(b['status']))TextButton(onPressed:busy?null:cancel,child:Text(busy?'جاري الإرسال…':late||b['status']=='PENDING_REVIEW'?'إضافة سبب عدم الحضور':'إلغاء الحجز')),
  ]));
 }
}

class BookingQrScreen extends StatefulWidget {
 final ApiClient api;
 final Json booking;
 const BookingQrScreen({super.key,required this.api,required this.booking});
 @override State<BookingQrScreen> createState()=>_BookingQrScreenState();
}
class _BookingQrScreenState extends State<BookingQrScreen> with WidgetsBindingObserver {
 Json? qr;
 Timer? timer;
 Duration offset=Duration.zero;
 bool busy=false;
 Object? error;
 @override void initState(){super.initState();WidgetsBinding.instance.addObserver(this);renew();timer=Timer.periodic(const Duration(seconds:1),(_){if(mounted)setState((){});});}
 @override void dispose(){timer?.cancel();WidgetsBinding.instance.removeObserver(this);super.dispose();}
 @override void didChangeAppLifecycleState(AppLifecycleState state){if(state!=AppLifecycleState.resumed&&mounted)setState(()=>qr=null);}
 Future<void> renew() async {
  if(busy)return;
  setState((){busy=true;qr=null;error=null;});
  try{final d=Map<String,dynamic>.from(await widget.api.request('trainee/bookings/${widget.booking['id']}/qr',method:'POST'));if(mounted)setState((){qr=d;offset=DateTime.parse(d['serverTime']).difference(DateTime.now());});}
  catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context){
  final remaining=qr==null?0:DateTime.parse(qr!['expiresAt']).difference(DateTime.now().add(offset)).inSeconds;
  return Screen(title:'QR حجز الزيارة',child:ListView(padding:const EdgeInsets.all(20),children:[
   Panel(child:Column(children:[
    Text(shortDate(widget.booking['scheduledAt'])),Text('${widget.booking['points']} نقطة محجوزة'),
    const SizedBox(height:20),ErrorNote(error),
    if(busy)const CircularProgressIndicator()
    else if(qr!=null&&remaining>0)Container(color:Colors.white,padding:const EdgeInsets.all(14),child:QrImageView(data:'gymbooking:${qr!['token']}',size:230,backgroundColor:Colors.white))
    else const Icon(Icons.qr_code_2_rounded,size:130,color:muted),
    const SizedBox(height:12),Text(remaining>0?'صالح لمدة $remaining ثانية':'حدّث الرمز عند وصولك'),
    const SizedBox(height:12),ActionButton('تحديث الرمز',busy:busy,onPressed:renew),
    if(qr!=null&&remaining>0)TextButton(onPressed:()async{await Clipboard.setData(ClipboardData(text:'gymbooking:${qr!['token']}'));},child:const Text('نسخ رمز الحجز')),
    const Text('اعرضه لموظف الجيم وأنت قدامه. المسح يؤكد حضورك ويحوّل النقاط للجيم.',textAlign:TextAlign.center),
   ])),
  ]));
 }
}

class ScanBookingScreen extends StatefulWidget {
 final ApiClient api;
 final Json branch;
 const ScanBookingScreen({super.key,required this.api,required this.branch});
 @override State<ScanBookingScreen> createState()=>_ScanBookingScreenState();
}
class _ScanBookingScreenState extends State<ScanBookingScreen>{
 bool busy=false;
 Json? result;
 Object? error;
 final text=TextEditingController();
 @override void dispose(){text.dispose();super.dispose();}
 Future<void> submit(String raw)async{
  if(busy)return;
  final token=bookingToken(raw);
  if(token==null){setState(()=>error=const ApiFailure('QR_INVALID'));return;}
  setState((){busy=true;error=null;result=null;});
  try{final d=await widget.api.request('operations/branches/${widget.branch['id']}/bookings/scan',method:'POST',body:{'token':token});if(mounted)setState(()=>result=Map<String,dynamic>.from(d));}
  catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> scan()async{
  final value=await Navigator.push<String>(context,MaterialPageRoute(builder:(_)=>const _BookingCamera()));
  if(value!=null&&mounted)await submit(value);
 }
 @override Widget build(BuildContext context)=>Screen(title:'تأكيد حضور حجز',child:ListView(padding:const EdgeInsets.all(20),children:[
  Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text('${widget.branch['name']}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
   const Text('المتدرب واقف قدامك؟ امسح QR حجزه لتأكيد حضوره وتحويل النقاط المحجوزة للجيم.'),
   ErrorNote(error),
   if(error!=null)const Text('لو الاتصال انقطع، راجع سجل الزيارات قبل إعادة المسح.',style:TextStyle(color:muted,fontSize:12)),
   if(result!=null)...[const EmptyState('تم تأكيد الحضور',icon:Icons.check_circle_rounded),Fact('النقاط المحولة للجيم','${result!['points']} نقطة')],
   const SizedBox(height:16),ActionButton('امسح QR الحجز',icon:Icons.qr_code_scanner_rounded,busy:busy,onPressed:scan),
   ExpansionTile(tilePadding:EdgeInsets.zero,title:const Text('لصق رمز الحجز بدل الكاميرا'),children:[
    TextField(controller:text,textDirection:TextDirection.ltr,enabled:!busy,decoration:const InputDecoration(labelText:'رمز الحجز')),
    ActionButton('تأكيد الحضور بالرمز',busy:busy,onPressed:()=>submit(text.text)),
   ]),
  ])),
 ]));
}
class _BookingCamera extends StatefulWidget {
 const _BookingCamera();
 @override State<_BookingCamera> createState()=>_BookingCameraState();
}
class _BookingCameraState extends State<_BookingCamera>{
 bool done=false;
 @override Widget build(BuildContext context)=>Screen(title:'مسح QR الحجز',child:Column(children:[
  const Padding(padding:EdgeInsets.all(20),child:Text('اطلب QR الحجز من «حجوزاتي» عند المتدرب.')),
  Expanded(child:MobileScanner(onDetect:(capture){
   if(done)return;
   for(final b in capture.barcodes){final raw=b.rawValue;if(raw!=null&&bookingToken(raw)!=null){done=true;Navigator.pop(context,raw);break;}}
  })),
 ]));
}
