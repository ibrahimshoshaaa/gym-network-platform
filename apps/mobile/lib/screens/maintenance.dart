import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/ui.dart';

const repairStatuses = {
  'NEW': 'طلب جديد', 'REVIEWING': 'قيد المراجعة',
  'AWAITING_APPROVAL': 'بانتظار اعتماد التكلفة', 'SCHEDULED': 'تم تحديد الموعد',
  'IN_PROGRESS': 'جارٍ التنفيذ', 'AWAITING_CONFIRMATION': 'بانتظار تأكيد الجيم',
  'COMPLETED': 'مكتمل', 'CANCELLED': 'ملغي',
};
String repairDate(dynamic value) {
  final date = DateTime.tryParse('$value')?.toLocal();
  if (date == null) return 'لم يُحدد';
  return '${date.day}/${date.month}/${date.year} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}
String repairAmount(dynamic value) => value == null ? 'لم تُحدد' : '${money(value)} ج.م';

class MaintenanceScreen extends StatefulWidget {
  final ApiClient api;
  const MaintenanceScreen({super.key, required this.api});
  @override State<MaintenanceScreen> createState() => _MaintenanceScreenState();
}
class _MaintenanceScreenState extends State<MaintenanceScreen> {
  List<Json> branches = [], items = [];
  String? branch, status, cursor;
  bool loading = true, more = false;
  Object? error;
  int generation = 0;
  @override void initState() { super.initState(); load(); }
  Future<void> load({bool next = false}) async {
    if (next && (loading || more || cursor == null)) return;
    final current = next ? generation : ++generation;
    setState(() { error = null; if (next) { more = true; } else { loading = true; items = []; cursor = null; } });
    try {
      final query = Uri(queryParameters: {
        'limit': '20', if (branch != null) 'branchId': branch!,
        if (status != null) 'status': status!, if (next) 'cursor': cursor!,
      }).query;
      final data = await Future.wait([
        widget.api.request('maintenance/requests?$query'),
        if (!next) widget.api.request('maintenance/branches'),
      ]);
      if (mounted && current == generation) setState(() {
        items = next ? [...items, ...rows(data[0])] : rows(data[0]);
        cursor = data[0]['nextCursor'];
        if (!next) branches = rows(data[1]);
      });
    } catch (e) { if (mounted && current == generation) setState(() => error = e); }
    finally { if (mounted && current == generation) setState(() { loading = more = false; }); }
  }
  Future<void> create() async {
    final saved = await open<bool>(context, MaintenanceCreate(api: widget.api, branches: branches, initialBranch: branch));
    if (mounted && saved == true) { setState(() => status = null); await load(); }
  }
  @override Widget build(BuildContext context) => Screen(title: 'الصيانة', child: RefreshIndicator(
    onRefresh: () => load(), child: ListView(physics: const AlwaysScrollableScrollPhysics(), padding: const EdgeInsets.all(18), children: [
      const Text('خلّي فرعك جاهز للتمرين', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
      const SizedBox(height: 8),
      const Text('بلّغ عن العطل، تابع الموعد، وراجع عرض الصيانة قبل التنفيذ.', style: TextStyle(color: muted)),
      const SizedBox(height: 18),
      FilledButton.icon(onPressed: loading || branches.isEmpty ? null : create, icon: const Icon(Icons.add_rounded), label: const Text('طلب صيانة جديد')),
      const SizedBox(height: 20),
      if (branches.isNotEmpty) ...[
        DropdownButtonFormField<String>(key: ValueKey('branch:$branch'), initialValue: branch, isExpanded: true,
          decoration: const InputDecoration(labelText: 'الفرع'), items: [
            const DropdownMenuItem<String>(value: null, child: Text('كل الفروع')),
            ...branches.map((b) => DropdownMenuItem(value: '${b['id']}', child: Text('${b['gymName']} · ${b['name']}', maxLines: 1, overflow: TextOverflow.ellipsis))),
          ], onChanged: (v) { setState(() => branch = v); load(); }),
        const SizedBox(height: 14),
      ],
      DropdownButtonFormField<String>(key: ValueKey('status:$status'), initialValue: status, isExpanded: true,
        decoration: const InputDecoration(labelText: 'حالة الطلب'), items: [
          const DropdownMenuItem<String>(value: null, child: Text('كل الطلبات')),
          ...repairStatuses.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))),
        ], onChanged: (v) { setState(() => status = v); load(); }),
      const SizedBox(height: 18), ErrorNote(error, retry: () => load()),
      if (loading) const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
      else if (error == null && items.isEmpty) EmptyState(branches.isEmpty ? 'مفيش فروع متاحة لحسابك' : 'مفيش طلبات هنا', detail: branches.isEmpty ? 'راجع صاحب الجيم لتعيينك على الفرع.' : 'تقدر تبلغ عن عطل من طلب صيانة جديد.')
      else ...items.map((r) => Padding(padding: const EdgeInsets.only(bottom: 14), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(repairStatuses[r['status']] ?? '', style: const TextStyle(color: green, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8), Text('${r['equipment']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
        Text('${r['branch']['gym']['name']} · ${r['branch']['name']}', style: const TextStyle(color: muted)),
        const SizedBox(height: 10), Text('التكلفة المتوقعة: ${repairAmount(r['estimatedPiasters'])}'),
        if (r['appointmentAt'] != null) Text('الموعد: ${repairDate(r['appointmentAt'])}'),
        const SizedBox(height: 12), OutlinedButton(onPressed: () async {
          await open(context, MaintenanceDetail(api: widget.api, id: '${r['id']}'));
          if (mounted) await load();
        }, child: const Text('تفاصيل الطلب ومتابعته')),
      ])))),
      if (cursor != null) OutlinedButton(onPressed: more ? null : () => load(next: true), child: Text(more ? 'جارٍ التحميل…' : 'عرض المزيد')),
    ]),
  ));
}

