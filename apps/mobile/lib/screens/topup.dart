import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';

class TopupScreen extends StatefulWidget {
  final ApiClient api;
  final String? branchId;
  const TopupScreen({super.key, required this.api, this.branchId});
  @override
  State<TopupScreen> createState() => _TopupScreenState();
}

class _TopupScreenState extends State<TopupScreen> {
  final amount = TextEditingController();
  Json? options, quote, receipt, result;
  String? method;
  bool byAmount = false, busy = false, confirmed = false;
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

  String get kind => widget.branchId == null ? 'TRAINEE' : 'BRANCH_STOCK';
  Json get selection => {
    'kind': kind,
    if (widget.branchId != null) 'receivingBranchId': widget.branchId,
    if (byAmount)
      'amountPiasters': piasters(amount.text)
    else
      'points': int.tryParse(digits(amount.text)),
  };
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
    if (busy) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final q = await widget.api.request(
        'topup-quotes',
        method: 'POST',
        body: selection,
      );
      if (mounted) setState(() => quote = Map<String, dynamic>.from(q));
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> upload() async {
    if (busy) return;
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
        ...selection,
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
    final methods = (options?['paymentMethods'] as List? ?? [])
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    return Screen(
      title: widget.branchId == null ? 'اشحن رصيدك' : 'شراء نقاط للفرع',
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          if (result != null) ...[
            const EmptyState(
              'طلب الشحن وصل',
              detail: 'النقاط هتضاف بعد مراجعة الإيصال وتأكيد وصول التحويل.',
              icon: Icons.task_alt_rounded,
            ),
            const SizedBox(height: 18),
            Panel(
              child: Column(
                children: [
                  Fact('النقاط', '${result!['points']} نقطة', strong: true),
                  Fact('المبلغ', '${money(result!['chargePiasters'])} ج.م'),
                  StatusPill(result!['status']),
                  Reference('${result!['id']}'),
                ],
              ),
            ),
            const SizedBox(height: 20),
            ActionButton(
              'رجوع للمحفظة',
              onPressed: () => Navigator.pop(context, true),
            ),
          ] else if (options == null) ...[
            if (busy) const Center(child: CircularProgressIndicator()),
            ErrorNote(error, retry: load),
          ] else if (methods.isEmpty)
            const EmptyState(
              'الشحن غير متاح مؤقتًا',
              detail: 'لا توجد وسيلة تحويل مفعّلة حاليًا. تواصل مع الإدارة.',
            )
          else ...[
            FlowSteps(
              labels: const ['النقاط', 'التحويل والإيصال', 'المراجعة'],
              current: quote == null
                  ? 0
                  : receipt == null
                  ? 1
                  : 2,
            ),
            Text(
              quote == null
                  ? 'رصيد جديد، خطوة جديدة.'
                  : 'راجع التحويل قبل الإرسال',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 8),
            const Text(
              'النقاط لا تضاف قبل اعتماد الطلب.',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 22),
            if (quote == null) ...[
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('عدد النقاط')),
                  ButtonSegment(value: true, label: Text('المبلغ بالجنيه')),
                ],
                selected: {byAmount},
                onSelectionChanged: busy
                    ? null
                    : (v) => setState(() => byAmount = v.first),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: amount,
                enabled: !busy,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                textDirection: TextDirection.ltr,
                decoration: InputDecoration(
                  labelText: byAmount ? 'المبلغ بالجنيه' : 'عدد النقاط',
                  hintText: '100',
                ),
              ),
              const SizedBox(height: 16),
              if (!byAmount)
                Wrap(
                  spacing: 8,
                  children: [
                    for (final p in (options!['packages'] as List? ?? []))
                      ActionChip(
                        label: Text('${p['label']} · ${p['points']} نقطة'),
                        onPressed: busy
                            ? null
                            : () => amount.text = '${p['points']}',
                      ),
                  ],
                ),
              ErrorNote(error),
              ActionButton(
                'متابعة لبيانات التحويل',
                onPressed: review,
                busy: busy,
              ),
            ] else ...[
              Panel(
                color: ink,
                child: Column(
                  children: [
                    const Text(
                      'هتشحن',
                      style: TextStyle(color: Colors.white70),
                    ),
                    Text(
                      '${quote!['points']} نقطة',
                      style: const TextStyle(
                        fontSize: 38,
                        fontWeight: FontWeight.w900,
                        color: lime,
                      ),
                    ),
                    Text(
                      '${money(quote!['chargePiasters'])} ج.م',
                      style: const TextStyle(
                        fontSize: 23,
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              if (quote!['unallocatedPiasters'] != '0')
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(
                    'المبلغ الزائد عن النقاط الكاملة: ${money(quote!['unallocatedPiasters'])} ج.م. حوّل قيمة الشحن الموضحة فقط.',
                  ),
                ),
              const SectionTitle('حوّل المبلغ للحساب ده'),
              DropdownButtonFormField<String>(
                initialValue: method,
                items: methods
                    .map(
                      (m) => DropdownMenuItem(
                        value: '${m['type']}',
                        child: Text(
                          m['type'] == 'INSTAPAY'
                              ? 'إنستا باي'
                              : 'محفظة إلكترونية',
                        ),
                      ),
                    )
                    .toList(),
                onChanged: busy || widget.api.pending != null
                    ? null
                    : (v) => setState(() => method = v),
                decoration: const InputDecoration(labelText: 'وسيلة التحويل'),
              ),
              const SizedBox(height: 12),
              for (final m in methods.where((m) => m['type'] == method))
                Panel(
                  child: Column(
                    children: [
                      Fact('صاحب الحساب', '${m['accountName']}'),
                      SelectableText(
                        '${m['account']}',
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 21,
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () => Clipboard.setData(
                          ClipboardData(text: '${m['account']}'),
                        ),
                        icon: const Icon(Icons.copy_rounded, size: 17),
                        label: const Text('نسخ الحساب'),
                      ),
                    ],
                  ),
                ),
              const SectionTitle('إثبات التحويل'),
              OutlinedButton.icon(
                onPressed: busy || widget.api.pending != null ? null : upload,
                icon: Icon(
                  receipt == null
                      ? Icons.add_photo_alternate_outlined
                      : Icons.check_circle_rounded,
                ),
                label: Text(
                  receipt == null
                      ? 'اختار صورة الإيصال'
                      : 'الإيصال اترفع · تغيير الصورة',
                ),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: confirmed,
                onChanged: busy
                    ? null
                    : (v) => setState(() => confirmed = v ?? false),
                title: const Text(
                  'حوّلت المبلغ الموضح وراجعت بيانات الحساب والإيصال.',
                ),
              ),
              ErrorNote(error),
              ActionButton(
                'إرسال طلب الشحن',
                busy: busy,
                onPressed:
                    confirmed && receipt != null && widget.api.pending == null
                    ? submit
                    : null,
              ),
              if (widget.api.pending != null)
                const Text(
                  'فيه عملية محفوظة غير مؤكدة. ارجع للرئيسية واستخدم إعادة نفس العملية.',
                  style: TextStyle(color: muted),
                ),
              TextButton(
                onPressed: busy || widget.api.pending != null
                    ? null
                    : () => setState(() {
                        quote = null;
                        error = null;
                      }),
                child: const Text('تعديل النقاط'),
              ),
            ],
          ],
        ],
      ),
    );
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
