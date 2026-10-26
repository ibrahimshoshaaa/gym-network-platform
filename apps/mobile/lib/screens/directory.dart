import 'dart:async';
import '../l10n/language.dart';
import 'campaigns.dart';
import 'bookings.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/ui.dart';

part 'directory_presentation.dart';

Future<Position> currentPosition() async {
  if (!await Geolocator.isLocationServiceEnabled())
    throw Exception(appText('s607'));
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  if (p == LocationPermission.denied || p == LocationPermission.deniedForever)
    throw Exception(
      appText('s608'),
    );
  return Geolocator.getCurrentPosition(
    locationSettings: const LocationSettings(
      accuracy: LocationAccuracy.high,
      timeLimit: Duration(seconds: 20),
    ),
  );
}

Widget mapTiles() => TileLayer(
  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  userAgentPackageName: 'net.shotech.gym_network',
  maxZoom: 19,
);
Widget attribution() => RichAttributionWidget(
  attributions: [
    TextSourceAttribution(
      'OpenStreetMap contributors',
      onTap: () => launchUrl(
        Uri.parse('https://www.openstreetmap.org/copyright'),
        mode: LaunchMode.externalApplication,
      ),
    ),
  ],
);
LatLng pointOf(Json b) =>
    LatLng(double.parse('${b['latitude']}'), double.parse('${b['longitude']}'));