class MaintenanceCreate extends StatefulWidget {
  final ApiClient api;
  final List<Json> branches;
  final String? initialBranch;
  const MaintenanceCreate({super.key, required this.api, required this.branches, this.initialBranch});
  @override State<MaintenanceCreate> createState() => _MaintenanceCreateState();
}
class _MaintenanceCreateState extends State<MaintenanceCreate> {
  final form = GlobalKey<FormState>();
  final equipment = TextEditingController(), description = TextEditingController(), phone = TextEditingController();
  final clientKey = newKey();
  late String branch;
  List<Json> images = [];
  bool busy = false;
  Object? error;
  String progress = '';
  @override void initState() { super.initState(); branch = widget.initialBranch ?? '${widget.branches.first['id']}'; phone.text = '${widget.api.user?['phone'] ?? ''}'; }
  @override void dispose() { equipment.dispose(); description.dispose(); phone.dispose(); super.dispose(); }
  Future<void> upload() async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try {
      final files = await ImagePicker().pickMultiImage(imageQuality: 85, maxWidth: 1600);
      if (files.length + images.length > 6) throw Exception('الحد الأقصى ٦ صور');
      for (var i = 0; i < files.length; i++) {
        final bytes = await files[i].readAsBytes();
        if (bytes.length > 4194304) throw Exception('اختار صورة أقل من ٤ ميجابايت');
        if (mounted) setState(() => progress = 'رفع الصورة ${i + 1} من ${files.length}');
        final image = await widget.api.request('maintenance/branches/$branch/assets', method: 'POST', bytes: bytes, mime: 'image/jpeg');
        if (mounted) setState(() => images.add(Map<String, dynamic>.from(image)));
      }
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() { busy = false; progress = ''; }); }
  }
  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
    var number = digits(phone.text).replaceAll(RegExp(r'[\s()-]'), '');
    if (RegExp(r'^01\d{9}$').hasMatch(number)) number = '+20${number.substring(1)}';
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(number)) { setState(() => error = Exception('راجع رقم التواصل')); return; }
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request('maintenance/requests', method: 'POST', body: {
        'clientKey': clientKey, 'branchId': branch, 'equipment': equipment.text.trim(),
        'description': description.text.trim(), 'contactPhone': number,
        'imageIds': images.map((i) => i['id']).toList(),
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Widget field(TextEditingController c, String label, int minimum, int maximum, {int lines = 1}) => Padding(
    padding: const EdgeInsets.only(bottom: 16), child: TextFormField(controller: c, enabled: !busy, maxLines: lines, maxLength: maximum,
      decoration: InputDecoration(labelText: label), validator: (v) => v == null || v.trim().length < minimum ? 'راجع $label' : null));
  @override Widget build(BuildContext context) => Screen(title: 'طلب صيانة جديد', child: Form(key: form, child: ListView(padding: const EdgeInsets.all(20), children: [
    const Text('احكي لنا عن العطل', style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
    const SizedBox(height: 8), const Text('الفحص والتكلفة والموعد هيتحددوا مع إدارة المنصة. التكلفة النهائية تُضاف لمديونية الجيم بعد تأكيد الاستلام وتُخصم من مستحقاته عند السحب.', style: TextStyle(color: muted)),
    const SizedBox(height: 20),
    DropdownButtonFormField<String>(initialValue: branch, isExpanded: true, decoration: const InputDecoration(labelText: 'الفرع'),
      items: widget.branches.map((b) => DropdownMenuItem(value: '${b['id']}', child: Text('${b['gymName']} · ${b['name']}', maxLines: 1, overflow: TextOverflow.ellipsis))).toList(),
      onChanged: busy || images.isNotEmpty ? null : (v) => setState(() => branch = v!)),
    if (images.isNotEmpty) const Text('لتغيير الفرع، احذف الصور المرفوعة أولًا.', style: TextStyle(color: muted, fontSize: 12)),
    const SizedBox(height: 16), field(equipment, 'اسم الجهاز أو المعدة', 3, 100),
    field(description, 'وصف العطل', 10, 3000, lines: 5), field(phone, 'رقم التواصل', 8, 20),
    OutlinedButton.icon(onPressed: busy || images.length >= 6 ? null : upload,
      icon: const Icon(Icons.add_photo_alternate_outlined), label: Text(progress.isEmpty ? 'صور العطل (${images.length}/6) — اختياري' : progress)),
    if (images.isNotEmpty) SizedBox(height: 130, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: images.length,
      separatorBuilder: (_, _) => const SizedBox(width: 8), itemBuilder: (_, i) => SizedBox(width: 110, child: Stack(fit: StackFit.expand, children: [
        ClipRRect(borderRadius: BorderRadius.circular(14), child: Image.network('${images[i]['publicUrl']}', fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined))),
        Positioned(top: 0, left: 0, child: IconButton.filledTonal(tooltip: 'حذف الصورة', onPressed: busy ? null : () => setState(() => images.removeAt(i)), icon: const Icon(Icons.close_rounded))),
      ])))),
    const SizedBox(height: 18), ErrorNote(error), ActionButton('إرسال طلب الصيانة', busy: busy, onPressed: busy ? null : submit),
  ])));
}

