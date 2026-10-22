import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../core/api.dart';
import '../core/ui.dart';

Json? parseBranchQr(String raw) {
  final match=RegExp(r'^gymbranch:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}):([A-Za-z0-9_-]{43})$').firstMatch(raw.trim());
  return match==null?null:{'branchId':match[1]!.toLowerCase(),'token':match[2]!};
}
Future<Json> freshAttendanceLocation() async {
  if(!await Geolocator.isLocationServiceEnabled())throw const ApiFailure('LOCATION_PERMISSION_REQUIRED');
  var permission=await Geolocator.checkPermission();
  if(permission==LocationPermission.denied)permission=await Geolocator.requestPermission();
  if(permission==LocationPermission.denied||permission==LocationPermission.deniedForever)throw const ApiFailure('LOCATION_PERMISSION_REQUIRED');
  final position=await Geolocator.getCurrentPosition(locationSettings:const LocationSettings(accuracy:LocationAccuracy.high,timeLimit:Duration(seconds:20)));
  if(position.isMocked||!position.accuracy.isFinite||position.accuracy>50)throw const ApiFailure('LOCATION_INACCURATE');
  return {'latitude':position.latitude,'longitude':position.longitude,'accuracy':position.accuracy,'capturedAt':position.timestamp.toUtc().toIso8601String(),'isMocked':false};
}

class BranchCheckInScreen extends StatefulWidget {
  final ApiClient api;
  final Json booking;
  final Future<Json> Function()? locate;
  const BranchCheckInScreen({super.key,required this.api,required this.booking,this.locate});
  @override State<BranchCheckInScreen> createState()=>_BranchCheckInScreenState();
}
class _BranchCheckInScreenState extends State<BranchCheckInScreen> {
  bool busy=false;
  Object? error;
  Json? result;
  final text=TextEditingController();
  @override void dispose(){text.dispose();super.dispose();}
  Future<void> submit(String raw) async {
    if(busy||result!=null)return;
    final qr=parseBranchQr(raw);
    if(qr==null){setState(()=>error=const ApiFailure('QR_INVALID'));return;}
    if(qr['branchId']!='${widget.booking['branchId']}'.toLowerCase()){setState(()=>error=const ApiFailure('QR_WRONG_BRANCH'));return;}
    setState((){busy=true;error=null;});
    try {
      // Always acquire a new location after scanning; never use the directory's cached position.
      final location=await (widget.locate??freshAttendanceLocation)();
      if(!mounted)return;
      final response=await widget.api.request('trainee/bookings/${widget.booking['id']}/check-in',method:'POST',body:{...qr,...location});
      if(mounted)setState(()=>result=Map<String,dynamic>.from(response));
    } catch(e){if(mounted)setState(()=>error=e);}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> scan() async {
    final raw=await Navigator.push<String>(context,MaterialPageRoute(builder:(_)=>const _BranchCamera()));
    if(raw!=null&&mounted)await submit(raw);
  }
  @override Widget build(BuildContext context)=>Screen(title:'تأكيد حضوري في الفرع',child:ListView(padding:const EdgeInsets.all(20),children:[
    Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text('${widget.booking['branch']?['name']??'الفرع المحجوز'}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
      const Text('عند وصولك امسح كود الفرع الموجود في الاستقبال. لازم يكون موقعك قريب من الفرع، والموقع متاح بدقة مناسبة.'),
      const Text('مدة الجلسة تبدأ من تأكيد حضورك وتنتهي بحد أقصى عند الإغلاق.'),
      ErrorNote(error),
      if(result!=null)...[
        const EmptyState('تم تأكيد حضورك',icon:Icons.check_circle_rounded),
        Fact('النقاط المحولة للجيم','${result!['points']} نقطة'),
        ActionButton('رجوع للحجوزات',onPressed:()=>Navigator.pop(context)),
      ]else...[
        if(busy)const Text('جاري التحقق من الموقع والحضور…'),
        ActionButton('امسح كود الفرع',busy:busy,icon:Icons.qr_code_scanner_rounded,onPressed:scan),
        if(error!=null)const Text('لو الاتصال انقطع، أعد المحاولة؛ نفس الحجز لا يتحول مرتين.'),
        ExpansionTile(title:const Text('لصق كود الفرع بدل الكاميرا'),children:[
          TextField(controller:text,enabled:!busy,textDirection:TextDirection.ltr,decoration:const InputDecoration(labelText:'كود الفرع')),
          const Text('لصق الكود يحتاج نفس التحقق من موقعك داخل الفرع.'),
          ActionButton('تأكيد حضوري',busy:busy,onPressed:()=>submit(text.text)),
        ]),
      ],
    ])),
  ]));
}
class _BranchCamera extends StatefulWidget {
  const _BranchCamera();
  @override State<_BranchCamera> createState()=>_BranchCameraState();
}
class _BranchCameraState extends State<_BranchCamera> {
  bool done=false;
  @override Widget build(BuildContext context)=>Screen(title:'مسح كود الفرع',child:Column(children:[
    const Padding(padding:EdgeInsets.all(20),child:Text('امسح كود الفرع الثابت عند الاستقبال.')),
    Expanded(child:MobileScanner(onDetect:(capture){
      if(done)return;
      for(final code in capture.barcodes){final raw=code.rawValue;if(raw!=null&&parseBranchQr(raw)!=null){done=true;Navigator.pop(context,raw);break;}}
    })),
  ]));
}

