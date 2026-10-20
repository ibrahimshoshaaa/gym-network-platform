import 'campaigns.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';

Future<Position> currentPosition() async {
  if (!await Geolocator.isLocationServiceEnabled())
    throw Exception('شغّل خدمة الموقع في الموبايل وحاول تاني.');
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  if (p == LocationPermission.denied || p == LocationPermission.deniedForever)
    throw Exception(
      'السماح بالموقع غير متاح. تقدر تبحث بالاسم والمنطقة أو تختار المكان على الخريطة.',
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
  const DirectoryScreen({super.key, required this.api});
  @override
  State<DirectoryScreen> createState() => _DirectoryScreenState();
}

class _DirectoryScreenState extends State<DirectoryScreen> {
  final search = TextEditingController(), maxPrice = TextEditingController();
  List<Json> branches = [];
  String? cursor;
  Position? location;
  bool busy = false, map = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    search.dispose();
    maxPrice.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final query = {
        'limit': '25',
        if (search.text.trim().isNotEmpty) 'q': search.text.trim(),
        if (maxPrice.text.isNotEmpty) 'maxPrice': digits(maxPrice.text),
        if (location != null) ...{
          'latitude': '${location!.latitude}',
          'longitude': '${location!.longitude}',
        },
        if (more && cursor != null) 'cursor': cursor!,
      };
      final d = await widget.api.request(
        'directory/branches?${Uri(queryParameters: query).query}',
      );
      if (mounted)
        setState(() {
          branches = more ? [...branches, ...rows(d)] : rows(d);
          cursor = d['nextCursor'];
          error = null;
        });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> nearby() async {
    if (busy) return;
    setState(() => busy = true);
    try {
      location = await currentPosition();
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
    if (location != null) await load();
  }

  void clearFilters() {
    if (busy) return;
    search.clear();
    maxPrice.clear();
    setState(() => location = null);
    load();
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () => load(),
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        const TraineeSectionHeader('اكتشف جيمك', subtitle: 'اختار المكان المناسب وشوف نقاط الزيارة.'),
        TextField(
          controller: search,
          onSubmitted: (_) => load(),
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'اسم الجيم، المدينة أو المنطقة',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: IconButton(
              tooltip: 'بحث',
              onPressed: busy ? null : () => load(),
              icon: const Icon(Icons.arrow_back_rounded),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: busy ? null : nearby,
                icon: const Icon(Icons.near_me_rounded, size: 18),
                label: Text(location == null ? 'الأقرب لموقعي' : 'تحديث موقعي'),
              ),
            ),
            const SizedBox(width: 10),
            IconButton.filledTonal(
              tooltip: map ? 'عرض القائمة' : 'عرض الخريطة',
              onPressed: () => setState(() => map = !map),
              icon: Icon(map ? Icons.view_list_rounded : Icons.map_outlined),
            ),
          ],
        ),
        if (location != null)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () {
                setState(() => location = null);
                load();
              },
              child: const Text('إلغاء ترتيب المسافة'),
            ),
          ),
        ExpansionTile(
          dense: true,
          visualDensity: VisualDensity.compact,
          tilePadding: EdgeInsets.zero,
          title: const Text(
            'تصفية بسعر الزيارة',
            style: TextStyle(fontSize: 13),
          ),
          children: [
            TextField(
              controller: maxPrice,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'أقصى عدد نقاط للزيارة',
              ),
            ),
            TextButton(
              onPressed: busy ? null : () => load(),
              child: const Text('تطبيق'),
            ),
          ],
        ),
        CampaignBanner(api:widget.api,placement:'GYMS'),
        ErrorNote(error, retry: () => load()),
        if (search.text.isNotEmpty ||
            maxPrice.text.isNotEmpty ||
            location != null)
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(
              onPressed: busy ? null : clearFilters,
              icon: const Icon(Icons.filter_alt_off_outlined, size: 18),
              label: const Text('مسح الفلاتر'),
            ),
          ),
        if (busy && branches.isEmpty)
          const Padding(
            padding: EdgeInsets.all(40),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (!busy && branches.isEmpty && error == null)
          EmptyState(
            'مفيش فروع مطابقة',
            detail: 'جرّب منطقة مختلفة أو قلّل الفلاتر.',
            action: OutlinedButton(
              onPressed: clearFilters,
              child: const Text('عرض كل الجيمات'),
            ),
          ),
        if (map && branches.isNotEmpty)
          SizedBox(
            height: 330,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: FlutterMap(
                key: ValueKey(branches.first['id']),
                options: MapOptions(
                  initialCenter: pointOf(branches.first),
                  initialZoom: 12,
                ),
                children: [
                  mapTiles(),
                  MarkerLayer(
                    markers: branches
                        .map(
                          (b) => Marker(
                            point: pointOf(b),
                            width: 124,
                            height: 148,
                            alignment: Alignment.topCenter,
                            child: GymMapMarker(
                              branch: b,
                              onTap: () => open(context,
                                BranchDetail(api: widget.api, id: b['id'])),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                  attribution(),
                ],
              ),
            ),
          ),
        const SizedBox(height: 14),
        ...branches.map(
          (b) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: BranchTile(
              branch: b,
              onTap: () =>
                  open(context, BranchDetail(api: widget.api, id: b['id'])),
            ),
          ),
        ),
        if (cursor != null)
          OutlinedButton(
            onPressed: busy ? null : () => load(more: true),
            child: Text(busy ? '…' : 'تحميل المزيد'),
          ),
      ],
    ),
  );
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
    final name='${branch['gym']?['name'] ?? branch['name'] ?? 'جيم'}';
    return Semantics(button:onTap!=null,label:'$name، ${branch['name'] ?? ''}',
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

class BranchTile extends StatelessWidget {
  final Json branch;
  final VoidCallback onTap;
  const BranchTile({super.key,required this.branch,required this.onTap});
  @override
  Widget build(BuildContext context)=>Material(
    color:Colors.white,borderRadius:BorderRadius.circular(22),clipBehavior:Clip.antiAlias,
    child:InkWell(onTap:onTap,child:Padding(
      padding:const EdgeInsets.all(16),
      child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
          GymThumbnail(branch:branch,size:62),
          const SizedBox(width:12),
          Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
            Text('${branch['gym']?['name'] ?? branch['name']}',
              style:const TextStyle(fontSize:16,fontWeight:FontWeight.w800)),
            const SizedBox(height:3),
            Text('${branch['name']}',style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.w600)),
            const SizedBox(height:3),
            Text('${branch['city']} · ${branch['governorate']}',
              style:const TextStyle(color:muted,fontSize:11)),
          ])),
        ]),
        const SizedBox(height:14),
        Wrap(spacing:8,runSpacing:8,children:[
          _DirectoryChip('${branch['visitPricePoints']} نقطة / زيارة',Icons.toll_rounded,primary:true),
          _DirectoryChip('${branch['sessionMinutes']} دقيقة',Icons.schedule_rounded),
          if(branch['distanceKm']!=null)
            _DirectoryChip('${(branch['distanceKm'] as num).toStringAsFixed(1)} كم',Icons.near_me_outlined),
        ]),
        const SizedBox(height:12),
        const Row(children:[
          Expanded(child:Text('تفاصيل الجيم والاتجاهات',
            style:TextStyle(color:green,fontSize:12,fontWeight:FontWeight.w700))),
          Icon(Icons.arrow_back_rounded,size:17,color:green),
        ]),
      ]),
    )),
  );
}
class _DirectoryChip extends StatelessWidget {
 final String text;
 final IconData icon;
 final bool primary;
 const _DirectoryChip(this.text,this.icon,{this.primary=false});
 @override Widget build(BuildContext context)=>Container(
  padding:const EdgeInsets.symmetric(horizontal:10,vertical:7),
  decoration:BoxDecoration(color:primary?const Color(0xffe3fbf3):canvas,
    borderRadius:BorderRadius.circular(10)),
  child:Row(mainAxisSize:MainAxisSize.min,children:[
    Icon(icon,size:14,color:green),const SizedBox(width:5),
    Flexible(child:Text(text,style:TextStyle(fontSize:11,color:primary?green:ink,fontWeight:FontWeight.w600))),
  ]));
}