class DirectoryScreen extends StatefulWidget {
  final ApiClient api;
  final Future<Position> Function()? locate;
  const DirectoryScreen({super.key, required this.api, this.locate});
  @override State<DirectoryScreen> createState() => _DirectoryScreenState();
}
class _DirectoryScreenState extends State<DirectoryScreen> {
 final search=TextEditingController();
 List<Json> branches=[];
 final Set<String> regions={};
 String? cursor,governorate;
 String maxPrice='',city='';
 Position? location;
 bool busy=false,map=false;
 Object? error;
 Timer? debounce;
 int generation=0, locationGeneration=0;
 @override void initState(){super.initState();unawaited(load());}
 @override void dispose(){generation++;locationGeneration++;debounce?.cancel();search.dispose();super.dispose();}
 Future<void> load({bool more=false})async{
  if(more&&(busy||cursor==null))return;
  final request=++generation;
  setState((){busy=true;error=null;});
  try{
   final query={'limit':'25',if(search.text.trim().isNotEmpty)'q':search.text.trim(),
    if(maxPrice.isNotEmpty)'maxPrice':maxPrice,if(governorate!=null)'governorate':governorate!,if(city.isNotEmpty)'city':city,
    if(location!=null)...{'latitude':'${location!.latitude}','longitude':'${location!.longitude}'},
    if(more&&cursor!=null)'cursor':cursor!};
   final d=await widget.api.request('directory/branches?${Uri(queryParameters:query).query}');
   if(!mounted||request!=generation)return;
   final received=rows(d);
   setState((){
    branches=more?{for(final b in [...branches,...received])'${b['id']}':b}.values.toList():received;
    regions.addAll(received.map((b)=>'${b['governorate']??''}').where((s)=>s.isNotEmpty));
    cursor=d['nextCursor'];
   });
  }catch(e){if(mounted&&request==generation)setState(()=>error=e);}
  finally{if(mounted&&request==generation)setState(()=>busy=false);}
 }
 Future<void> nearby()async{
  if(busy)return;
  final request=++locationGeneration;
  setState((){busy=true;error=null;});
  try{
   final result=await (widget.locate??currentPosition)();
   if(!mounted||request!=locationGeneration)return;
   setState(()=>location=result);
   await load();
  }catch(e){if(mounted&&request==locationGeneration)setState(()=>error=e);}
  finally{if(mounted&&request==locationGeneration)setState(()=>busy=false);}
 }
 void clearFilters(){locationGeneration++;debounce?.cancel();search.clear();setState((){maxPrice='';city='';governorate=null;location=null;});unawaited(load());}
 Future<void> filters()async{
  final result=await showModalBottomSheet<Map<String,String>>(context:context,isScrollControlled:true,useSafeArea:true,
   builder:(_)=>_DirectoryFilters(price:maxPrice,region:governorate??'',city:city));
  if(!mounted||result==null)return;
  debounce?.cancel();setState((){maxPrice=result['price']!;governorate=result['region']!.isEmpty?null:result['region'];city=result['city']!;if(governorate!=null)regions.add(governorate!);});await load();
 }
 @override Widget build(BuildContext context){AppLanguage.watch(context);
  final filtered=maxPrice.isNotEmpty||city.isNotEmpty||governorate!=null||search.text.isNotEmpty||location!=null;
  return RefreshIndicator(onRefresh:()=>load(),child:ListView(
   key:const PageStorageKey('trainee.directory'),physics:const AlwaysScrollableScrollPhysics(),padding:const EdgeInsets.fromLTRB(16,8,16,28),children:[
    Wrap(alignment:WrapAlignment.spaceBetween,crossAxisAlignment:WrapCrossAlignment.center,spacing:12,runSpacing:8,children:[
     Text(appText('s609'),style:const TextStyle(fontSize:22,fontWeight:FontWeight.w800)),
     OutlinedButton.icon(key:const Key('directory.map'),onPressed:()=>setState(()=>map=!map),icon:Icon(map?Icons.view_list_outlined:Icons.map_outlined,size:17),label:Text(map?appText('s615'):appText('s616')),style:OutlinedButton.styleFrom(minimumSize:const Size(0,42),padding:const EdgeInsets.symmetric(horizontal:12),textStyle:Theme.of(context).textTheme.labelLarge?.copyWith(fontSize:12,fontWeight:FontWeight.w600))),
    ]),
    const SizedBox(height:14),
    Row(children:[Expanded(child:TextField(key:const Key('directory.search'),controller:search,maxLength:80,
     onChanged:(_){setState((){});debounce?.cancel();debounce=Timer(const Duration(milliseconds:400),()=>load());},
     onSubmitted:(_){debounce?.cancel();unawaited(load());},textInputAction:TextInputAction.search,
     decoration:InputDecoration(counterText:'',hintText:appText('s611'),prefixIcon:const Icon(Icons.search_rounded),
      suffixIcon:search.text.isEmpty?null:IconButton(tooltip:appText('s1047'),onPressed:(){search.clear();debounce?.cancel();unawaited(load());},icon:const Icon(Icons.close_rounded,size:18))))),
     const SizedBox(width:8),IconButton.filledTonal(key:const Key('directory.filters'),tooltip:appText('s618'),onPressed:filters,icon:Badge(isLabelVisible:maxPrice.isNotEmpty||city.isNotEmpty||governorate!=null,child:const Icon(Icons.tune_rounded))),
    ]),
    const SizedBox(height:10),
    SingleChildScrollView(scrollDirection:Axis.horizontal,child:Row(children:[
     ChoiceChip(label:Text(appText('s1038')),selected:governorate==null,onSelected:(_){debounce?.cancel();setState(()=>governorate=null);unawaited(load());}),
     for(final region in regions)...[const SizedBox(width:7),ChoiceChip(label:Text(region),selected:governorate==region,onSelected:(_){debounce?.cancel();setState(()=>governorate=region);unawaited(load());})],
    ])),
    const SizedBox(height:10),
    Wrap(spacing:8,runSpacing:6,crossAxisAlignment:WrapCrossAlignment.center,children:[
     OutlinedButton.icon(key:const Key('directory.nearby'),onPressed:busy?null:nearby,icon:Icon(location==null?Icons.near_me_outlined:Icons.my_location_rounded,size:17),label:Text(location==null?appText('s613'):appText('s614')),style:OutlinedButton.styleFrom(textStyle:Theme.of(context).textTheme.labelLarge?.copyWith(fontSize:12),foregroundColor:green)),
     if(filtered)TextButton.icon(onPressed:clearFilters,icon:const Icon(Icons.filter_alt_off_outlined,size:16),label:Text(appText('s621'),style:const TextStyle(fontSize:12))),
    ]),
    if(maxPrice.isNotEmpty||city.isNotEmpty)Padding(padding:const EdgeInsets.only(top:8),child:Wrap(spacing:6,runSpacing:6,children:[if(maxPrice.isNotEmpty)_DirectoryChip(appText('s1048',[maxPrice]),Icons.toll_outlined),if(city.isNotEmpty)_DirectoryChip(city,Icons.place_outlined)])),
    CampaignBanner(api:widget.api,placement:'GYMS'),
    ErrorNote(error,retry:()=>load()),
    const SizedBox(height:8),
    Text(appText('s1039',[branches.length]),style:const TextStyle(color:muted,fontSize:12)),
    const SizedBox(height:10),
    if(busy)const LinearProgressIndicator(minHeight:2),
    if(!busy&&branches.isEmpty&&error==null)EmptyState(appText('s622'),detail:appText('s623'),action:OutlinedButton(onPressed:clearFilters,child:Text(appText('s624')))),
    if(map&&branches.isNotEmpty)Padding(padding:const EdgeInsets.only(bottom:14),child:SizedBox(height:350,child:ClipRRect(borderRadius:BorderRadius.circular(22),child:FlutterMap(
     key:ValueKey(branches.first['id']),options:MapOptions(initialCenter:pointOf(branches.first),initialZoom:12),children:[mapTiles(),MarkerLayer(markers:branches.map((b)=>Marker(point:pointOf(b),width:124,height:148,alignment:Alignment.topCenter,child:GymMapMarker(branch:b,onTap:()=>open(context,BranchDetail(api:widget.api,id:b['id']))))).toList()),attribution()],
    )))),
    ...branches.map((b)=>Padding(padding:const EdgeInsets.only(bottom:12),child:BranchTile(branch:b,onTap:()=>open(context,BranchDetail(api:widget.api,id:b['id']))))),
    if(cursor!=null)OutlinedButton(onPressed:busy?null:()=>load(more:true),child:Text(busy?'…':appText('s104'))),
   ]));
 }
}

