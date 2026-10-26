import '../l10n/language.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/ui.dart';

Map<String, String> get marketCategories =>{'EQUIPMENT':appText('s837'),'WEIGHTS':appText('s838'),'ACCESSORIES':appText('s839'),'CLOTHING':appText('s840')};
Map<String, String> get marketStatuses =>{'PENDING':appText('s841'),'APPROVED':appText('s842'),'REJECTED':appText('s84'),'HIDDEN':appText('s843'),'SOLD':appText('s844')};
class MarketScreen extends StatefulWidget {
 final ApiClient api;
 const MarketScreen({super.key,required this.api});
 @override State<MarketScreen> createState()=>_MarketScreenState();
}
class _MarketScreenState extends State<MarketScreen>{
 final search=TextEditingController(),min=TextEditingController(),max=TextEditingController();
 List<Json> items=[];List<String> places=[];
 String? cursor,category,condition,governorate;String sort='LATEST';
 bool mine=false,loading=true,more=false;Object? error;int generation=0;
 @override void initState(){super.initState();load();options();}
 @override void dispose(){search.dispose();min.dispose();max.dispose();super.dispose();}
 Future<void> options()async{try{final r=await widget.api.request('market/options');if(mounted)setState(()=>places=List<String>.from(r['governorates']));}catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> load({bool next=false})async{
  if(next&&(loading||more||cursor==null))return;
  final current=next?generation:++generation;
  setState((){if(next){more=true;}else{loading=true;items=[];cursor=null;}error=null;});
  try{
   final query=<String,String>{'limit':'20',if(next)'cursor':cursor!,if(!mine)...{'sort':sort,if(search.text.trim().isNotEmpty)'q':search.text.trim(),if(category!=null)'category':category!,if(condition!=null)'condition':condition!,if(governorate!=null)'governorate':governorate!,if(min.text.trim().isNotEmpty)'min':piasters(min.text)??'invalid',if(max.text.trim().isNotEmpty)'max':piasters(max.text)??'invalid'}};
   final data=await widget.api.request('market/${mine?'mine':'listings'}?${Uri(queryParameters:query).query}');
   if(mounted&&current==generation)setState((){items=next?[...items,...rows(data)]:rows(data);cursor=data['nextCursor'];});
  }catch(e){if(mounted&&current==generation)setState(()=>error=e);}finally{if(mounted&&current==generation)setState((){loading=more=false;});}
 }
 Future<void> editor()async{await open(context,MarketEditor(api:widget.api));if(mounted){setState(()=>mine=true);await load();}}
 Future<void> filter()async{
  var c=condition,g=governorate,s=sort;
  final changed=await showModalBottomSheet<bool>(context:context,isScrollControlled:true,builder:(context){ AppLanguage.watch(context); return StatefulBuilder(builder:(context,update){ AppLanguage.watch(context); return SafeArea(child:SingleChildScrollView(padding:EdgeInsets.fromLTRB(20,24,20,MediaQuery.viewInsetsOf(context).bottom+24),child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   Text(appText('s845'),style:TextStyle(fontSize:21,fontWeight:FontWeight.w800)),const SizedBox(height:20),
   DropdownButtonFormField<String>(initialValue:g,decoration:InputDecoration(labelText:appText('s298')),items:[DropdownMenuItem<String>(value:null,child:Text(appText('s846'))),...places.map((p)=>DropdownMenuItem(value:p,child:Text(p)))],onChanged:(v)=>update(()=>g=v)),const SizedBox(height:16),
   DropdownButtonFormField<String>(initialValue:c,decoration:InputDecoration(labelText:appText('s847')),items:[DropdownMenuItem<String>(value:null,child:Text(appText('s848'))),DropdownMenuItem(value:'NEW',child:Text(appText('s267'))),DropdownMenuItem(value:'USED',child:Text(appText('s849')))],onChanged:(v)=>update(()=>c=v)),const SizedBox(height:16),
   Row(children:[Expanded(child:TextField(controller:min,keyboardType:TextInputType.number,decoration:InputDecoration(labelText:appText('s850')))),const SizedBox(width:12),Expanded(child:TextField(controller:max,keyboardType:TextInputType.number,decoration:InputDecoration(labelText:appText('s851'))))]),const SizedBox(height:16),
   DropdownButtonFormField<String>(initialValue:s,decoration:InputDecoration(labelText:appText('s852')),items:[DropdownMenuItem(value:'LATEST',child:Text(appText('s853'))),DropdownMenuItem(value:'PRICE_ASC',child:Text(appText('s854'))),DropdownMenuItem(value:'PRICE_DESC',child:Text(appText('s855')))],onChanged:(v)=>update(()=>s=v!)),const SizedBox(height:20),
   ActionButton(appText('s856'),onPressed:()=>Navigator.pop(context,true)),TextButton(onPressed:(){update((){g=c=null;s='LATEST';min.clear();max.clear();});},child:Text(appText('s621'))),
  ]))); }); });
  if(changed==true&&mounted){setState((){condition=c;governorate=g;sort=s;});await load();}
 }
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return RefreshIndicator(onRefresh:()=>load(),child:ListView(physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.fromLTRB(16,0,16,28),children:[
  Row(children:[Expanded(child:Text(appText('s1059'),style:const TextStyle(fontSize:18,fontWeight:FontWeight.w800))),const SizedBox(width:8),FilledButton.icon(key:const Key('market.create'),style:FilledButton.styleFrom(minimumSize:const Size(0,36),padding:const EdgeInsets.symmetric(horizontal:12),textStyle:Theme.of(context).textTheme.labelLarge?.copyWith(fontSize:12,fontWeight:FontWeight.w700),shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(12))),onPressed:editor,icon:const Icon(Icons.add_rounded,size:17),label:Text(appText('s1060')))]),const SizedBox(height:8),
  Container(padding:const EdgeInsets.all(3),decoration:BoxDecoration(color:const Color(0xffe9edf2),borderRadius:BorderRadius.circular(15)),child:Row(children:[_tab(false,appText('s859')),_tab(true,appText('s860'))])),const SizedBox(height:8),
  if(!mine)...[
   Row(children:[Expanded(child:TextField(controller:search,onSubmitted:(_)=>load(),style:const TextStyle(fontSize:13),decoration:InputDecoration(isDense:true,contentPadding:const EdgeInsets.symmetric(horizontal:10,vertical:10),hintText:appText('s861'),prefixIcon:IconButton(tooltip:appText('s612'),onPressed:()=>load(),icon:const Icon(Icons.search_rounded,size:19))))),const SizedBox(width:6),IconButton.outlined(key:const Key('market.filters'),tooltip:appText('s862'),onPressed:filter,icon:const Icon(Icons.tune_rounded,size:19))]),const SizedBox(height:4),
   SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[_categoryChip(null,appText('s848')),...marketCategories.entries.map((entry)=>_categoryChip(entry.key,entry.value))])),
   if(governorate!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(appText('s863', [governorate]),style:const TextStyle(color:green))),
  ],const SizedBox(height:6),
  if(error!=null)ErrorNote(error,retry:()=>load()),
  if(loading)const Padding(padding:EdgeInsets.all(30),child:Center(child:CircularProgressIndicator()))
  else if(items.isEmpty&&error==null)EmptyState(mine?appText('s864'):appText('s865'),detail:mine?appText('s866'):appText('s867'))
  else GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),itemCount:items.length,gridDelegate:const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:2,crossAxisSpacing:12,mainAxisSpacing:14,mainAxisExtent:260),itemBuilder:(context,i){final p=items[i],images=(p['images'] as List? ??[]);return Material(key:ValueKey('market.card.${p['id']}'),color:Colors.white,borderRadius:BorderRadius.circular(20),clipBehavior:Clip.antiAlias,child:InkWell(onTap:()async{await open(context,MarketDetail(api:widget.api,id:p['id']));if(mounted)await load();},child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   Expanded(child:Stack(fit:StackFit.expand,children:[marketImage(images.isEmpty?null:images.first['publicUrl']),PositionedDirectional(top:8,start:8,child:Container(padding:const EdgeInsets.symmetric(horizontal:8,vertical:4),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(10)),child:Text(p['condition']=='NEW'?appText('s267'):appText('s849'),style:const TextStyle(fontSize:10,fontWeight:FontWeight.w700))))])),
   Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(appText('s122', [money(p['pricePiasters'])]),maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:green,fontWeight:FontWeight.w900,fontSize:17)),const SizedBox(height:5),Text('${p['title']}',maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(fontWeight:FontWeight.w700,fontSize:13)),const SizedBox(height:6),Text(mine?(marketStatuses[p['status']]??''):'${p['governorate']} · ${p['city']}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(color:muted,fontSize:10))])),
  ])));}),
  if(cursor!=null)Padding(padding:const EdgeInsets.only(top:16),child:OutlinedButton(onPressed:more?null:()=>load(next:true),child:Text(more?appText('s695'):appText('s696')))),
 ])); }
 Widget _tab(bool value,String label)=>Expanded(child:Semantics(selected:mine==value,child:Padding(
  padding:const EdgeInsets.symmetric(horizontal:1),child:Material(color:mine==value?Colors.white:Colors.transparent,
   elevation:mine==value?1:0,borderRadius:BorderRadius.circular(12),child:InkWell(
    key:ValueKey('market.tab.$value'),borderRadius:BorderRadius.circular(12),onTap:(){if(mine==value)return;setState(()=>mine=value);load();},
    child:Padding(padding:const EdgeInsets.symmetric(horizontal:6,vertical:11),child:Text(label,textAlign:TextAlign.center,style:TextStyle(fontSize:12,fontWeight:FontWeight.w700,color:mine==value?ink:muted))),
  )),
 )));
 Widget _categoryChip(String? value,String label)=>Padding(padding:const EdgeInsetsDirectional.only(end:6),child:ChoiceChip(
  label:Text(label),showCheckmark:false,shape:const StadiumBorder(),selected:category==value,
  selectedColor:ink,labelStyle:TextStyle(fontSize:11,color:category==value?Colors.white:ink),
  padding:const EdgeInsets.symmetric(horizontal:3),labelPadding:const EdgeInsets.symmetric(horizontal:8),
  side:BorderSide(color:category==value?ink:const Color(0xffe0e5e8)),
  onSelected:(_){setState(()=>category=value);load();},
 ));
}
Widget marketImage(dynamic url)=>url==null?const ColoredBox(color:Color(0xffedf3ef),child:Icon(Icons.fitness_center_rounded,color:muted,size:36)):Image.network('$url',fit:BoxFit.cover,errorBuilder:(_,_,_)=>const ColoredBox(color:Color(0xffedf3ef),child:Icon(Icons.broken_image_outlined,color:muted)));

