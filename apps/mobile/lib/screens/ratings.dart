import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'trainee.dart' show VisitCard;
class RatedVisitCard extends StatefulWidget {
 final ApiClient api;final Json visit;
 const RatedVisitCard({super.key,required this.api,required this.visit});
 @override State<RatedVisitCard> createState()=>_RatedVisitCardState();
}
class _RatedVisitCardState extends State<RatedVisitCard>{
 Json? rating;
 @override void initState(){super.initState();rating=widget.visit['rating']==null?null:Map<String,dynamic>.from(widget.visit['rating']);}
 @override void didUpdateWidget(RatedVisitCard old){super.didUpdateWidget(old);if(old.visit!=widget.visit)rating=widget.visit['rating']==null?null:Map<String,dynamic>.from(widget.visit['rating']);}
 Future<void> rate()async{
  var score=(rating?['score'] as num?)?.toInt()??0;bool busy=false;Object? error;
  final result=await showDialog<Json>(context:context,builder:(c)=>StatefulBuilder(builder:(c,update)=>AlertDialog(title:const Text('قيّم تجربتك في الجيم'),content:Column(mainAxisSize:MainAxisSize.min,children:[Text('${widget.visit['branch']?['gym']?['name']??''}'),const SizedBox(height:14),Row(children:List.generate(5,(i)=>Expanded(child:IconButton(tooltip:'${i+1} نجوم',padding:EdgeInsets.zero,onPressed:busy?null:()=>update(()=>score=i+1),icon:Icon(i<score?Icons.star_rounded:Icons.star_outline_rounded,color:const Color(0xffdfac34),size:30))))),if(error!=null)ErrorNote(error)]),actions:[TextButton(onPressed:busy?null:()=>Navigator.pop(c),child:const Text('بعدها')),TextButton(onPressed:busy||score==0?null:()async{update(()=>busy=true);try{final data=await widget.api.request('trainee/visits/${widget.visit['id']}/rating',method:'POST',body:{'score':score,'expectedVersion':rating?['version']??0});if(c.mounted)Navigator.pop(c,Map<String,dynamic>.from(data));}catch(e){if(c.mounted)update(()=>error=e);}finally{if(c.mounted)update(()=>busy=false);}},child:Text(busy?'جارٍ الحفظ…':'حفظ التقييم'))])));
  if(mounted&&result!=null)setState(()=>rating=result);
 }
 @override Widget build(BuildContext context)=>Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[VisitCard(widget.visit),if(widget.visit['canRate']==true)TextButton.icon(onPressed:rate,icon:const Icon(Icons.star_outline_rounded,color:Color(0xffc99b2c)),label:Text(rating==null?'قيّم زيارتك':'تقييمك ${rating!['score']} / 5 · تعديل'))]);
}
