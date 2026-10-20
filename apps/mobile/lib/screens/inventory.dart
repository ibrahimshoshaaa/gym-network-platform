import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'topup.dart';

const centralInventory = 'central';

class InventoryScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  const InventoryScreen({super.key, required this.api, required this.gym});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'إدارة النقاط',
    child: DataView(
      load: () => api.request('gyms/${gym['id']}/inventory'),
      builder: (data, reload) {
        final stock = Map<String, dynamic>.from(data);
        final branches = (stock['branches'] as List).map((b) => Map<String, dynamic>.from(b)).toList();
        final active = stock['status'] == 'ACTIVE';
        return ListView(padding: const EdgeInsets.all(20), children: [
          Text('${gym['name']}', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Panel(color: ink, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('رصيد صاحب الجيم', style: TextStyle(color: Colors.white70)),
            const SizedBox(height: 10),
            FittedBox(fit: BoxFit.scaleDown, child: Text('${stock['central']} نقطة',
              style: const TextStyle(color: lime, fontSize: 34, fontWeight: FontWeight.w900))),
            const SizedBox(height: 10),
            const Text('رصيد مستقل، تقدر توزّعه على الفروع أو تبيع منه للمتدربين.', style: TextStyle(color: Colors.white70, fontSize: 12)),
          ])),
          const SizedBox(height: 12),
          Panel(child: Column(children: [
            Fact('موزّع على الفروع', '${stock['branchesTotal']} نقطة'),
            Fact('إجمالي نقاطك', '${stock['total']} نقطة', strong: true),
          ])),
          const SizedBox(height: 16),
          ActionButton('تحويل نقاط', icon: Icons.swap_horiz_rounded,
            onPressed: !active || api.pending != null || branches.where((b) => b['status'] == 'ACTIVE').isEmpty ? null : () async {
              await open(context, StockTransfer(api: api, gym: gym));
              await reload();
            }),
          TextButton.icon(icon: const Icon(Icons.add_card_rounded), label: const Text('شراء نقاط لرصيد صاحب الجيم'),
            onPressed: !active || api.pending != null ? null : () async {
              await open(context, TopupScreen(api: api, gymId: gym['id']));
              await reload();
            }),
          if (!active) const PortalNote('الجيم غير نشط. الأرصدة محفوظة والتحويل متاح بعد التفعيل.'),
          const SectionTitle('أرصدة الفروع'),
          if (branches.isEmpty) const EmptyState('لسه مفيش فروع', detail: 'تقدر تشحن رصيدك المركزي وتوزّعه بعد إضافة الفروع وتفعيلها.'),
          for (final b in branches) Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${b['name']}', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Fact('رصيد الفرع', '${b['stock']} نقطة', strong: true),
              if (b['status'] != 'ACTIVE') const Text('الفرع غير نشط؛ رصيده محفوظ.', style: TextStyle(color: muted, fontSize: 12)),
            ]))),
          TextButton.icon(icon: const Icon(Icons.history_rounded), label: const Text('سجل تحويلات النقاط'),
            onPressed: () => open(context, StockTransferHistory(api: api, gymId: gym['id']))),
        ]);
      },
    ),
  );
}