class MarketDetail extends StatefulWidget{
 final ApiClient api;final String id;
 const MarketDetail({super.key,required this.api,required this.id});
 @override State<MarketDetail> createState()=>_MarketDetailState();
}
class _MarketDetailState extends State<MarketDetail>{
 int revision=0,page=0;bool busy=false;Object? error;
 Future<void> status(Json p,String value)async{
  final confirmed=await showDialog<bool>(context:context,builder:(c){ AppLanguage.watch(c); return AlertDialog(title:Text(value=='SOLD'?appText('s868'):appText('s869')),content:Text(appText('s870')),actions:[TextButton(onPressed:()=>Navigator.pop(c,false),child:Text(appText('s217'))),TextButton(onPressed:()=>Navigator.pop(c,true),child:Text(appText('s472')))]); });
  if(confirmed!=true||busy)return;setState(()=>busy=true);try{await widget.api.request('market/listings/${widget.id}/status',method:'POST',body:{'expectedVersion':p['version'],'status':value});if(mounted)setState(()=>revision++);}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}
 }
 Future<void> report()async{
  final controller=TextEditingController();bool sending=false;String? problem;
  await showDialog<void>(context:context,builder:(c){ AppLanguage.watch(c); return StatefulBuilder(builder:(c,update){ AppLanguage.watch(c); return AlertDialog(title:Text(appText('s871')),content:Column(mainAxisSize:MainAxisSize.min,children:[TextField(controller:controller,maxLength:1000,maxLines:3,decoration:InputDecoration(labelText:appText('s872'))),if(problem!=null)Text(problem!,style:const TextStyle(color:Colors.red))]),actions:[TextButton(onPressed:sending?null:()=>Navigator.pop(c),child:Text(appText('s217'))),TextButton(onPressed:sending?null:()async{if(controller.text.trim().length<5){update(()=>problem=appText('s717'));return;}update(()=>sending=true);try{await widget.api.request('market/listings/${widget.id}/report',method:'POST',body:{'reason':controller.text.trim()});if(c.mounted)Navigator.pop(c);if(mounted)ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('s873'))));}catch(e){if(c.mounted)update(()=>problem='$e');}finally{if(c.mounted)update(()=>sending=false);}},child:Text(sending?appText('s874'):appText('s875')))]); }); });
  controller.dispose();
 }
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s876'),child:DataView(key:ValueKey(revision),load:()=>widget.api.request('market/listings/${widget.id}'),builder:(d,reload){final p=Map<String,dynamic>.from(d),images=p['images'] as List? ??[],own=p['canEdit']==true,phone='${p['contactPhone']}';return Column(children:[Expanded(child:ListView(padding:const EdgeInsets.all(18),children:[
  if(images.isNotEmpty)ClipRRect(borderRadius:BorderRadius.circular(24),child:AspectRatio(aspectRatio:1.15,child:PageView.builder(itemCount:images.length,onPageChanged:(v)=>setState(()=>page=v),itemBuilder:(_,i)=>marketImage(images[i]['publicUrl'])))),if(images.length>1)Padding(padding:const EdgeInsets.all(10),child:Text('${page+1} / ${images.length}',textAlign:TextAlign.center,style:const TextStyle(color:muted))),const SizedBox(height:18),
  Text(appText('s122', [money(p['pricePiasters'])]),style:const TextStyle(color:green,fontSize:27,fontWeight:FontWeight.w900)),const SizedBox(height:8),Text('${p['title']}',style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800)),const SizedBox(height:8),Text('${marketCategories[p['category']]} · ${p['condition']=='NEW'?appText('s267'):appText('s849')}',style:const TextStyle(color:muted)),Text('${p['governorate']} · ${p['city']}',style:const TextStyle(color:muted)),SectionTitle(appText('s877')),Text('${p['description']}',style:const TextStyle(height:1.8)),SectionTitle(appText('s878')),Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${p['seller']['displayName']}',style:const TextStyle(fontWeight:FontWeight.w800)),Text(appText('s879'),style:TextStyle(color:muted,fontSize:12))])),
  if(own)...[SectionTitle(appText('s880')),Text(marketStatuses[p['status']]??'${p['status']}',style:const TextStyle(color:green)),if(p['reviewReason']!=null)Text(appText('s881', [p['reviewReason']])),ErrorNote(error),OutlinedButton.icon(onPressed:busy?null:()async{await open(context,MarketEditor(api:widget.api,initial:p));if(mounted)setState(()=>revision++);},icon:const Icon(Icons.edit_outlined),label:Text(appText('s882'))),if(p['status']!='SOLD')TextButton(onPressed:busy?null:()=>status(p,'SOLD'),child:Text(appText('s844'))),if(p['status']!='HIDDEN')TextButton(onPressed:busy?null:()=>status(p,'HIDDEN'),child:Text(appText('s883')))]
  else TextButton.icon(onPressed:report,icon:const Icon(Icons.flag_outlined),label:Text(appText('s871'))),
 ])),if(!own)SafeArea(top:false,child:Padding(padding:const EdgeInsets.all(16),child:Row(children:[Expanded(child:FilledButton.icon(onPressed:()=>launchUrl(Uri.https('wa.me',phone.replaceAll('+',''),{'text':appText('s884', [p['title']])}),mode:LaunchMode.externalApplication),icon:const Icon(Icons.chat_bubble_outline_rounded),label:Text(appText('s885')))),const SizedBox(width:12),Expanded(child:OutlinedButton.icon(onPressed:()=>launchUrl(Uri(scheme:'tel',path:phone)),icon:const Icon(Icons.call_outlined),label:Text(appText('s886'))))]))) ]);})); }
}

