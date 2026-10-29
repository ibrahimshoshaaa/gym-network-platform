import '../l10n/language.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';

String presetLabel(Json item) => '${item[AppLanguage.instance.english ? 'nameEn' : 'nameAr'] ?? item['name'] ?? ''}';
String serviceLabel(Json item) => item['preset'] is Map ? presetLabel(Map<String,dynamic>.from(item['preset'])) : '${item['name']}';
String serviceHours(Json item) => item['openMinute']==null ? '' : '${BookingHoursEditorStateLabel(item['openMinute'])} – ${BookingHoursEditorStateLabel(item['closeMinute'])}';
String BookingHoursEditorStateLabel(dynamic value) => '${((value as int) ~/ 60).toString().padLeft(2,'0')}:${(value % 60).toString().padLeft(2,'0')}';
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
      FacilityEditor(api: api, path: path, selected: List<String>.from(data['facilityIds'] ?? []), version: data['hours']?['version'] ?? 0, reload: reload),
      Text(appText('s907')),
      const SizedBox(height: 16),
      ActionButton(appText('s908'), onPressed: () async { await open(context, BranchServiceForm(api: api, path: path)); await reload(); }),
      const SizedBox(height: 16),
      if (rows(data).isEmpty) EmptyState(appText('s909'), detail: appText('s910')),
      for (final service in rows(data)) Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(serviceLabel(service), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        if ('${service['description'] ?? ''}'.isNotEmpty) Text('${service['description']}'),
        Text(service['approvedAt'] == null ? appText('s911') : appText('s912', [service['points'], service['durationMinutes'], service['active'] == true ? appText('s1010') : appText('s1011')])),
        if(service['openMinute'] != null) Text(serviceHours(service)),
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
  List<Json>? presets;
  String? selectedPreset;
  int? openMinute, closeMinute;
  @override void initState() { super.initState(); selectedPreset=widget.service?['presetId'] as String?; openMinute=widget.service?['openMinute'] as int?; closeMinute=widget.service?['closeMinute'] as int?; loadPresets(); }
  Future<void> loadPresets() async { try { final data=await widget.api.request('service-presets'); if(mounted)setState(()=>presets=rows(data).where((p)=>p['kind']=='SERVICE').toList()); } catch(e){if(mounted)setState(()=>error=e);} }
  Future<void> hours() async { final start=await showTimePicker(context:context,initialTime:TimeOfDay(hour:(openMinute??540)~/60,minute:(openMinute??540)%60));if(start==null||!mounted)return; final end=await showTimePicker(context:context,initialTime:TimeOfDay(hour:(closeMinute??1380)~/60,minute:(closeMinute??1380)%60));if(end==null||!mounted)return;setState((){openMinute=start.hour*60+start.minute;closeMinute=end.hour*60+end.minute;}); }
  @override void dispose() { for (final field in fields.values) { field.dispose(); } super.dispose(); }
  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    if(widget.service==null && selectedPreset==null){setState(()=>error=appText('presetChoose'));return;}
    if(openMinute!=null && openMinute==closeMinute){setState(()=>error=appText('presetHoursInvalid'));return;}
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request(widget.service == null ? widget.path : '${widget.path}/${widget.service!['id']}/price-requests', method: 'POST', body: {
        if(selectedPreset!=null) 'presetId':selectedPreset,
        'openMinute':openMinute,'closeMinute':closeMinute,
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
    Text(appText('presetChoose'),style:const TextStyle(fontWeight:FontWeight.w800)),
    if(presets==null) const LinearProgressIndicator(),
    if(presets!=null && widget.service==null) ...[
      for(final category in ['training','classes','spa','nutrition']) ...[
        Text(appText('presetCategory_$category')),
        Wrap(spacing:8,runSpacing:8,children:[for(final preset in presets!.where((p)=>p['category']==category)) ChoiceChip(label:Text(presetLabel(preset)),selected:selectedPreset==preset['id'],onSelected:busy?null:(_)=>setState((){selectedPreset='${preset['id']}';fields['name']!.text='${preset['nameAr']}';}))]),
        const SizedBox(height:12),
      ],
    ] else if(widget.service!=null) Text(serviceLabel(widget.service!),style:const TextStyle(fontWeight:FontWeight.w800)),
    Text(appText('presetServiceHours')),
    Text(openMinute==null?appText('presetBranchHours'):'${BookingHoursEditorStateLabel(openMinute)} – ${BookingHoursEditorStateLabel(closeMinute)}'),
    Wrap(spacing:8,children:[TextButton(onPressed:busy?null:hours,child:Text(appText('s923'))),TextButton(onPressed:busy?null:()=>setState((){openMinute=null;closeMinute=null;}),child:Text(appText('presetBranchHours')))]),
    for (final entry in { 'description': appText('s929'), 'points': appText('s137'), 'durationMinutes': appText('s930'), 'reason': appText('s931')}.entries) Padding(padding: const EdgeInsets.only(bottom: 14), child: TextFormField(
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

class FacilityEditor extends StatefulWidget {
 final ApiClient api;final String path;final List<String> selected;final int version;final Future<void> Function() reload;
 const FacilityEditor({super.key,required this.api,required this.path,required this.selected,required this.version,required this.reload});
 @override State<FacilityEditor> createState()=>_FacilityEditorState();
}
class _FacilityEditorState extends State<FacilityEditor>{
 List<Json>? options;late Set<String> selected;Object? error;bool busy=false;
 @override void initState(){super.initState();selected=widget.selected.toSet();load();}
 @override void didUpdateWidget(covariant FacilityEditor old){super.didUpdateWidget(old);if(old.version!=widget.version)selected=widget.selected.toSet();}
 Future<void> load()async{try{final d=await widget.api.request('service-presets');if(mounted)setState(()=>options=rows(d).where((p)=>p['kind']=='FACILITY').toList());}catch(e){if(mounted)setState(()=>error=e);}}
 Future<void> save()async{setState((){busy=true;error=null;});try{await widget.api.request('${widget.path}/facilities',method:'PATCH',body:{'ids':selected.toList(),'expectedVersion':widget.version});await widget.reload();}catch(e){if(mounted)setState(()=>error=e);}finally{if(mounted)setState(()=>busy=false);}}
 @override Widget build(BuildContext context){AppLanguage.watch(context);return Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(appText('presetFacilities'),style:const TextStyle(fontWeight:FontWeight.w800)),Text(appText('presetIncluded')),if(options!=null)Wrap(spacing:8,runSpacing:6,children:[for(final p in options!)FilterChip(label:Text(presetLabel(p)),selected:selected.contains(p['id']),onSelected:busy?null:(yes)=>setState((){if(yes){selected.add('${p['id']}');}else{selected.remove(p['id']);}}))]),ErrorNote(error,retry:load),TextButton(onPressed:busy||options==null?null:save,child:Text(appText('presetSaveFacilities')))]));}
}