class StockTransfer extends StatefulWidget {
  final ApiClient api;
  final Json gym;
  final String? fromBranchId;
  const StockTransfer({super.key, required this.api, required this.gym, this.fromBranchId});
  @override
  State<StockTransfer> createState() => _StockTransferState();
}
class _StockTransferState extends State<StockTransfer> {
  final points = TextEditingController();
  Json? inventory, review, result;
  String from = centralInventory;
  String? to;
  bool busy = false;
  Object? error;
  @override
  void initState() { super.initState(); from = widget.fromBranchId ?? centralInventory; load(); }
  @override
  void dispose() { points.dispose(); super.dispose(); }
  Future<void> load() async {
    setState(() { busy = true; error = null; });
    try {
      final data = Map<String, dynamic>.from(await widget.api.request('gyms/${widget.gym['id']}/inventory'));
      if (mounted) setState(() { inventory = data; });
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  List<Json> get accounts => [
    {'id': centralInventory, 'name': 'رصيد صاحب الجيم', 'stock': inventory?['central'] ?? '0', 'status': 'ACTIVE'},
    ...(inventory?['branches'] as List? ?? []).map((b) => Map<String, dynamic>.from(b)),
  ];
  Future<void> advance() async {
    if (busy || widget.api.pending != null) return;
    FocusScope.of(context).unfocus();
    setState(() { busy = true; error = null; });
    try {
      if (review == null) {
        final text = digits(points.text.trim());
        final count = RegExp(r'^\d+$').hasMatch(text) ? int.tryParse(text) : null;
        if (count == null || count <= 0 || count > 2147483647 || to == null || from == to) throw const ApiFailure('INVALID_INPUT');
        final current = Map<String, dynamic>.from(await widget.api.request('gyms/${widget.gym['id']}/inventory'));
        if (!mounted) return;
        inventory = current;
        if (current['status'] != 'ACTIVE') throw const ApiFailure('GYM_INACTIVE');
        final source = accounts.where((a) => a['id'] == from && a['status'] == 'ACTIVE').firstOrNull;
        final target = accounts.where((a) => a['id'] == to && a['status'] == 'ACTIVE').firstOrNull;
        if (source == null || target == null) throw const ApiFailure('BRANCH_ACCESS_DENIED');
        final before = BigInt.parse('${source['stock']}'), targetBefore = BigInt.parse('${target['stock']}');
        if (before < BigInt.from(count)) throw const ApiFailure('INSUFFICIENT_POINTS');
        if (targetBefore + BigInt.from(count) > BigInt.from(2147483647)) throw const ApiFailure('INVALID_INPUT');
        setState(() => review = {'points': count, 'fromName': source['name'], 'toName': target['name'],
          'fromBefore': before.toString(), 'fromAfter': (before - BigInt.from(count)).toString(),
          'toBefore': targetBefore.toString(), 'toAfter': (targetBefore + BigInt.from(count)).toString()});
      } else {
        final response = await widget.api.transact('gyms/${widget.gym['id']}/stock-transfers', {
          'fromBranchId': from == centralInventory ? null : from,
          'toBranchId': to == centralInventory ? null : to,
          'points': review!['points'],
        });
        if (mounted) setState(() => result = response);
      }
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override
  Widget build(BuildContext context) {
    final locked = busy || widget.api.pending != null;
    return Screen(title: 'تحويل نقاط', child: ListView(padding: const EdgeInsets.all(20), children: [
      Text('${widget.gym['name']}', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 14),
      if (result != null) ...[
        const EmptyState('تم تحويل النقاط', icon: Icons.check_circle_rounded),
        Fact('من', '${review!['fromName']}'), Fact('إلى', '${review!['toName']}'),
        Fact('النقاط المحوّلة', '${review!['points']} نقطة', strong: true),
        Reference('${result!['id']}'),
        ActionButton('تم', onPressed: () => Navigator.pop(context, true)),
      ] else if (inventory == null) ...[
        if (busy) const Center(child: CircularProgressIndicator()),
        ErrorNote(error, retry: load),
      ] else ...[
        const PortalNote('انقل من رصيدك لفرع، من فرع لفرع، أو رجّع نقاط لرصيدك. إجمالي نقاطك لا يتغير.'),
        const SizedBox(height: 18),
        if (review == null) ...[
          DropdownButtonFormField<String>(initialValue: from, isExpanded: true,
            decoration: const InputDecoration(labelText: 'من رصيد'),
            items: accounts.map((a) => DropdownMenuItem<String>(value: a['id'], enabled: a['status'] == 'ACTIVE',
              child: Text('${a['name']} · ${a['stock']} نقطة', maxLines: 1, overflow: TextOverflow.ellipsis))).toList(),
            onChanged: locked ? null : (v) => setState(() { from = v!; if (to == from) to = null; })),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(key: ValueKey('$from:$to'), initialValue: to, isExpanded: true,
            decoration: const InputDecoration(labelText: 'إلى رصيد'),
            items: accounts.where((a) => a['id'] != from && a['status'] == 'ACTIVE').map((a) => DropdownMenuItem<String>(value: a['id'],
              child: Text('${a['name']} · ${a['stock']} نقطة', maxLines: 1, overflow: TextOverflow.ellipsis))).toList(),
            onChanged: locked ? null : (v) => setState(() => to = v)),
          const SizedBox(height: 16),
          TextField(controller: points, enabled: !locked, keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'عدد النقاط')),
        ] else Panel(child: Column(children: [
          Fact('من', '${review!['fromName']}'), Fact('إلى', '${review!['toName']}'),
          Fact('النقاط', '${review!['points']} نقطة', strong: true),
          const Divider(),
          Fact('رصيد المصدر قبل التحويل', '${review!['fromBefore']} نقطة'),
          Fact('رصيد المصدر بعد التحويل', '${review!['fromAfter']} نقطة', strong: true),
          Fact('رصيد المستلم قبل التحويل', '${review!['toBefore']} نقطة'),
          Fact('رصيد المستلم بعد التحويل', '${review!['toAfter']} نقطة', strong: true),
          const Text('الأرصدة وقت المراجعة. التحويل يُرفض لو الرصيد المتاح لم يعد كافيًا.', style: TextStyle(color: muted, fontSize: 11)),
        ])),
        ErrorNote(error),
        if (widget.api.pending != null) const PortalNote('فيه عملية نتيجتها غير مؤكدة. ارجع للرئيسية وأعد نفس العملية بأمان.'),
        const SizedBox(height: 20),
        ActionButton(review == null ? 'مراجعة التحويل' : 'تأكيد التحويل', busy: busy,
          onPressed: locked ? null : advance),
        if (review != null) TextButton(onPressed: locked ? null : () => setState(() { review = null; error = null; }), child: const Text('تعديل التحويل')),
      ],
    ]));
  }
}

class StockTransferHistory extends StatelessWidget {
  final ApiClient api;
  final String gymId;
  const StockTransferHistory({super.key, required this.api, required this.gymId});
  @override
  Widget build(BuildContext context) => Screen(title: 'سجل تحويلات النقاط', child: PagedRecords(
    api: api, path: 'gyms/$gymId/stock-transfers', item: (r) => Panel(child: Column(
      crossAxisAlignment: CrossAxisAlignment.start, children: [
        Fact('من', '${r['fromName']}'), Fact('إلى', '${r['toName']}'),
        Fact('النقاط', '${r['points']} نقطة', strong: true),
        Text(shortDate(r['createdAt']), style: const TextStyle(color: muted, fontSize: 12)),
        Reference('${r['id']}'),
      ])),
  ));
}
