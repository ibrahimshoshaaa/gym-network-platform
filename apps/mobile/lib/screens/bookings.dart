import '../l10n/language.dart';
import 'dart:async';
import 'branch_entry.dart';
import 'branch_services.dart' show serviceLabel, serviceHours;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../core/api.dart';
import '../core/ui.dart';

String minuteLabel(int value) => '${(value~/60).toString().padLeft(2,'0')}:${(value%60).toString().padLeft(2,'0')}';

String bookingStatus(dynamic status) => {
 'RESERVED':appText('s171'),
 'PENDING_REVIEW':appText('s172'),
 'ATTENDED':appText('s173'),
 'CANCELLED':appText('s174'),
 'RESOLVED':appText('s175'),
}['$status'] ?? '$status';
String policySummary(Json policy) {
 if(policy['mode']=='MANUAL') return appText('s176');
 final a=Map<String,dynamic>.from(policy['allocation']);
 final parts=<String>[];
 for(final pair in [('traineeBps',appText('s177')),('gymBps',appText('s178')),('platformBps',appText('s179'))]){
  final n=(a[pair.$1] as num)/100;
  if(n>0)parts.add('${n.toString().replaceAll(RegExp(r"\.0$"),"")}% ${pair.$2}');
 }
 return appText('s180', [parts.join(' · ')]);
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
 final String? initialServiceId;
 const CreateBookingScreen({super.key,required this.api,required this.branch,this.initialServiceId});
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
    services=rows(catalog);if(selected.isEmpty&&widget.initialServiceId!=null&&services.any((s)=>s['id']==widget.initialServiceId))selected.add(widget.initialServiceId!);serviceBooking=catalog['serviceBooking']==true;
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
    AppLanguage.watch(context);
  final p=policy==null?null:Map<String,dynamic>.from(policy!['policy']);
  final locked=busy||widget.api.pending!=null;
  return Screen(title:appText('s181'),child:ListView(padding:const EdgeInsets.all(20),children:[
   Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text('${widget.branch['gym']?['name']??''} · ${widget.branch['name']}',style:const TextStyle(fontSize:18,fontWeight:FontWeight.w800)),
    Fact(appText('s182'),appText('s120', [points]),strong:true),
    Fact(appText('s183'),appText('s184', [minutes])),
   ])),
   const SizedBox(height:16),ErrorNote(error),
   if(result!=null)...[
    EmptyState(appText('s185'),detail:appText('s186'),icon:Icons.check_circle_rounded),
    Fact(appText('s187'),shortDate(result!['scheduledAt'])),
    ActionButton(appText('s188'),onPressed:()=>Navigator.pushReplacement(context,MaterialPageRoute<void>(builder:(_)=>BookingsScreen(api:widget.api)))),
   ]else if(loading)const Center(child:CircularProgressIndicator())
   else if(p==null)...[
    EmptyState(appText('s189'),detail:appText('s190')),
    ActionButton(appText('s98'),onPressed:load),
   ]else...[
    TextButton(onPressed:locked?null:(){setState((){accepted=false;selected.clear();});load();},child:Text(appText('s191'))),
    if(serviceBooking)...[
     SectionTitle(appText('s192')),
     for(final service in services)CheckboxListTile(contentPadding:EdgeInsets.zero,value:selected.contains(service['id']),
      onChanged:locked?null:(value)=>setState((){if(value==true)selected.add(service['id'] as String);else selected.remove(service['id']);accepted=false;}),
      title:Text(serviceLabel(service)),subtitle:Text('${appText('s193', [service['points'], service['durationMinutes']])}${service['openMinute']==null?'':' · ${serviceHours(service)}'}')),
     if(services.isEmpty)Text(appText('s194')),
     if(hours?['openMinute']==null)Text(appText('s43')),
     if(hours?['openMinute']!=null)Text(appText('s195', [minuteLabel(hours!['openMinute'] as int), minuteLabel(hours!['closeMinute'] as int)])),
     if(points>1000000||minutes>1440)Text(appText('s196')),
     Text(appText('s197')),
     SwitchListTile(contentPadding:EdgeInsets.zero,title:Text(appText('s198')),value:startNow,onChanged:locked?null:(v)=>setState((){startNow=v;accepted=false;})),
    ],
    if(!startNow)OutlinedButton.icon(onPressed:locked?null:choose,icon:const Icon(Icons.calendar_month_outlined),label:Text(when==null?appText('s199'):shortDate(when!.toIso8601String()))),
    Text(appText('s200'),style:TextStyle(color:muted,fontSize:12)),
    const SizedBox(height:16),
    Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Text(appText('s201'),style:TextStyle(fontWeight:FontWeight.w800)),
     Text(appText('s202')),
     Text(appText('s203', [p['graceMinutes']])),
     if(when!=null&&!startNow)Text(appText('s204', [shortDate(when!.add(Duration(minutes:p['graceMinutes'] as int)).toIso8601String())])),
     Text(policySummary(p)),
    ])),
    CheckboxListTile(contentPadding:EdgeInsets.zero,value:accepted,onChanged:locked?null:(v)=>setState(()=>accepted=v??false),title:Text(appText('s205'))),
    ActionButton(widget.api.pending!=null?appText('s206'):appText('s207', [points]),busy:busy,onPressed:accepted&&(startNow||when!=null)&&ready?book:null),
    if(widget.api.pending!=null)Text(appText('s208')),
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
    AppLanguage.watch(context);
  final view=DataView(load:load,builder:(d,reload){
   final items=rows(d);
   return ListView(padding:const EdgeInsets.all(20),physics:const AlwaysScrollableScrollPhysics(),children:[
    Row(children:[Expanded(child:Text(appText('s24'),style:TextStyle(fontSize:24,fontWeight:FontWeight.w800))),IconButton(tooltip:appText('s209'),onPressed:reload,icon:const Icon(Icons.refresh_rounded))]),
    Text(appText('s210'),style:TextStyle(color:muted)),
    const SizedBox(height:16),
    if(items.isEmpty)EmptyState(appText('s211'),detail:appText('s212')),
    for(final b in items)Padding(padding:const EdgeInsets.only(bottom:14),child:_BookingCard(key:ValueKey('${b['id']}:${b['status']}'),api:widget.api,booking:b,reload:reload,now:DateTime.now().add(offset))),
   ]);
  });
  return widget.embedded?view:Screen(title:appText('s24'),child:view);
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
  final value=await showDialog<String>(context:context,builder:(c){ AppLanguage.watch(c); return AlertDialog(
   title:Text(late?appText('s213'):appText('s214')),
   content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,children:[
    Text(late?policySummary(Map<String,dynamic>.from(b['policySnapshot'])):appText('s215')),
    const SizedBox(height:12),TextField(onChanged:(v)=>reason=v,maxLength:1000,decoration:InputDecoration(labelText:appText('s216'))),
   ])),
   actions:[TextButton(onPressed:()=>Navigator.pop(c),child:Text(appText('s217'))),TextButton(onPressed:(){if(reason.trim().isNotEmpty)Navigator.pop(c,reason.trim());},child:Text(late?appText('s218'):appText('s219')))],
  ); });
  // Dialog route finishes its closing transition asynchronously.
  if(value==null||!mounted)return;
  setState((){busy=true;error=null;});
  try{await widget.api.request('trainee/bookings/${b['id']}/cancel',method:'POST',body:{'reason':value});await widget.reload();}
  catch(e){if(mounted)setState(()=>error=e);}
  finally{if(mounted)setState(()=>busy=false);}
 }
 @override Widget build(BuildContext context){
    AppLanguage.watch(context);
  final b=widget.booking,now=widget.now,late=!widget.now.isBefore(DateTime.parse(widget.booking['deadlineAt']));
  return Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text(bookingStatus(b['status']),style:const TextStyle(color:green,fontWeight:FontWeight.w700)),
   const SizedBox(height:6),Text('${b['branch']?['gym']?['name']??appText('s1002')} · ${b['branch']?['name']??''}',style:const TextStyle(fontSize:17,fontWeight:FontWeight.w800)),
   Fact(appText('s187'),shortDate(b['scheduledAt'])),Fact(appText('s119'),appText('s120', [b['points']]),strong:true),
   for(final service in (b['serviceSnapshots'] as List? ?? []))Text(appText('s220', [service['name'], service['points'], service['durationMinutes']])),
   Fact(appText('s221'),shortDate(b['deadlineAt'])),
   ExpansionTile(tilePadding:EdgeInsets.zero,title:Text(appText('s222')),children:[Text(policySummary(Map<String,dynamic>.from(b['policySnapshot'])))]),
   if(b['absenceReason']!=null)Text(appText('s223', [b['absenceReason']])),
   if(b['decisionReason']!=null)Text(appText('s224', [b['decisionReason']])),
   if(b['traineePoints']!=null)Text(appText('s225', [b['traineePoints'], b['gymPoints'], b['platformPoints']])),
   ErrorNote(error),
   if(bookingWindow(b,now))ActionButton(appText('s226'),icon:Icons.qr_code_scanner_rounded,onPressed:()async{await Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>BranchCheckInScreen(api:widget.api,booking:b)));if(mounted)await widget.reload();}),
   if(b['status']=='RESERVED'&&!late)Text(appText('s227'),style:TextStyle(color:muted,fontSize:12)),
   if(['RESERVED','PENDING_REVIEW'].contains(b['status']))TextButton(onPressed:busy?null:cancel,child:Text(busy?appText('s228'):late||b['status']=='PENDING_REVIEW'?appText('s229'):appText('s214'))),
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
    AppLanguage.watch(context);
  final remaining=qr==null?0:DateTime.parse(qr!['expiresAt']).difference(DateTime.now().add(offset)).inSeconds;
  return Screen(title:appText('s230'),child:ListView(padding:const EdgeInsets.all(20),children:[
   Panel(child:Column(children:[
    Text(shortDate(widget.booking['scheduledAt'])),Text(appText('s231', [widget.booking['points']])),
    const SizedBox(height:20),ErrorNote(error),
    if(busy)const CircularProgressIndicator()
    else if(qr!=null&&remaining>0)Container(color:Colors.white,padding:const EdgeInsets.all(14),child:QrImageView(data:'gymbooking:${qr!['token']}',size:230,backgroundColor:Colors.white))
    else const Icon(Icons.qr_code_2_rounded,size:130,color:muted),
    const SizedBox(height:12),Text(remaining>0?appText('s232', [remaining]):appText('s233')),
    const SizedBox(height:12),ActionButton(appText('s234'),busy:busy,onPressed:renew),
    if(qr!=null&&remaining>0)TextButton(onPressed:()async{await Clipboard.setData(ClipboardData(text:'gymbooking:${qr!['token']}'));},child:Text(appText('s235'))),
    Text(appText('s236'),textAlign:TextAlign.center),
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
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s111'),child:ListView(padding:const EdgeInsets.all(20),children:[
  Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Text('${widget.branch['name']}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
   Text(appText('s237')),
   ErrorNote(error),
   if(error!=null)Text(appText('s238'),style:TextStyle(color:muted,fontSize:12)),
   if(result!=null)...[EmptyState(appText('s239'),icon:Icons.check_circle_rounded),Fact(appText('s240'),appText('s120', [result!['points']]))],
   const SizedBox(height:16),ActionButton(appText('s241'),icon:Icons.qr_code_scanner_rounded,busy:busy,onPressed:scan),
   ExpansionTile(tilePadding:EdgeInsets.zero,title:Text(appText('s242')),children:[
    TextField(controller:text,textDirection:TextDirection.ltr,enabled:!busy,decoration:InputDecoration(labelText:appText('s243'))),
    ActionButton(appText('s244'),busy:busy,onPressed:()=>submit(text.text)),
   ]),
  ])),
 ])); }
}
class _BookingCamera extends StatefulWidget {
 const _BookingCamera();
 @override State<_BookingCamera> createState()=>_BookingCameraState();
}
class _BookingCameraState extends State<_BookingCamera>{
 bool done=false;
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s245'),child:Column(children:[
  Padding(padding:EdgeInsets.all(20),child:Text(appText('s246'))),
  Expanded(child:MobileScanner(onDetect:(capture){
   if(done)return;
   for(final b in capture.barcodes){final raw=b.rawValue;if(raw!=null&&bookingToken(raw)!=null){done=true;Navigator.pop(context,raw);break;}}
  })),
 ])); }
}
