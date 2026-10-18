import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/ui.dart';

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

  @override
  Widget build(BuildContext context) => RefreshIndicator(
    onRefresh: () => load(),
    child: ListView(
      padding: const EdgeInsets.fromLTRB(22, 14, 22, 30),
      children: [
        Text(
          'تمرينك أقرب مما تتخيل',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 8),
        const Text(
          'اختار الجيم المناسب ليك وشوف سعر الزيارة قبل ما تروح.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 20),
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
        ErrorNote(error, retry: () => load()),
        if (busy && branches.isEmpty)
          const Padding(
            padding: EdgeInsets.all(40),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (!busy && branches.isEmpty && error == null)
          const EmptyState(
            'مفيش فروع مطابقة',
            detail: 'جرّب منطقة مختلفة أو قلّل الفلاتر.',
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
                            width: 50,
                            height: 50,
                            child: IconButton(
                              tooltip: '${b['name']}',
                              icon: const Icon(
                                Icons.location_on_rounded,
                                color: green,
                                size: 38,
                              ),
                              onPressed: () => open(
                                context,
                                BranchDetail(api: widget.api, id: b['id']),
                              ),
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

class BranchTile extends StatelessWidget {
  final Json branch;
  final VoidCallback onTap;
  const BranchTile({super.key, required this.branch, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final photos = branch['images'] as List? ?? [];
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(25),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (photos.isNotEmpty)
              Image.network(
                photos.first['url'],
                height: 150,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, e, s) => const SizedBox(
                  height: 100,
                  child: Center(
                    child: Icon(
                      Icons.fitness_center_rounded,
                      color: green,
                      size: 40,
                    ),
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${branch['gym']?['name'] ?? ''}',
                          style: const TextStyle(color: muted, fontSize: 11),
                        ),
                      ),
                      if (branch['distanceKm'] != null)
                        Text(
                          '${(branch['distanceKm'] as num).toStringAsFixed(1)} كم',
                          style: const TextStyle(
                            color: green,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                    ],
                  ),
                  Text(
                    '${branch['name']}',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${branch['city']} · ${branch['governorate']}',
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: lime,
                          borderRadius: BorderRadius.circular(9),
                        ),
                        child: Text(
                          '${branch['visitPricePoints']} نقطة',
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Icon(
                        Icons.schedule_rounded,
                        size: 16,
                        color: muted,
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          '${branch['sessionMinutes']} دقيقة',
                          style: const TextStyle(color: muted, fontSize: 12),
                        ),
                      ),
                      const Icon(
                        Icons.arrow_back_rounded,
                        size: 18,
                        color: green,
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
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
                          point: p,
                          child: const Icon(
                            Icons.location_on_rounded,
                            size: 38,
                            color: green,
                          ),
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
