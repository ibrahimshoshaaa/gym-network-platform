import 'language.dart';

// These are protocol templates emitted by notificationFeed, not user content.
// Campaign copy, equipment names, branch names and administrator notes stay raw.
String notificationTitle(Map<String, dynamic> item) {
  final raw='${item['title'] ?? ''}';
  if(!AppLanguage.instance.english)return raw;
  final parts='${item['id']}'.split(':');
  final kind=parts.first, state=parts.length>2?parts[2]:'';
  String? suffix(String prefix)=>raw.startsWith(prefix)?raw.substring(prefix.length):null;
  String status(String value)=>_status(value);
  switch(kind){
    case 'maintenance': final value=suffix('الصيانة · ');return value==null?raw:appText('s1013',[value]);
    case 'promotion': final value=suffix('إعلان الفرع · ');return value==null?raw:appText('s1014',[value]);
    case 'market': final value=suffix('الماركت · ');return value==null?raw:appText('s1015',[value]);
    case 'topup': final match=RegExp(r'^شحن (\d+) نقطة · ').firstMatch(raw);return match==null?raw:appText('s1016',[match[1],status(state)]);
    case 'withdrawal': return appText('s1017',[status(state)]);
    case 'review': return appText('s1018',[status(state)]);
    case 'price': final end=raw.lastIndexOf(' · ');return raw.startsWith('سعر ')&&end>=4?appText('s1019',[raw.substring(4,end),status(state)]):raw;
    case 'hold': return appText(state=='OPEN'?'s1020':'s1021');
    case 'dispatch': final match=RegExp(r'^شحن مباشر · (\d+) نقطة$').firstMatch(raw);return match==null?raw:appText('s1022',[match[1]]);
    case 'support':return appText('s1023',[status(state)]);
    case 'visit':final prefix=state=='CANCELLED'?'إلغاء زيارة ':'زيارة ';final value=suffix(prefix);return value==null?raw:appText(state=='CANCELLED'?'s1024':'s1025',[value]);
    case 'expiry':final match=RegExp(r'^صلاحية نقاطك خلال (\d+) يوم$').firstMatch(raw);return match!=null?appText('s1026',[match[1]]):raw=='رصيدك المنتهي يحتاج مراجعة'?appText('s1027'):raw;
    default:return raw;
  }
}
String notificationDescription(Map<String,dynamic> item) {
 final raw='${item['description'] ?? ''}';
 final kind='${item['id']}'.split(':').first;
 if(!AppLanguage.instance.english||kind=='campaign')return raw;
 if(kind=='maintenance'&&raw.startsWith('حالة الطلب: '))return appText('s1028',[_status(raw.substring('حالة الطلب: '.length))]);
 if(kind=='market'&&raw.startsWith('حالة الإعلان: ')){
  const statuses={'بانتظار المراجعة':'PENDING','مقبول':'APPROVED','مرفوض':'REJECTED','مخفي':'HIDDEN','تم البيع':'SOLD'};
  final rawStatus=raw.substring('حالة الإعلان: '.length);
  final value=statuses[rawStatus] ?? (RegExp(r'^[A-Z_]+$').hasMatch(rawStatus)?rawStatus:null);
  if(value!=null)return appText('s1030',[_status(value)]);
 }
 // Only documented default descriptions for each event type are translated.
 final defaults=<String,Map<String,String>>{
  'promotion':{'تابع حالة الإعلان وتكلفته':'s1029'},
  'topup':{'يوجد طلب شحن يحتاج قرارك':'s1031','تابع حالة الطلب':'s1032'},
  'withdrawal':{'تجاوز موعد التنفيذ؛ يحتاج متابعة':'s1033','تابع تفاصيل الطلب والمستحقات':'s1034'},
  'review':{'طلب مراجعة مسجل':'s1035'},
  'dispatch':{'تمت إضافة النقاط لمحفظتك':'s1036'},
  'expiry':{'راجع المحفظة. التنبيه لا يحذف نقاطًا ولا يغيّر سياسة الرصيد.':'s1037'},
 };
 final key=defaults[kind]?[raw];return key==null?raw:appText(key);
}
String _status(String value) {
 final labels=<String,String>{'NEW':'s87','REVIEWING':'s82','PENDING':'s82','APPROVED':'s83','REJECTED':'s84','REQUESTED':'s87','PAID':'s88','DISPUTED':'s89','CANCELLED':'s90','OPEN':'s93','WAITING_USER':'s95','WAITING_ADMIN':'s94','CLOSED':'s96','AWAITING_APPROVAL':'s673','SCHEDULED':'s674','IN_PROGRESS':'s675','AWAITING_CONFIRMATION':'s676','COMPLETED':'s677','HIDDEN':'s843','SOLD':'s844'};
 final key=labels[value];return key==null?value:appText(key);
}
