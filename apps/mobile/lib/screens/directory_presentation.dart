part of 'directory.dart';

String _gymName(Json b)=>'${b['gym']?['name']??b['name']??''}';
String _placeLabel(Json b)=>[b['city'],b['governorate']].where((v)=>v!=null&&'$v'.trim().isNotEmpty).map((v)=>'$v').join(' · ');
String _pointsLabel(Json b)=>b['serviceBooking']==true?(b['minimumServicePoints']==null?appText('s268'):appText('s269',[b['minimumServicePoints']])):appText('s627',[b['visitPricePoints']]);
String _durationLabel(Json b)=>b['serviceBooking']==true?appText('s1041'):appText('s184',[b['sessionMinutes']]);

class BranchTile extends StatelessWidget {
 final Json branch;
 final VoidCallback onTap;
 const BranchTile({super.key,required this.branch,required this.onTap});
 @override Widget build(BuildContext context){AppLanguage.watch(context);final hours='${branch['openingHours']??''}'.trim();
  return Semantics(button:true,child:Material(color:Colors.white,shape:RoundedRectangleBorder(borderRadius:BorderRadius.circular(22),side:const BorderSide(color:Color(0xffe8edea))),clipBehavior:Clip.antiAlias,
   child:InkWell(onTap:onTap,child:Padding(padding:const EdgeInsets.all(12),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
    GymThumbnail(branch:branch,size:80),const SizedBox(width:12),
    Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
     Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Expanded(child:Text(_gymName(branch),maxLines:2,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:15,fontWeight:FontWeight.w800))),
      if(branch['ratingAverage'] is num)...[const SizedBox(width:5),_GymRating(branch:branch)],
     ]),
     if('${branch['name']??''}'!=_gymName(branch))Text('${branch['name']??''}',maxLines:1,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:11,color:green,fontWeight:FontWeight.w600)),
     const SizedBox(height:4),_IconLine(Icons.location_on_outlined,_placeLabel(branch)),
     if(hours.isNotEmpty)...[const SizedBox(height:3),_IconLine(Icons.schedule_outlined,hours,maxLines:2)],
     const SizedBox(height:8),Wrap(spacing:5,runSpacing:5,children:[
      _DirectoryChip(_pointsLabel(branch),Icons.toll_outlined,primary:true),
      if(hours.isEmpty)_DirectoryChip(_durationLabel(branch),Icons.schedule_rounded),
      if(branch['distanceKm'] is num)_DirectoryChip(appText('s629',[(branch['distanceKm'] as num).toStringAsFixed(1)]),Icons.near_me_outlined),
     ]),
    ])),
   ])))));
 }
}
class _GymRating extends StatelessWidget {
 final Json branch;
 const _GymRating({required this.branch});
 @override Widget build(BuildContext context)=>Semantics(label:appText('s626',[(branch['ratingAverage'] as num).toStringAsFixed(1),branch['ratingCount']??0]),child:Row(mainAxisSize:MainAxisSize.min,children:[
  const Icon(Icons.star_rounded,color:Color(0xffedb831),size:15),const SizedBox(width:2),Text((branch['ratingAverage'] as num).toStringAsFixed(1),style:const TextStyle(fontSize:11,fontWeight:FontWeight.w700)),
 ]));
}
class _IconLine extends StatelessWidget{
 final IconData icon;final String text;final int maxLines;
 const _IconLine(this.icon,this.text,{this.maxLines=2});
 @override Widget build(BuildContext context)=>Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(icon,size:13,color:muted),const SizedBox(width:4),Expanded(child:Text(text,maxLines:maxLines,overflow:TextOverflow.ellipsis,style:const TextStyle(fontSize:11,color:muted,height:1.5)))]);
}
class _DirectoryChip extends StatelessWidget{
 final String text;final IconData icon;final bool primary;
 const _DirectoryChip(this.text,this.icon,{this.primary=false});
 @override Widget build(BuildContext context)=>Container(padding:const EdgeInsets.symmetric(horizontal:7,vertical:5),decoration:BoxDecoration(color:primary?const Color(0xffe7faf2):canvas,borderRadius:BorderRadius.circular(8)),
  child:Row(mainAxisSize:MainAxisSize.min,children:[Icon(icon,size:12,color:primary?green:muted),const SizedBox(width:4),Flexible(child:Text(text,style:TextStyle(fontSize:10,color:primary?green:muted,fontWeight:primary?FontWeight.w700:FontWeight.w500)))]));
}