class MarketEditor extends StatefulWidget{
 final ApiClient api;final Json? initial;
 const MarketEditor({super.key,required this.api,this.initial});
 @override State<MarketEditor> createState()=>_MarketEditorState();
}
class _MarketEditorState extends State<MarketEditor>{
 final form=GlobalKey<FormState>();
 late final TextEditingController title,description,price,city,phone;
 late final String clientKey;
 String category='EQUIPMENT',condition='USED';String? governorate;
 List<String> places=[];List<Json> images=[];bool busy=false;Object? error;String progress='';
 @override void initState(){super.initState();final p=widget.initial;clientKey=newKey();title=TextEditingController(text:p?['title']);description=TextEditingController(text:p?['description']);price=TextEditingController(text:p==null?'':money(p['pricePiasters']));city=TextEditingController(text:p?['city']);phone=TextEditingController(text:p?['contactPhone']??widget.api.user?['phone']??'');category=p?['category']??category;condition=p?['condition']??condition;governorate=p?['governorate'];images=(p?['images'] as List? ??[]).map((i)=>Map<String,dynamic>.from(i)).toList();options();}
 @override void dispose(){for(final c in [title,description,price,city,phone]){c.dispose();}super.dispose();}
 Future<void> options()async{try{final r=await widget.api.request('market/options');if(mounted)setState(()=>places=List<String>.from(r['governorates']));}catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> upload()async{
  if(busy)return;setState((){busy=true;error=null;});
  try{final files=await ImagePicker().pickMultiImage(imageQuality:85,maxWidth:1600);if(files.length+images.length>6)throw Exception(appText('s887'));for(var i=0;i<files.length;i++){final bytes=await files[i].readAsBytes();if(bytes.length>4194304)throw Exception(appText('s888'));if(mounted)setState(()=>progress=appText('s698', [i+1, files.length]));final image=await widget.api.request('market/assets',method:'POST',bytes:bytes,mime:'image/jpeg');if(mounted)setState(()=>images.add(Map<String,dynamic>.from(image)));}}
  catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState((){busy=false;progress='';});}
 }
 Future<void> submit()async{
  if(busy||!form.currentState!.validate())return;
  if(images.isEmpty){setState(()=>error=Exception(appText('s889')));return;}
  if(governorate==null){setState(()=>error=Exception(appText('s890')));return;}
  var number=digits(phone.text.trim()).replaceAll(RegExp(r'[\s()-]'),'');if(RegExp(r'^01\d{9}$').hasMatch(number))number='+20${number.substring(1)}';
  if(!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(number)){setState(()=>error=Exception(appText('s891')));return;}
  final amount=piasters(price.text);if(amount==null||BigInt.parse(amount)>BigInt.from(999999999999)){setState(()=>error=Exception(appText('s892')));return;}
  setState((){busy=true;error=null;});
  try{await widget.api.request(widget.initial==null?'market/listings':'market/listings/${widget.initial!['id']}',method:widget.initial==null?'POST':'PATCH',body:{'title':title.text.trim(),'description':description.text.trim(),'pricePiasters':amount,'category':category,'condition':condition,'governorate':governorate,'city':city.text.trim(),'contactPhone':number,'imageIds':images.map((i)=>i['id']).toList(),if(widget.initial==null)'clientKey':clientKey,if(widget.initial!=null)'expectedVersion':widget.initial!['version']});if(mounted){ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(appText('s893'))));Navigator.pop(context,true);}}
  catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}
 }
 Widget field(TextEditingController controller,String label,{int lines=1,int minimum=1,int maximum=100,TextInputType? type})=>Padding(padding:const EdgeInsets.only(bottom:16),child:TextFormField(controller:controller,enabled:!busy,maxLines:lines,maxLength:maximum,keyboardType:type,decoration:InputDecoration(labelText:label),validator:(value)=>value==null||value.trim().length<minimum?appText('s894', [label]):null));
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:widget.initial==null?appText('s858'):appText('s882'),child:Form(key:form,child:ListView(padding:const EdgeInsets.all(20),children:[
  Text(appText('s895'),style:TextStyle(fontSize:22,fontWeight:FontWeight.w800)),const SizedBox(height:8),Text(appText('s896'),style:TextStyle(color:muted,fontSize:12)),const SizedBox(height:20),
  OutlinedButton.icon(onPressed:busy||images.length>=6?null:upload,icon:const Icon(Icons.add_photo_alternate_outlined),label:Text(busy&&progress.isNotEmpty?progress:appText('s897', [images.length]))),
  if(images.isNotEmpty)SizedBox(height:120,child:ListView.separated(scrollDirection:Axis.horizontal,itemCount:images.length,separatorBuilder:(_,_)=>const SizedBox(width:8),itemBuilder:(_,i)=>SizedBox(width:104,child:Stack(fit:StackFit.expand,children:[ClipRRect(borderRadius:BorderRadius.circular(14),child:marketImage(images[i]['publicUrl'])),PositionedDirectional(top:2,end:2,child:IconButton.filledTonal(tooltip:appText('s898'),onPressed:busy?null:()=>setState(()=>images.removeAt(i)),icon:const Icon(Icons.close_rounded,size:16)))])))),const SizedBox(height:20),
  field(title,appText('s899'),minimum:3,maximum:100),
  DropdownButtonFormField<String>(initialValue:category,decoration:InputDecoration(labelText:appText('s900')),items:marketCategories.entries.map((e)=>DropdownMenuItem(value:e.key,child:Text(e.value))).toList(),onChanged:busy?null:(v)=>setState(()=>category=v!)),const SizedBox(height:16),
  DropdownButtonFormField<String>(initialValue:condition,decoration:InputDecoration(labelText:appText('s847')),items:[DropdownMenuItem(value:'NEW',child:Text(appText('s267'))),DropdownMenuItem(value:'USED',child:Text(appText('s849')))],onChanged:busy?null:(v)=>setState(()=>condition=v!)),const SizedBox(height:16),
  field(price,appText('s901'),type:const TextInputType.numberWithOptions(decimal:true),maximum:15),
  if(places.isEmpty)TextButton(onPressed:options,child:Text(appText('s902'))) else DropdownButtonFormField<String>(initialValue:governorate,decoration:InputDecoration(labelText:appText('s298')),items:places.map((p)=>DropdownMenuItem(value:p,child:Text(p))).toList(),onChanged:busy?null:(v)=>setState(()=>governorate=v),validator:(v)=>v==null?appText('s890'):null),const SizedBox(height:16),
  field(city,appText('s326'),minimum:2,maximum:80),field(phone,appText('s706'),type:TextInputType.phone,maximum:20),field(description,appText('s903'),lines:5,minimum:10,maximum:3000),
  ErrorNote(error),ActionButton(widget.initial==null?appText('s904'):appText('s905'),busy:busy,onPressed:busy||places.isEmpty?null:submit),const SizedBox(height:12),Text(appText('s906'),style:TextStyle(color:muted,fontSize:11)),
 ]))); }
}
