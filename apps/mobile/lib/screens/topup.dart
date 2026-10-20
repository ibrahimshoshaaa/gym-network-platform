import 'campaigns.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';

class TopupScreen extends StatefulWidget {
  final ApiClient api;
  final String? branchId, gymId;
  const TopupScreen({super.key, required this.api, this.branchId, this.gymId}) : assert(branchId == null || gymId == null);
  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  final amount = TextEditingController();
  Json? options, quote, receipt, result, selectedPackage, reviewedSelection;
  String? method;
  bool byAmount = false, busy = false, confirmed = false, reviewing = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  String get kind => widget.branchId == null && widget.gymId == null ? 'TRAINEE' : 'BRANCH_STOCK';
  int? get customPoints {
    final text = digits(amount.text.trim());
    return RegExp(r'^\d+$').hasMatch(text) ? int.tryParse(text) : null;
  }
  Json get selection => {
    'kind': kind,
    if (widget.branchId != null) 'receivingBranchId': widget.branchId,
    if (widget.gymId != null) 'receivingGymId': widget.gymId,
    if (selectedPackage != null) ...{
      'packageId': selectedPackage!['id'], 'packageVersion': selectedPackage!['version'],
    } else if (byAmount) 'amountPiasters': piasters(amount.text)
    else 'points': customPoints,
  };
  Json? estimateFor(int? points) {
    final policy = options?['policy'];
    final unit = BigInt.tryParse('${policy?['pointPricePiasters']}');
    final discount = kind == 'TRAINEE' ? 0 : (policy?['gymDiscountBps'] as int? ?? 0);
    if (unit == null || unit <= BigInt.zero || discount < 0 || discount >= 10000) return null;
    final numerator = unit * BigInt.from(10000 - discount);
    final entered = BigInt.tryParse(piasters(amount.text) ?? '');
    final count = points != null ? BigInt.from(points) : byAmount && entered != null ? entered * BigInt.from(10000) ~/ numerator : null;
    if (count == null || count <= BigInt.zero || count > BigInt.from(2147483647)) return null;
    return {'points': count.toString(), 'chargePiasters': ((count * numerator + BigInt.from(9999)) ~/ BigInt.from(10000)).toString()};
  }
  Future<void> load() async {
    setState(() => busy = true);
    try {
      final o = await widget.api.request('topup-options?kind=$kind');
      if (mounted)
        setState(() {
          options = Map<String, dynamic>.from(o);
          final ms = List.from(o['paymentMethods']);
          method = ms.isEmpty ? null : ms.first['type'];
          error = null;
        });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> review() async {
    if (busy || widget.api.pending != null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final snapshot = Map<String, dynamic>.from(selection);
      final q = await widget.api.request(
        'topup-quotes',
        method: 'POST',
        body: snapshot,
      );
      if (mounted) setState(() { quote = Map<String, dynamic>.from(q); reviewedSelection = snapshot; confirmed = false; reviewing = false; });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> upload() async {
    if (busy || widget.api.pending != null) return;
    setState(() => busy = true);
    try {
      final photo = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 2000,
        imageQuality: 85,
      );
      if (photo == null) return;
      final bytes = await photo.readAsBytes();
      if (bytes.length > 4 * 1024 * 1024)
        throw const ApiFailure('BODY_TOO_LARGE');
      final mime = photo.path.toLowerCase().endsWith('.png')
          ? 'image/png'
          : photo.path.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      final r = await widget.api.request(
        'receipts',
        method: 'POST',
        bytes: bytes,
        mime: mime,
      );
      if (mounted) setState(() => receipt = Map<String, dynamic>.from(r));
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (busy ||
        widget.api.pending != null ||
        !reviewing ||
        !confirmed ||
        receipt == null ||
        method == null ||
        quote == null)
      return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final m = List<Json>.from(
        (options!['paymentMethods'] as List).map(
          (e) => Map<String, dynamic>.from(e),
        ),
      ).firstWhere((m) => m['type'] == method);
      final r = await widget.api.transact('topups', {
        ...reviewedSelection!,
        'pricingVersion': quote!['pricingVersion'],
        'receiptId': receipt!['id'],
        'paymentMethod': method,
        'paymentMethodVersion': m['version'],
      });
      if (mounted) setState(() => result = r);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final methods = (options?['paymentMethods'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final packages = (options?['packages'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final locked = busy || widget.api.pending != null;
    final estimate = estimateFor(selectedPackage != null ? selectedPackage!['points'] as int : byAmount ? null : customPoints);
    final step = quote == null ? 0 : reviewing ? 2 : 1;
    final destination = widget.gymId != null ? 'رصيد صاحب الجيم' : widget.branchId != null ? 'مخزون الفرع' : 'محفظتك';
    final chosenMethod = methods.where((m) => m['type'] == method).firstOrNull;
    return Screen(title: kind == 'TRAINEE' ? 'اشحن رصيدك' : 'شراء نقاط', child: ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28), children: [
        CampaignBanner(api:widget.api,placement:'WALLET'),
        if (result != null) ...[
          const EmptyState('طلب الشحن وصل', detail: 'هتوصلك النتيجة بعد مراجعة التحويل.', icon: Icons.task_alt_rounded),
          Panel(child: Column(children: [
            Fact('وجهة النقاط', destination),
            Fact('النقاط', '${result!['points']} نقطة', strong: true),
            Fact('المبلغ', '${money(result!['chargePiasters'])} ج.م'),
            StatusPill(result!['status']), Reference('${result!['id']}'),
          ])),
          const SizedBox(height: 16),
          ActionButton('رجوع للمحفظة', onPressed: () => Navigator.pop(context, true)),
        ] else if (options == null) ...[
          if (busy) const Center(child: CircularProgressIndicator()), ErrorNote(error, retry: load),
        ] else if (methods.isEmpty)
          const EmptyState('الشحن غير متاح مؤقتًا', detail: 'لا توجد وسيلة تحويل مفعّلة حاليًا. تواصل مع الإدارة.')
        else if (options!['policy'] == null)
          const EmptyState('تسعير النقاط غير متاح', detail: 'الإدارة هتفعّل الأسعار قبل استقبال طلبات جديدة.')
        else ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (var i = 0; i < 3; i++) Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: step == i ? ink : Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text('${i + 1} · ${['اختيار الرصيد', 'التحويل', 'المراجعة'][i]}',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: step == i ? Colors.white : muted))),
          ]),
          const SizedBox(height: 20),
          Text(quote == null ? 'اختار رصيدك' : reviewing ? 'راجع طلب الشحن' : 'حوّل وارفع الإيصال',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text('النقاط هتضاف إلى $destination بعد اعتماد الطلب.', style: const TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 20),
          if (quote == null) ...[
            if (!byAmount && packages.isNotEmpty) ...[
              const Text('باقات جاهزة', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 10),
              LayoutBuilder(builder: (context, box) {
                final columns = box.maxWidth < 280 || MediaQuery.textScalerOf(context).scale(14) > 20 ? 1 : 2;
                final width = (box.maxWidth - (columns - 1) * 10) / columns;
                return Wrap(spacing: 10, runSpacing: 10, children: [for (final p in packages) SizedBox(width: width,
                  child: Material(color: selectedPackage?['id'] == p['id'] ? const Color(0xffe0faf1) : Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: selectedPackage?['id'] == p['id'] ? green : const Color(0xffe2e7e4))),
                    clipBehavior: Clip.antiAlias, child: InkWell(onTap: locked ? null : () => setState(() {
                      selectedPackage = p; amount.text = '${p['points']}'; error = null;
                    }), child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('${p['points']} نقطة', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text('${money(estimateFor(p['points'])?['chargePiasters'])} ج.م', style: const TextStyle(color: green, fontWeight: FontWeight.w700)),
                      if (!digits('${p['label']}').contains('${p['points']}')) Text('${p['label']}', style: const TextStyle(color: muted, fontSize: 11)),
                    ]))))),
                ]);
              }),
              const SizedBox(height: 20),
              const Text('أو اختار قيمة تانية', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 10),
            ],
            SegmentedButton<bool>(segments: const [
              ButtonSegment(value: false, label: Text('نقاط')), ButtonSegment(value: true, label: Text('جنيه')),
            ], selected: {byAmount}, onSelectionChanged: locked ? null : (v) => setState(() {
              byAmount = v.first; selectedPackage = null; amount.clear(); error = null;
            })),
            const SizedBox(height: 14),
            TextField(controller: amount, enabled: !locked,
              onChanged: (_) => setState(() { selectedPackage = null; error = null; }),
              keyboardType: TextInputType.numberWithOptions(decimal: byAmount), textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: byAmount ? 'المبلغ بالجنيه' : 'عدد النقاط', hintText: '100')),
            if (estimate != null) ...[
              const SizedBox(height: 14),
              Panel(padding: const EdgeInsets.all(14), child: Column(children: [
                Fact('النقاط المختارة', '${estimate['points']} نقطة'),
                Fact('السعر المتوقع', '${money(estimate['chargePiasters'])} ج.م', strong: true),
              ])),
            ],
            ErrorNote(error), const SizedBox(height: 16),
            ActionButton('متابعة لبيانات التحويل', onPressed: locked || estimate == null ? null : review, busy: busy),
          ] else ...[
            Panel(color: ink, padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(reviewing ? 'طلب شحن إلى $destination' : 'المبلغ المطلوب تحويله', style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 8),
              FittedBox(fit: BoxFit.scaleDown, child: Text('${money(quote!['chargePiasters'])} ج.م', style: const TextStyle(color: lime, fontSize: 32, fontWeight: FontWeight.w900))),
              Text('${quote!['points']} نقطة', style: const TextStyle(color: Colors.white, fontSize: 16)),
            ])),
            if (quote!['unallocatedPiasters'] != null && quote!['unallocatedPiasters'] != '0') Padding(padding: const EdgeInsets.only(top: 12),
              child: Text('حوّل القيمة الموضحة فقط؛ المتبقي ${money(quote!['unallocatedPiasters'])} ج.م لا يقابل نقاطًا كاملة.', style: const TextStyle(fontSize: 12))),
            if (!reviewing) ...[
              const SectionTitle('بيانات التحويل'),
              DropdownButtonFormField<String>(initialValue: method, isExpanded: true,
                items: methods.map((m) => DropdownMenuItem(value: '${m['type']}', child: Text(m['type'] == 'INSTAPAY' ? 'إنستا باي' : 'محفظة إلكترونية'))).toList(),
                onChanged: locked ? null : (v) => setState(() { method = v; receipt = null; confirmed = false; }),
                decoration: const InputDecoration(labelText: 'وسيلة التحويل')),
              const SizedBox(height: 12),
              if (chosenMethod != null) Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${chosenMethod['accountName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                SelectableText('${chosenMethod['account']}', textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                TextButton.icon(onPressed: () => Clipboard.setData(ClipboardData(text: '${chosenMethod['account']}')),
                  icon: const Icon(Icons.copy_rounded, size: 17), label: const Text('نسخ الحساب')),
              ])),
              const SectionTitle('إيصال التحويل'),
              OutlinedButton.icon(onPressed: locked ? null : upload,
                icon: Icon(receipt == null ? Icons.add_photo_alternate_outlined : Icons.check_circle_rounded),
                label: Text(receipt == null ? 'ارفع صورة الإيصال' : 'الإيصال جاهز · تغيير الصورة')),
              ErrorNote(error), const SizedBox(height: 16),
              ActionButton('مراجعة طلب الشحن', onPressed: locked || receipt == null ? null : () => setState(() { reviewing = true; confirmed = false; error = null; })),
              TextButton(onPressed: locked ? null : () => setState(() { quote = null; receipt = null; reviewedSelection = null; confirmed = false; error = null; }), child: const Text('تعديل الرصيد المختار')),
            ] else ...[
              const SizedBox(height: 16),
              Panel(child: Column(children: [
                Fact('وسيلة التحويل', method == 'INSTAPAY' ? 'إنستا باي' : 'محفظة إلكترونية'),
                Fact('صاحب الحساب', '${chosenMethod?['accountName']}'),
                Fact('الحساب', '${chosenMethod?['account']}'),
                const Fact('الإيصال', 'مرفوع وجاهز للمراجعة'),
              ])),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: confirmed,
                onChanged: locked ? null : (v) => setState(() => confirmed = v ?? false),
                title: const Text('حوّلت المبلغ وراجعت الحساب والإيصال.')),
              ErrorNote(error),
              ActionButton('إرسال طلب الشحن', busy: busy, onPressed: locked || !confirmed ? null : submit),
              TextButton(onPressed: locked ? null : () => setState(() { reviewing = false; confirmed = false; error = null; }), child: const Text('تعديل بيانات التحويل')),
            ],
          ],
          if (widget.api.pending != null) const PortalNote('فيه عملية محفوظة غير مؤكدة. ارجع للرئيسية وأعد نفس العملية بأمان.'),
        ],
      ],
    ));
  }
}

class TopupHistory extends StatelessWidget {
  final ApiClient api;
  const TopupHistory({super.key, required this.api});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'طلبات الشحن',
    child: PagedRecords(
      api: api,
      path: 'topups',
      empty: 'لسه مفيش طلبات شحن',
      item: (r) => Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${r['points']} نقطة',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                StatusPill(r['status']),
              ],
            ),
            Fact('المبلغ', '${money(r['chargePiasters'])} ج.م'),
            Text(
              shortDate(r['createdAt']),
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            if (r['reviewReason'] != null) Text('${r['reviewReason']}'),
            Reference('${r['id']}'),
          ],
        ),
      ),
    ),
  );
}

