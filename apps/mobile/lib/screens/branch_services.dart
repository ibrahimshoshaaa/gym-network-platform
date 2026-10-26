import '../l10n/language.dart';
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(title: appText('s753'), child: DataView(
    load: () => api.request(path),
    builder: (data, reload) { return  ListView(padding: const EdgeInsets.all(20), children: [
      Text(branchName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
      BookingHoursEditor(api: api, path: path, hours: data['hours'] == null ? null : Map<String,dynamic>.from(data['hours']), reload: reload),
      Text(appText('s907')),
      const SizedBox(height: 16),
      ActionButton(appText('s908'), onPressed: () async { await open(context, BranchServiceForm(api: api, path: path)); await reload(); }),
      const SizedBox(height: 16),
      if (rows(data).isEmpty) EmptyState(appText('s909'), detail: appText('s910')),
      for (final service in rows(data)) Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${service['name']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        if ('${service['description'] ?? ''}'.isNotEmpty) Text('${service['description']}'),
        Text(service['approvedAt'] == null ? appText('s911') : appText('s912', [service['points'], service['durationMinutes'], service['active'] == true ? appText('s1010') : appText('s1011')])),
        if (_hasPending(service)) Text(appText('s913'), style: TextStyle(color: green)),
        if ((service['requests'] as List? ?? []).isNotEmpty && service['requests'][0]['status'] == 'REJECTED') Text(appText('s914', [service['requests'][0]['reviewReason'] ?? ''])),
        TextButton(onPressed: _hasPending(service) ? null : () async {
          await open(context, BranchServiceForm(api: api, path: path, service: service)); await reload();
        }, child: Text(appText('s915'))),
        if (service['approvedAt'] != null) _Availability(api: api, path: path, service: service, reload: reload),
      ])),
    ]); },
  )); }
}

class BookingHoursEditor extends StatefulWidget {
  final ApiClient api;
  final String path;
  final Json? hours;
  final Future<void> Function() reload;
  const BookingHoursEditor({super.key, required this.api, required this.path, required this.hours, required this.reload});
  @override State<BookingHoursEditor> createState() => _BookingHoursEditorState();
}
class _BookingHoursEditorState extends State<BookingHoursEditor> {
  bool busy = false;
  Object? error;
  Future<void> edit() async {
    final hours = widget.hours;
    final start = await showTimePicker(context: context, helpText: appText('s916'), initialTime: TimeOfDay(hour: (hours?['openMinute'] as int? ?? 540) ~/ 60, minute: (hours?['openMinute'] as int? ?? 540) % 60));
    if(start == null || !mounted) return;
    final end = await showTimePicker(context: context, helpText: appText('s917'), initialTime: TimeOfDay(hour: (hours?['closeMinute'] as int? ?? 1380) ~/ 60, minute: (hours?['closeMinute'] as int? ?? 1380) % 60));
    if(end == null || !mounted) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request('${widget.path}/booking-hours', method: 'PATCH', body: {'openMinute': start.hour * 60 + start.minute, 'closeMinute': end.hour * 60 + end.minute, 'expectedVersion': hours?['version'] ?? 0});
      await widget.reload();
    } catch(e) { if(mounted) setState(() => error = e); }
    finally { if(mounted) setState(() => busy = false); }
  }
  String label(dynamic minute) => minute == null ? appText('s918') : '${((minute as int) ~/ 60).toString().padLeft(2,'0')}:${(minute % 60).toString().padLeft(2,'0')}';
  @override Widget build(BuildContext context) { AppLanguage.watch(context); return  Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Text(appText('s919'), style: TextStyle(fontWeight: FontWeight.w800)),
    Text(appText('s920', [label(widget.hours?['openMinute']), label(widget.hours?['closeMinute'])])),
    Text(appText('s921')),
    ErrorNote(error), TextButton(onPressed: busy ? null : edit, child: Text(busy ? appText('s922') : appText('s923'))),
  ])); }
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
  @override Widget build(BuildContext context) { AppLanguage.watch(context); return  Column(children: [ErrorNote(error), TextButton(onPressed: busy || _hasPending(widget.service) ? null : change, child: Text(busy ? appText('s922') : widget.service['active'] == true ? appText('s924') : appText('s925')))]); }
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
  @override Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(title: widget.service == null ? appText('s926') : appText('s927'), child: Form(key: form, child: ListView(padding: const EdgeInsets.all(20), children: [
    for (final entry in {'name': appText('s928'), 'description': appText('s929'), 'points': appText('s137'), 'durationMinutes': appText('s930'), 'reason': appText('s931')}.entries) Padding(padding: const EdgeInsets.only(bottom: 14), child: TextFormField(
      controller: fields[entry.key], enabled: !busy, decoration: InputDecoration(labelText: entry.value),
      maxLength: entry.key == 'description' ? 2000 : entry.key == 'name' ? 150 : entry.key == 'reason' ? 1000 : 7,
      keyboardType: ['points', 'durationMinutes'].contains(entry.key) ? TextInputType.number : TextInputType.text,
      validator: (value) {
        final text = (value ?? '').trim();
        if (entry.key == 'description') return null;
        if (['points', 'durationMinutes'].contains(entry.key)) {
          final number = int.tryParse(digits(text)), max = entry.key == 'points' ? 1000000 : 1440;
          return number == null || number < 1 || number > max ? appText('s932', [max]) : null;
        }
        return text.length < (entry.key == 'reason' ? 5 : 1) ? appText('s933') : null;
      },
    )),
    ErrorNote(error), ActionButton(appText('s904'), busy: busy, onPressed: busy ? null : save),
  ]))); }
}