/// Prefer the gym identity image, then a branch photo. Invalid/missing images
/// always fall back to a local mark so the map remains usable.
String? gymThumbnail(Json branch) {
  final images = (branch['images'] as List? ?? []).whereType<Map>();
  final ordered = [...images.where((p)=>p['purpose']=='LOGO'),
    ...images.where((p)=>p['purpose']!='LOGO')];
  for(final image in ordered) {
    final raw=image['url'];
    if(raw is String && Uri.tryParse(raw)?.scheme=='https') return raw;
  }
  return null;
}

class GymThumbnail extends StatelessWidget {
  final Json branch;
  final double size;
  const GymThumbnail({super.key,required this.branch,this.size=54});
  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final url=gymThumbnail(branch);
    final fallback=Container(color:const Color(0xffe3fbf3),
      alignment:Alignment.center,
      child:const Icon(Icons.fitness_center_rounded,color:green,size:26));
    return ClipRRect(borderRadius:BorderRadius.circular(15),
      child:SizedBox(width:size,height:size,child:url==null?fallback:Image.network(
        url,fit:BoxFit.cover,excludeFromSemantics:true,
        errorBuilder:(_,error,stack)=>fallback,
        loadingBuilder:(_,child,progress)=>progress==null?child:fallback,
      )));
  }
}