class MaintenanceDetail extends StatefulWidget {
  final ApiClient api;
  final String id;
  const MaintenanceDetail({super.key, required this.api, required this.id});
  @override State<MaintenanceDetail> createState() => _MaintenanceDetailState();
}
class _MaintenanceDetailState extends State<MaintenanceDetail> {
  int revision = 0;
  bool busy = false;
  Object? error;
  Future<void> act(Json r, String action) async {
    var reason = ''; 
    final needsReason = ['REJECT_QUOTE', 'CANCEL', 'REOPEN'].contains(action);
    final label = {'APPROVE': 'اعتماد التكلفة والموعد', 'CONFIRM': 'تأكيد استلام الصيانة', 'CANCEL': 'إلغاء الطلب', 'REOPEN': 'الإبلاغ أن العطل مستمر', 'REJECT_QUOTE': 'رفض العرض'}[action]!;
    final confirmed = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: Text(label), content: Column(mainAxisSize: MainAxisSize.min, children: [
      Text(action == 'APPROVE' ? 'التكلفة: ${repairAmount(r['estimatedPiasters'])}\nالموعد: ${repairDate(r['appointmentAt'])}\nالتكلفة النهائية بعد تأكيد الاستلام تُسجل مديونية وتُخصم من مستحقات الجيم عند السحب.' : action == 'CONFIRM' ? 'هل تم إصلاح العطل واستلام الجهاز؟\nالتكلفة النهائية: ${repairAmount(r['finalPiasters'])}\nبالتأكيد تُضاف التكلفة لمديونية الجيم وتُخصم من مستحقاته عند السحب.' : 'اكتب السبب ليظهر لإدارة المنصة.'),
      if (needsReason) TextField(onChanged: (value) => reason = value, maxLength: 1000, maxLines: 3, decoration: const InputDecoration(labelText: 'السبب')),
    ]), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('رجوع')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('تأكيد'))]));
    final note = reason.trim();
    if (confirmed != true || !mounted) return;
    if (needsReason && note.length < 3) { setState(() => error = Exception('اكتب سببًا أوضح')); return; }
    setState(() { busy = true; error = null; });
    try { await widget.api.request('maintenance/requests/${widget.id}/action', method: 'POST', body: {'action': action, 'expectedVersion': r['version'], if (needsReason) 'note': note}); if (mounted) setState(() => revision++); }
    catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Widget fact(String title, String value) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: muted, fontSize: 12)), Text(value, style: const TextStyle(fontWeight: FontWeight.w700))]));
  @override Widget build(BuildContext context) => Screen(title: 'تفاصيل الصيانة', actions: [IconButton(tooltip: 'تحديث الطلب', onPressed: busy ? null : () => setState(() => revision++), icon: const Icon(Icons.refresh_rounded))],
    child: DataView(key: ValueKey(revision), load: () => widget.api.request('maintenance/requests/${widget.id}'), builder: (data, reload) {
      final r = Map<String, dynamic>.from(data), images = r['images'] as List? ?? [], events = r['events'] as List? ?? [];
      final canApprove = r['canApprove'] == true, status = '${r['status']}';
      return ListView(padding: const EdgeInsets.all(20), children: [
        Text(repairStatuses[status] ?? status, style: const TextStyle(color: green, fontWeight: FontWeight.w800)), const SizedBox(height: 10),
        Text('${r['equipment']}', style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
        Text('${r['branch']['gym']['name']} · ${r['branch']['name']}', style: const TextStyle(color: muted)),
        const SectionTitle('وصف العطل'), Text('${r['description']}', style: const TextStyle(height: 1.8)),
        if (images.isNotEmpty) SizedBox(height: 190, child: ListView.separated(scrollDirection: Axis.horizontal, itemCount: images.length, separatorBuilder: (_, _) => const SizedBox(width: 10), itemBuilder: (_, i) => SizedBox(width: 220, child: ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network('${images[i]['publicUrl']}', fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined)))))),
        const SectionTitle('العرض والمتابعة'), Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          fact('التكلفة المتوقعة', repairAmount(r['estimatedPiasters'])), fact('التكلفة المعتمدة', repairAmount(r['approvedPiasters'])),
          fact('التكلفة النهائية', repairAmount(r['finalPiasters'])), fact('موعد الصيانة', repairDate(r['appointmentAt'])),
          if (r['technicianName'] != null) fact('مسؤول الصيانة', '${r['technicianName']}'),
          if (r['technicianPhone'] != null) OutlinedButton.icon(onPressed: () => launchUrl(Uri(scheme: 'tel', path: '${r['technicianPhone']}')), icon: const Icon(Icons.call_outlined), label: const Text('اتصل بمسؤول الصيانة')),
        ])),
        if (r['workSummary'] != null) ...[const SectionTitle('الأعمال المنفذة'), Text('${r['workSummary']}')],
        const SizedBox(height: 18), ErrorNote(error),
        if (canApprove && status == 'AWAITING_APPROVAL') ...[
          ActionButton('اعتماد التكلفة والموعد', busy: busy, onPressed: busy ? null : () => act(r, 'APPROVE')),
          TextButton(onPressed: busy ? null : () => act(r, 'REJECT_QUOTE'), child: const Text('رفض العرض مع توضيح السبب')),
        ],
        if (canApprove && status == 'AWAITING_CONFIRMATION') ...[
          ActionButton('تأكيد استلام الصيانة', busy: busy, onPressed: busy ? null : () => act(r, 'CONFIRM')),
          TextButton(onPressed: busy ? null : () => act(r, 'REOPEN'), child: const Text('العطل لسه موجود')),
        ],
        if (canApprove && ['NEW', 'REVIEWING', 'AWAITING_APPROVAL', 'SCHEDULED'].contains(status)) TextButton(onPressed: busy ? null : () => act(r, 'CANCEL'), child: const Text('إلغاء طلب الصيانة')),
        if (!canApprove) const Text('اعتماد التكلفة والاستلام لصاحب الجيم أو المدير المفوّض بصلاحيات كاملة.', style: TextStyle(color: muted, fontSize: 12)),
        const SectionTitle('سجل الطلب'),
        ...events.map((e) => Padding(padding: const EdgeInsets.only(bottom: 14), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(repairStatuses[e['status']] ?? '${e['status']}', style: const TextStyle(fontWeight: FontWeight.w800)), Text('${e['note']}'),
          if (e['data']?['estimatedPiasters'] != null) Text('العرض: ${repairAmount(e['data']['estimatedPiasters'])}'),
          if (e['data']?['finalPiasters'] != null) Text('النهائي: ${repairAmount(e['data']['finalPiasters'])}'),
          Text('${e['actor']['displayName']} · ${repairDate(e['createdAt'])}', style: const TextStyle(color: muted, fontSize: 11)),
        ])))),
      ]);
    }));
}