class _DirectoryFilters extends StatefulWidget{
 final String price,region,city;
 const _DirectoryFilters({required this.price,required this.region,required this.city});
 @override State<_DirectoryFilters> createState()=>_DirectoryFiltersState();
}
class _DirectoryFiltersState extends State<_DirectoryFilters>{
 late final price=TextEditingController(text:widget.price),region=TextEditingController(text:widget.region),city=TextEditingController(text:widget.city);
 final form=GlobalKey<FormState>();
 @override void dispose(){price.dispose();region.dispose();city.dispose();super.dispose();}
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Padding(padding:EdgeInsets.fromLTRB(20,20,20,MediaQuery.viewInsetsOf(context).bottom+24),child:SingleChildScrollView(child:Form(key:form,child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.stretch,children:[
  Row(children:[Expanded(child:Text(appText('s618'),style:Theme.of(context).textTheme.titleLarge)),IconButton(tooltip:appText('s1049'),onPressed:()=>Navigator.pop(context),icon:const Icon(Icons.close_rounded))]),
  const SizedBox(height:16),TextFormField(key:const Key('directory.filter.region'),controller:region,maxLength:80,decoration:InputDecoration(labelText:appText('s298'))),
  const SizedBox(height:12),TextFormField(key:const Key('directory.filter.city'),controller:city,maxLength:80,decoration:InputDecoration(labelText:appText('s326'))),
  const SizedBox(height:12),TextFormField(key:const Key('directory.filter.price'),controller:price,keyboardType:TextInputType.number,decoration:InputDecoration(labelText:appText('s619')),
   validator:(v){final raw=digits(v?.trim()??'');if(raw.isEmpty)return null;final n=int.tryParse(raw);return n==null||n<1||n>2147483647?appText('s1050'):null;}),
  const SizedBox(height:20),FilledButton(key:const Key('directory.filter.apply'),onPressed:(){if(form.currentState!.validate())Navigator.pop(context,{'price':digits(price.text.trim()),'region':region.text.trim(),'city':city.text.trim()});},child:Text(appText('s620'))),
 ]))));}
}