class BranchEntryQrScreen extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  const BranchEntryQrScreen({super.key,required this.api,required this.branch});
  @override State<BranchEntryQrScreen> createState()=>_BranchEntryQrScreenState();
}
class _BranchEntryQrScreenState extends State<BranchEntryQrScreen> {
  Json? qr;
  bool busy=false;
  Object? error;
  @override void initState(){super.initState();load();}
  Future<void> load({bool rotate=false}) async {
    if(busy)return;
    setState((){busy=true;error=null;});
    try {
      final response=await widget.api.request('operations/branches/${widget.branch['id']}/entry-qr${rotate?'/rotate':''}',method:'POST',body:rotate?{'expectedVersion':qr!['version']}:{});
      if(mounted)setState(()=>qr=Map<String,dynamic>.from(response));
    } catch(e){if(mounted)setState(()=>error=e);}
    finally{if(mounted)setState(()=>busy=false);}
  }
  Future<void> rotate() async {
    final confirmed=await showDialog<bool>(context:context,builder:(c)=>AlertDialog(title:const Text('تغيير كود الفرع؟'),content:const Text('الكود القديم هيتوقف. اعرض أو اطبع الكود الجديد في الاستقبال.'),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:const Text('رجوع')),TextButton(onPressed:()=>Navigator.pop(c,true),child:const Text('تغيير الكود'))]));
    if(confirmed==true&&mounted)await load(rotate:true);
  }
  @override Widget build(BuildContext context)=>Screen(title:'كود حضور الفرع',child:ListView(padding:const EdgeInsets.all(20),children:[
    Panel(child:Column(children:[
      Text('${widget.branch['name']}',style:const TextStyle(fontSize:20,fontWeight:FontWeight.w800)),
      const Text('كود ثابت للاستقبال؛ المتدرب يمسحه من حجزه بعد وصوله للفرع.'),
      ErrorNote(error),
      if(busy)const CircularProgressIndicator()
      else if(qr!=null)...[
        Container(color:Colors.white,padding:const EdgeInsets.all(16),child:QrImageView(data:qr!['payload'] as String,size:240,backgroundColor:Colors.white)),
        const Text('تقدر تحفظ لقطة شاشة للكود وتطبعه عند الاستقبال. لا ينتهي إلا عند تغييره.'),
        TextButton(onPressed:()async{await Clipboard.setData(ClipboardData(text:qr!['payload'] as String));},child:const Text('نسخ كود الفرع')),
        if(widget.api.user?['role']=='GYM_OWNER'||widget.api.user?['role']=='BRANCH_MANAGER'||widget.branch['canCancel']==true)
          TextButton(onPressed:rotate,child:const Text('تغيير كود الفرع')),
      ],
      if(error!=null)TextButton(onPressed:()=>load(),child:const Text('إعادة المحاولة')),
    ])),
  ]));
}