class GymMapMarker extends StatelessWidget {
  final Json branch;
  final VoidCallback? onTap;
  const GymMapMarker({super.key,required this.branch,this.onTap});
  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final name='${branch['gym']?['name'] ?? branch['name'] ?? appText('s1007')}';
    return Semantics(button:onTap!=null,label:appText('s625', [name, branch['name'] ?? '']),
      child:GestureDetector(
        behavior:HitTestBehavior.opaque,onTap:onTap,
        child:Column(mainAxisAlignment:MainAxisAlignment.end,children:[
          Container(
            constraints:const BoxConstraints(maxWidth:120),
            padding:const EdgeInsets.symmetric(horizontal:8,vertical:4),
            decoration:BoxDecoration(color:ink,borderRadius:BorderRadius.circular(9),
              boxShadow:const [BoxShadow(color:Color(0x18000000),blurRadius:8,offset:Offset(0,3))]),
            child:Text(name,maxLines:2,overflow:TextOverflow.ellipsis,textAlign:TextAlign.center,
              style:const TextStyle(color:Colors.white,fontSize:10,height:1.35,fontWeight:FontWeight.w700)),
          ),
          const SizedBox(height:5),
          Container(padding:const EdgeInsets.all(3),
            decoration:BoxDecoration(color:Colors.white,borderRadius:BorderRadius.circular(18),
              border:Border.all(color:green,width:2),
              boxShadow:const [BoxShadow(color:Color(0x22000000),blurRadius:12,offset:Offset(0,4))]),
            child:GymThumbnail(branch:branch,size:46)),
          Container(width:8,height:8,margin:const EdgeInsets.only(top:3),
            decoration:const BoxDecoration(color:green,shape:BoxShape.circle)),
        ]),
      ));
  }
}

class BranchDetail extends StatelessWidget {
 final ApiClient api;
 final String id;
 const BranchDetail({super.key,required this.api,required this.id});
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Screen(title:appText('s631'),child:DataView(
  load:()=>api.request('directory/branches/$id'),builder:(d,reload)=>_BranchDetailBody(api:api,branch:Map<String,dynamic>.from(d['branch'])),
 ));}
}

class LocationPicker extends StatefulWidget {
  final LatLng? initial;
  const LocationPicker({super.key, this.initial});
  @override
  State<LocationPicker> createState() => _LocationPickerState();
}

class _LocationPickerState extends State<LocationPicker> {
  late LatLng? selected = widget.initial;
  final controller = MapController();
  bool busy = false;
  Object? error;
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s635'),
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          child: Column(
            children: [
              Text(
                appText('s636'),
              ),
              ErrorNote(error),
              TextButton.icon(
                onPressed: busy
                    ? null
                    : () async {
                        setState(() => busy = true);
                        try {
                          final p = await currentPosition();
                          final point = LatLng(p.latitude, p.longitude);
                          if (mounted) setState(() => selected = point);
                          controller.move(point, 17);
                        } catch (e) {
                          if (mounted) setState(() => error = e);
                        } finally {
                          if (mounted) setState(() => busy = false);
                        }
                      },
                icon: const Icon(Icons.my_location_rounded),
                label: Text(busy ? appText('s637') : appText('s638')),
              ),
            ],
          ),
        ),
        Expanded(
          child: FlutterMap(
            mapController: controller,
            options: MapOptions(
              initialCenter: selected ?? const LatLng(30.5, 31),
              initialZoom: selected == null ? 7 : 16,
              onTap: (_, point) => setState(() => selected = point),
            ),
            children: [
              mapTiles(),
              if (selected != null)
                MarkerLayer(
                  markers: [
                    Marker(
                      point: selected!,
                      width: 48,
                      height: 48,
                      child: const Icon(
                        Icons.location_on_rounded,
                        size: 45,
                        color: green,
                      ),
                    ),
                  ],
                ),
              attribution(),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(22),
          child: ActionButton(
            appText('s639'),
            onPressed: selected == null
                ? null
                : () => Navigator.pop(context, selected),
            icon: Icons.check_rounded,
          ),
        ),
      ],
    ),
  ); }
}