/// Business photos are distinct from the gym's identity/logo thumbnail.
List<Json> gymGallery(Json branch){
 final images=(branch['images'] as List? ?? []).whereType<Map>().map((p)=>Map<String,dynamic>.from(p)).where((p)=>p['url'] is String&&Uri.tryParse(p['url'])?.scheme=='https').toList();
 final photos=images.where((p)=>p['purpose']!='LOGO').toList();
 final result=photos.isEmpty?images:[...photos.where((p)=>p['purpose']=='COVER'),...photos.where((p)=>p['purpose']!='COVER')];
 return {for(final p in result)'${p['url']}':p}.values.toList();
}
class _BusinessPhoto extends StatelessWidget{
 final String? url;final BoxFit fit;
 const _BusinessPhoto(this.url,{this.fit=BoxFit.cover});
 @override Widget build(BuildContext context){final fallback=Container(color:const Color(0xff173830),alignment:Alignment.center,child:const Icon(Icons.fitness_center_rounded,color:Color(0xff62dab4),size:42));
  return url==null?fallback:Image.network(url!,fit:fit,errorBuilder:(_,e,s)=>fallback,loadingBuilder:(_,child,progress)=>progress==null?child:fallback);
 }
}
class _BranchDetailBody extends StatefulWidget{
 final ApiClient api;final Json branch;
 const _BranchDetailBody({required this.api,required this.branch});
 @override State<_BranchDetailBody> createState()=>_BranchDetailBodyState();
}
class _BranchDetailBodyState extends State<_BranchDetailBody>{
 int selected=0;
 @override Widget build(BuildContext context){AppLanguage.watch(context);final b=widget.branch,photos=gymGallery(b),point=pointOf(b);final photo=photos.isEmpty?null:photos[selected<photos.length?selected:0]['url'] as String;
 final description='${b['gym']?['description']??''}'.trim();
 void book({String? service})=>open(context,CreateBookingScreen(api:widget.api,branch:b,initialServiceId:service));
 Future<void> directions()=>launchUrl(Uri.https('www.google.com','/maps/dir/',{'api':'1','destination':'${point.latitude},${point.longitude}'}),mode:LaunchMode.externalApplication).then((_){ });
 return ListView(padding:const EdgeInsets.only(bottom:28),children:[
  SizedBox(height:220,child:Semantics(button:photos.isNotEmpty,label:appText('s1042'),child:GestureDetector(onTap:photos.isEmpty?null:()=>open(context,_GymGallery(photos:photos,initial:selected)),child:Stack(fit:StackFit.expand,children:[
   _BusinessPhoto(photo),const DecoratedBox(decoration:BoxDecoration(gradient:LinearGradient(begin:Alignment.topCenter,end:Alignment.bottomCenter,colors:[Colors.transparent,Color(0xee0d1b18)]))),
   PositionedDirectional(start:18,end:18,bottom:18,child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    if(b['ratingAverage'] is num)Container(padding:const EdgeInsets.symmetric(horizontal:8,vertical:5),decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(9)),child:Row(mainAxisSize:MainAxisSize.min,children:[_GymRating(branch:b),const SizedBox(width:5),Text(appText('s1043',[b['ratingCount']??0]),style:const TextStyle(fontSize:10,color:muted))])),
    const SizedBox(height:7),Text(_gymName(b),style:const TextStyle(color:Colors.white,fontSize:24,fontWeight:FontWeight.w800)),
    const SizedBox(height:3),Text('${b['name']} · ${_placeLabel(b)}',style:const TextStyle(color:Colors.white70,fontSize:12)),
   ])),
  ])))),
  Padding(padding:const EdgeInsets.symmetric(horizontal:16),child:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
   if(photos.length>1)Padding(padding:const EdgeInsets.only(top:12),child:SizedBox(height:58,child:ListView.separated(scrollDirection:Axis.horizontal,itemCount:photos.length,separatorBuilder:(_,i)=>const SizedBox(width:8),itemBuilder:(context,i)=>Semantics(selected:selected==i,button:true,label:appText('s1044',[i+1]),child:GestureDetector(key:ValueKey('gym.photo.$i'),onTap:()=>setState(()=>selected=i),child:Container(width:64,padding:const EdgeInsets.all(2),decoration:BoxDecoration(borderRadius:BorderRadius.circular(13),border:Border.all(color:selected==i?green:Colors.transparent,width:2)),child:ClipRRect(borderRadius:BorderRadius.circular(9),child:_BusinessPhoto(photos[i]['url'])))))))),
   const SizedBox(height:16),
   LayoutBuilder(builder:(context,c)=>Wrap(spacing:8,runSpacing:8,children:[
    _DetailStat(value:_pointsLabel(b),label:appText('s1040'),width:(c.maxWidth-8)/2,accent:true),
    _DetailStat(value:_durationLabel(b),label:appText('s1051'),width:(c.maxWidth-8)/2),
   ])),
   const SizedBox(height:14),
   LayoutBuilder(builder:(context,c){final buttons=[FilledButton.icon(key:const Key('gym.book'),onPressed:()=>book(),icon:const Icon(Icons.calendar_month_outlined,size:18),label:Text(appText('s181'))),OutlinedButton.icon(key:const Key('gym.directions'),onPressed:directions,icon:const Icon(Icons.directions_outlined,size:18),label:Text(appText('s632')))];
    return c.maxWidth<310||MediaQuery.textScalerOf(context).scale(14)>20?Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[buttons[0],const SizedBox(height:8),buttons[1]]):Row(children:[Expanded(child:buttons[0]),const SizedBox(width:10),Expanded(child:buttons[1])]);}),
   SectionTitle(appText('s633')),
   Text(description.isEmpty?appText('s1045'):description,style:const TextStyle(fontSize:13,color:muted,height:1.9)),
   if('${b['openingHours']??''}'.trim().isNotEmpty)...[const SizedBox(height:14),_DetailInfo(icon:Icons.schedule_outlined,title:appText('s585'),value:'${b['openingHours']}')],
   if(b['serviceBooking']==true)...[SectionTitle(appText('s1052')),_BranchServiceChips(api:widget.api,branch:b,onBook:book)],
   SectionTitle(appText('s634')),
   ClipRRect(borderRadius:BorderRadius.circular(20),child:SizedBox(height:205,child:FlutterMap(options:MapOptions(initialCenter:point,initialZoom:15),children:[mapTiles(),MarkerLayer(markers:[Marker(point:point,width:124,height:148,alignment:Alignment.topCenter,child:GymMapMarker(branch:b))]),attribution()]))),
   const SizedBox(height:10),_DetailInfo(icon:Icons.location_on_outlined,title:_placeLabel(b),value:'${b['address']??''}'),
   if('${b['contactPhone']??''}'.trim().isNotEmpty)Padding(padding:const EdgeInsets.only(top:12),child:Material(color:Colors.white,borderRadius:BorderRadius.circular(16),child:ListTile(leading:const Icon(Icons.call_outlined,color:green),title:Text(appText('s1053'),style:const TextStyle(fontSize:12,color:muted)),subtitle:Text('${b['contactPhone']}',textDirection:TextDirection.ltr,style:const TextStyle(fontWeight:FontWeight.w700,color:ink)),onTap:()=>launchUrl(Uri(scheme:'tel',path:'${b['contactPhone']}'))))),
   const SizedBox(height:20),Panel(color:ink,padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(appText('s1054'),style:const TextStyle(color:Colors.white,fontWeight:FontWeight.w800)),
    const SizedBox(height:12),for(final entry in [appText('s1055'),appText('s1056'),appText('s1057')].asMap().entries)Padding(padding:const EdgeInsets.only(bottom:10),child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[CircleAvatar(radius:11,backgroundColor:lime,child:Text('${entry.key+1}',style:const TextStyle(fontSize:11,color:ink,fontWeight:FontWeight.w800))),const SizedBox(width:9),Expanded(child:Text(entry.value,style:const TextStyle(color:Colors.white70,fontSize:12,height:1.7)))])),
   ])),
  ])),
 ]);
 }
}
class _DetailStat extends StatelessWidget{
 final String value,label;final double width;final bool accent;
 const _DetailStat({required this.value,required this.label,required this.width,this.accent=false});
 @override Widget build(BuildContext context)=>Container(width:width,padding:const EdgeInsets.symmetric(horizontal:10,vertical:14),decoration:BoxDecoration(color:accent?const Color(0xffe7faf2):Colors.white,borderRadius:BorderRadius.circular(16)),child:Column(children:[Text(value,textAlign:TextAlign.center,style:TextStyle(fontSize:14,fontWeight:FontWeight.w800,color:accent?green:ink)),const SizedBox(height:4),Text(label,textAlign:TextAlign.center,style:const TextStyle(fontSize:11,color:muted))]));
}
class _DetailInfo extends StatelessWidget{
 final IconData icon;final String title,value;
 const _DetailInfo({required this.icon,required this.title,required this.value});
 @override Widget build(BuildContext context)=>Row(crossAxisAlignment:CrossAxisAlignment.start,children:[Icon(icon,color:green,size:19),const SizedBox(width:9),Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(title,style:const TextStyle(fontSize:12,fontWeight:FontWeight.w700)),const SizedBox(height:3),Text(value,style:const TextStyle(fontSize:12,color:muted,height:1.8))]))]);
}
class _BranchServiceChips extends StatefulWidget{
 final ApiClient api;final Json branch;final void Function({String? service}) onBook;
 const _BranchServiceChips({required this.api,required this.branch,required this.onBook});
 @override State<_BranchServiceChips> createState()=>_BranchServiceChipsState();
}
class _BranchServiceChipsState extends State<_BranchServiceChips>{
 List<Json>? services;Object? error;
 @override void initState(){super.initState();unawaited(load());}
 Future<void> load()async{setState(()=>error=null);try{final d=await widget.api.request('directory/branches/${widget.branch['id']}/services');if(mounted)setState(()=>services=rows(d));}catch(e){if(mounted)setState(()=>error=e);}}
 @override Widget build(BuildContext context){AppLanguage.watch(context);
  if(error!=null)return ErrorNote(error,retry:()=>load());
  if(services==null)return const Padding(padding:EdgeInsets.all(20),child:Center(child:CircularProgressIndicator()));
  if(services!.isEmpty)return Text(appText('s268'),style:const TextStyle(color:muted));
  return Wrap(spacing:8,runSpacing:8,children:services!.map((s)=>ActionChip(avatar:const Icon(Icons.check_circle_outline,size:16,color:green),label:Text('${s['name']} · ${s['points']} ${appText('s1058')}'),onPressed:()=>widget.onBook(service:'${s['id']}'))).toList());
 }
}
class _GymGallery extends StatefulWidget{
 final List<Json> photos;final int initial;
 const _GymGallery({required this.photos,required this.initial});
 @override State<_GymGallery> createState()=>_GymGalleryState();
}
class _GymGalleryState extends State<_GymGallery>{
 late final controller=PageController(initialPage:widget.initial);
 @override void dispose(){controller.dispose();super.dispose();}
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Scaffold(backgroundColor:Colors.black,appBar:AppBar(backgroundColor:Colors.black,foregroundColor:Colors.white,title:Text(appText('s1042'))),body:SafeArea(child:PageView.builder(controller:controller,itemCount:widget.photos.length,itemBuilder:(context,i)=>Semantics(label:appText('s1044',[i+1]),child:InteractiveViewer(child:Center(child:_BusinessPhoto(widget.photos[i]['url'],fit:BoxFit.contain)))))));}
}
