import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

bool _hasPending(Json service) => (service['requests'] as List? ?? []).any((r) => r['status'] == 'PENDING');

class BranchServicesScreen extends StatelessWidget {
  final ApiClient api;
  final String gymId, branchId, branchName;
  const BranchServicesScreen({super.key, required this.api, required this.gymId, required this.branchId, required this.branchName});
  String get path => 'gyms/$gymId/branches/$branchId/services';
  @override
  Widget build(BuildContext context) => Screen(title: 'خدمات الفرع', child: DataView(
    load: () => api.request(path),
    builder: (data, reload) => ListView(padding: const EdgeInsets.all(20), children: [
      Text(branchName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
      const Text('كل خدمة لها نقاط ومدة. الخدمات والأسعار الجديدة تحتاج موافقة إدارة المنصة قبل نشرها.'),
      const SizedBox(height: 16),
      ActionButton('إضافة خدمة', onPressed: () async { await open(context, BranchServiceForm(api: api, path: path)); await reload(); }),
      const SizedBox(height: 16),
      if (rows(data).isEmpty) const EmptyState('لسه مفيش خدمات', detail: 'ضيف أول خدمة وابعتها للإدارة للمراجعة.'),
      for (final service in rows(data)) Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${service['name']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        if ('${service['description'] ?? ''}'.isNotEmpty) Text('${service['description']}'),
        Text(service['approvedAt'] == null ? 'لم يتم اعتماد الخدمة بعد' : '${service['points']} نقطة · ${service['durationMinutes']} دقيقة · ${service['active'] == true ? 'متاحة' : 'متوقفة'}'),
        if (_hasPending(service)) const Text('يوجد طلب تعديل بانتظار مراجعة الإدارة', style: TextStyle(color: green)),
        if ((service['requests'] as List? ?? []).isNotEmpty && service['requests'][0]['status'] == 'REJECTED') Text('تم رفض الطلب: ${service['requests'][0]['reviewReason'] ?? ''}'),
        TextButton(onPressed: _hasPending(service) ? null : () async {
          await open(context, BranchServiceForm(api: api, path: path, service: service)); await reload();
        }, child: const Text('طلب تعديل الخدمة والسعر')),
        if (service['approvedAt'] != null) _Availability(api: api, path: path, service: service, reload: reload),
      ])),
    ]),
  ));
}

class _Availability extends StatefulWidget {
  final ApiClient api; final String path; final Json service; final Future<void> Function() reload;
  const _Availability({required this.api, required this.path, required this.service, required this.reload});
  @override State<_Availability> createState() => _AvailabilityState();
}
class _AvailabilityState extends State<_Availability> {
  bool busy = false; Object? error;
  Future<void> change() async {
    if (busy) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request('${widget.path}/${widget.service['id']}/availability', method: 'PATCH', body: {'active': widget.service['active'] != true, 'expectedVersion': widget.service['version']});
      await widget.reload();
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) => Column(children: [ErrorNote(error), TextButton(onPressed: busy || _hasPending(widget.service) ? null : change, child: Text(busy ? 'جاري الحفظ…' : widget.service['active'] == true ? 'إيقاف الخدمة' : 'إتاحة الخدمة'))]);
}

class BranchServiceForm extends StatefulWidget {
  final ApiClient api; final String path; final Json? service;
  const BranchServiceForm({super.key, required this.api, required this.path, this.service});
  @override State<BranchServiceForm> createState() => _BranchServiceFormState();
}
class _BranchServiceFormState extends State<BranchServiceForm> {
  final form = GlobalKey<FormState>();
  late final fields = {for (final k in ['name', 'description', 'points', 'durationMinutes', 'reason']) k: TextEditingController(text: '${widget.service?[k] ?? ''}')};
  bool busy = false; Object? error;
  @override void dispose() { for (final field in fields.values) { field.dispose(); } super.dispose(); }
  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request(widget.service == null ? widget.path : '${widget.path}/${widget.service!['id']}/price-requests', method: 'POST', body: {
        'name': fields['name']!.text.trim(), 'description': fields['description']!.text.trim(),
        'points': int.parse(digits(fields['points']!.text.trim())),
        'durationMinutes': int.parse(digits(fields['durationMinutes']!.text.trim())),
        'reason': fields['reason']!.text.trim(),
        if (widget.service != null) 'expectedVersion': widget.service!['version'],
      });
      if (mounted) Navigator.pop(context);
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) => Screen(title: widget.service == null ? 'خدمة جديدة' : 'طلب تعديل خدمة', child: Form(key: form, child: ListView(padding: const EdgeInsets.all(20), children: [
    for (final entry in {'name': 'اسم الخدمة', 'description': 'وصف الخدمة', 'points': 'عدد النقاط', 'durationMinutes': 'المدة بالدقائق', 'reason': 'سبب الطلب'}.entries) Padding(padding: const EdgeInsets.only(bottom: 14), child: TextFormField(
      controller: fields[entry.key], enabled: !busy, decoration: InputDecoration(labelText: entry.value),
      maxLength: entry.key == 'description' ? 2000 : entry.key == 'name' ? 150 : entry.key == 'reason' ? 1000 : 7,
      keyboardType: ['points', 'durationMinutes'].contains(entry.key) ? TextInputType.number : TextInputType.text,
      validator: (value) {
        final text = (value ?? '').trim();
        if (entry.key == 'description') return null;
        if (['points', 'durationMinutes'].contains(entry.key)) {
          final number = int.tryParse(digits(text)), max = entry.key == 'points' ? 1000000 : 1440;
          return number == null || number < 1 || number > max ? 'اكتب عددًا من 1 إلى $max' : null;
        }
        return text.length < (entry.key == 'reason' ? 5 : 1) ? 'راجع البيانات المطلوبة' : null;
      },
    )),
    ErrorNote(error), ActionButton('إرسال للمراجعة', busy: busy, onPressed: busy ? null : save),
  ])));
}