class BranchDetail extends StatelessWidget {
  final ApiClient api;
  final String id;
  const BranchDetail({super.key, required this.api, required this.id});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'تفاصيل الجيم',
    child: DataView(
      load: () => api.request('directory/branches/$id'),
      builder: (d, reload) {
        final b = Map<String, dynamic>.from(d['branch']), p = pointOf(b);
        return ListView(
          padding: const EdgeInsets.all(22),
          children: [
            BranchTile(branch: b, onTap: () {}),
            const SectionTitle('عن المكان'),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${b['gym']?['description'] ?? ''}'),
                  Fact('العنوان', '${b['address']}'),
                  if (b['openingHours'] != null)
                    Fact('مواعيد العمل', '${b['openingHours']}'),
                  if (b['contactPhone'] != null)
                    TextButton.icon(
                      onPressed: () => launchUrl(
                        Uri(scheme: 'tel', path: '${b['contactPhone']}'),
                      ),
                      icon: const Icon(Icons.call_outlined),
                      label: Text(
                        '${b['contactPhone']}',
                        textDirection: TextDirection.ltr,
                      ),
                    ),
                ],
              ),
            ),
            const SectionTitle('الموقع'),
            SizedBox(
              height: 230,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(24),
                child: FlutterMap(
                  options: MapOptions(initialCenter: p, initialZoom: 15),
                  children: [
                    mapTiles(),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: p, width:124, height:148,
                          alignment:Alignment.topCenter,
                          child:GymMapMarker(branch:b),
                        ),
                      ],
                    ),
                    attribution(),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 18),
            ActionButton(
              'افتح الاتجاهات',
              icon: Icons.directions_outlined,
              onPressed: () => launchUrl(
                Uri.https('www.google.com', '/maps/dir/', {
                  'api': '1',
                  'destination': '${p.latitude},${p.longitude}',
                }),
                mode: LaunchMode.externalApplication,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'الدخول من خلال رمزك الشخصي عند الكاشير. سعر الزيارة يُراجع وقت تسجيل الحضور.',
              style: TextStyle(color: muted, fontSize: 12),
            ),
            ...((b['images'] as List? ?? [])
                .skip(1)
                .map(
                  (p) => Padding(
                    padding: const EdgeInsets.only(top: 14),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: Image.network(
                        p['url'],
                        fit: BoxFit.cover,
                        errorBuilder: (_, e, s) => const SizedBox.shrink(),
                      ),
                    ),
                  ),
                )),
          ],
        );
      },
    ),
  );
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
  Widget build(BuildContext context) => Screen(
    title: 'حدد مكان الفرع',
    child: Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          child: Column(
            children: [
              const Text(
                'اضغط على مكان الفرع على الخريطة. تقدر تستخدم موقعك الحالي وتعدّله.',
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
                label: Text(busy ? 'بنحدد موقعك…' : 'استخدم موقعي الحالي'),
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
            'تأكيد المكان المحدد',
            onPressed: selected == null
                ? null
                : () => Navigator.pop(context, selected),
            icon: Icons.check_rounded,
          ),
        ),
      ],
    ),
  );
}
