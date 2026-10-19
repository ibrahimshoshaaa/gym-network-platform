import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../core/api.dart';
import '../core/ui.dart';
import 'directory.dart';
import 'topup.dart';
import 'account.dart';

String reportRange() {
  final now = DateTime.now(), from = now.subtract(const Duration(days: 29));
  String date(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  return 'from=${date(from)}&to=${date(now)}';
}

class OwnerHome extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  final VoidCallback showBranches, showMoney, showOperations;
  const OwnerHome({
    super.key,
    required this.api,
    required this.gym,
    required this.showBranches,
    required this.showMoney,
    required this.showOperations,
  });
  @override
  Widget build(BuildContext context) => DataView(
    load: () => Future.wait([
      api.request('gyms/${gym['id']}/point-wallet'),
      api.request('reports/summary?gymId=${gym['id']}&${reportRange()}'),
    ]),
    builder: (data, reload) {
      final wallet = data[0],
          report = data[1],
          balances = report['currentBalances'] as List? ?? [];
      String balance(String type) =>
          '${balances.cast<Map>().where((b) => b['type'] == type).firstOrNull?['balancePiasters'] ?? '0'}';
      return ListView(
        padding: const EdgeInsets.all(22),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'مساحة جيمك',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                    Text(
                      '${gym['name']}',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'الإشعارات',
                onPressed: () => open(context, NotificationsScreen(api: api)),
                icon: const Icon(Icons.notifications_none_rounded),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Panel(
            color: ink,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.account_balance_wallet_outlined, color: lime),
                    SizedBox(width: 10),
                    Text(
                      'محفظة الجيم · متاح للإرسال',
                      style: TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Wrap(
                  spacing: 10,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(
                      '${wallet['available']}',
                      style: const TextStyle(
                        fontSize: 52,
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                        color: Colors.white,
                      ),
                    ),
                    const Text(
                      'نقطة',
                      style: TextStyle(color: lime, fontSize: 18),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'إجمالي رصيد الجيم ${wallet['total']} نقطة',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: lime,
                    foregroundColor: ink,
                  ),
                  onPressed: gym['status'] != 'ACTIVE'
                      ? null
                      : () async {
                          await open(context, SendPoints(api: api, gym: gym));
                          await reload();
                        },
                  icon: const Icon(Icons.north_west_rounded),
                  label: const Text('إرسال نقاط لمتدرب'),
                ),
              ],
            ),
          ),
          if (wallet['total'] != wallet['available'])
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'أرصدة الفروع غير المفعّلة محفوظة ضمن الإجمالي وغير متاحة للإرسال.',
                style: TextStyle(color: muted, fontSize: 12),
              ),
            ),
          if (wallet['total'] == '0') ...[
            const SizedBox(height: 16),
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'ابدأ بتجهيز رصيد جيمك',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'لو أول مرة، أضف فرعك وحدد مكانه وسعر الزيارة. بعد اعتماده تقدر تشتري نقاط للفرع وتبعتها للمتدربين من هنا.',
                    style: TextStyle(color: muted, fontSize: 12),
                  ),
                  TextButton(
                    onPressed: showBranches,
                    child: const Text('الفروع وشراء النقاط'),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 16),
          ActionButton('تسجيل زيارة وتشغيل الفروع', icon: Icons.qr_code_scanner_rounded,
            onPressed: showOperations),
          const SectionTitle('شغلك تحت عينك'),
          Row(
            children: [
              Expanded(
                child: Panel(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.directions_run_rounded, color: green),
                      const SizedBox(height: 12),
                      Text(
                        '${report['visits']?['count'] ?? 0}',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const Text(
                        'زيارة خلال 30 يوم',
                        style: TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Panel(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.toll_rounded, color: green),
                      const SizedBox(height: 12),
                      Text(
                        '${report['sales']?['points'] ?? 0}',
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const Text(
                        'نقطة مباعة خلال 30 يوم',
                        style: TextStyle(color: muted, fontSize: 11),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SectionTitle('مستحقاتك'),
          Panel(
            child: Column(
              children: [
                Fact(
                  'متاح للسحب',
                  '${money(balance('GYM_AVAILABLE'))} ج.م',
                  strong: true,
                ),
                Fact(
                  'محجوز لطلبات السحب',
                  '${money(balance('GYM_RESERVED'))} ج.م',
                ),
                Fact('محجوز للمراجعة', '${money(balance('GYM_DISPUTED'))} ج.م'),
                TextButton.icon(
                  onPressed: showMoney,
                  icon: const Icon(Icons.arrow_back_rounded),
                  label: const Text('تفاصيل المستحقات والسحب'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Panel(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.storefront_outlined, color: green),
              title: const Text('الفروع والموظفين'),
              subtitle: const Text('أضف فرعك أو اشحن رصيده'),
              trailing: const Icon(Icons.chevron_left_rounded),
              onTap: showBranches,
            ),
          ),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () =>
                open(context, DispatchHistory(api: api, gymId: gym['id'])),
            icon: const Icon(Icons.history_rounded),
            label: const Text('سجل إرسال وشحن محفظة الجيم'),
          ),
        ],
      );
    },
  );
}

class SendPoints extends StatefulWidget {
  final ApiClient api;
  final Json gym;
  const SendPoints({super.key, required this.api, required this.gym});
  @override
  State<SendPoints> createState() => _SendPointsState();
}

class _SendPointsState extends State<SendPoints> {
  final phone = TextEditingController(), points = TextEditingController();
  Json? person, quote, result;
  bool busy = false, checked = false;
  Object? error;
  String get path => 'gyms/${widget.gym['id']}/point-transfers';
  @override
  void dispose() {
    phone.dispose();
    points.dispose();
    super.dispose();
  }

  Future<void> advance() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (person == null) {
        final r = await widget.api.request(
          '$path/lookup',
          method: 'POST',
          body: {'phone': phone.text},
        );
        if (mounted) setState(() => person = Map<String, dynamic>.from(r));
      } else if (quote == null) {
        final r = await widget.api.request(
          '$path/quotes',
          method: 'POST',
          body: {
            'recipientId': person!['id'],
            'gymId': widget.gym['id'],
            'points': int.tryParse(digits(points.text)),
          },
        );
        if (mounted) setState(() => quote = Map<String, dynamic>.from(r));
      } else if (checked) {
        final r = await widget.api.transact(path, {
          'recipientId': quote!['recipientId'],
          'recipientLabel': quote!['recipientLabel'],
          'gymId': widget.gym['id'],
          'points': quote!['points'],
          'pricingVersion': quote!['pricingVersion'],
          'receivedAmountPiasters': quote!['chargePiasters'],
          'fundsReceived': true,
          'recipientConfirmed': true,
          'paymentMethod': 'CASH',
        });
        if (mounted) setState(() => result = r);
      }
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'إرسال نقاط',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (result != null) ...[
          const EmptyState(
            'تم إرسال النقاط',
            detail: 'اتخصمت من رصيد الجيم واتضافت لمحفظة المتدرب.',
            icon: Icons.check_circle_rounded,
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Fact('المستلم', '${result!['recipientLabel']}'),
                Fact('النقاط', '${result!['points']} نقطة', strong: true),
                Fact(
                  'المبلغ المحصّل',
                  '${money(result!['chargePiasters'])} ج.م',
                ),
                Reference('${result!['id']}'),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ActionButton('تم', onPressed: () => Navigator.pop(context, true)),
        ] else ...[
          Text(
            person == null
                ? 'هتبعت لمين؟'
                : quote == null
                ? 'اتأكد من الاسم وحدد النقاط'
                : 'راجع وأكّد الإرسال',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 10),
          const Text(
            'البيع بالسعر المحدد من المنصة، بعد استلام المبلغ من المتدرب.',
            style: TextStyle(color: muted),
          ),
          const SizedBox(height: 24),
          if (person == null)
            TextField(
              controller: phone,
              enabled: !busy && widget.api.pending == null,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: const InputDecoration(
                labelText: 'رقم موبايل المتدرب',
                hintText: '01xxxxxxxxx',
              ),
            )
          else ...[
            Panel(
              color: const Color(0xffe6f2e9),
              child: Row(
                children: [
                  const Icon(
                    Icons.person_outline_rounded,
                    color: green,
                    size: 30,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'المستلم',
                          style: TextStyle(color: muted, fontSize: 12),
                        ),
                        Text(
                          '${person!['label']}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 20,
                          ),
                        ),
                        Text(phone.text, textDirection: TextDirection.ltr),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (quote == null)
              TextField(
                controller: points,
                enabled: !busy && widget.api.pending == null,
                keyboardType: TextInputType.number,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'عدد النقاط'),
              )
            else ...[
              Panel(
                child: Column(
                  children: [
                    Fact('النقاط', '${quote!['points']} نقطة', strong: true),
                    Fact(
                      'المطلوب تحصيله',
                      '${money(quote!['chargePiasters'])} ج.م',
                      strong: true,
                    ),
                    Fact(
                      'رصيد المستلم بعد الإرسال',
                      '${quote!['recipientAfter']} نقطة',
                    ),
                    Fact(
                      'المتبقي من رصيد جيمك',
                      '${BigInt.parse(quote!['stock']) - BigInt.from(quote!['points'])} نقطة',
                    ),
                  ],
                ),
              ),
              CheckboxListTile(
                value: checked,
                onChanged: busy
                    ? null
                    : (v) => setState(() => checked = v ?? false),
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'اتأكدت من اسم المتدرب واستلمت المبلغ كاملًا.',
                ),
              ),
            ],
          ],
          ErrorNote(error),
          const SizedBox(height: 12),
          ActionButton(
            quote != null
                ? 'تأكيد الإرسال'
                : person == null
                ? 'متابعة'
                : 'مراجعة الإرسال',
            onPressed: (quote == null || checked) && widget.api.pending == null
                ? advance
                : null,
            busy: busy,
            icon: Icons.arrow_back_rounded,
          ),
          if (widget.api.pending != null)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'العملية محفوظة. ارجع للرئيسية واضغط «إعادة نفس العملية» للتحقق من النتيجة بأمان.',
                style: TextStyle(color: muted),
              ),
            ),
          if (person != null && widget.api.pending == null)
            TextButton(
              onPressed: busy
                  ? null
                  : () => setState(() {
                      if (quote != null) {
                        quote = null;
                      } else {
                        person = null;
                      }
                      checked = false;
                      error = null;
                    }),
              child: const Text('تعديل البيانات'),
            ),
        ],
      ],
    ),
  );
}

class DispatchHistory extends StatelessWidget {
  final ApiClient api;
  final String gymId;
  const DispatchHistory({super.key, required this.api, required this.gymId});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'حركة محفظة الجيم',
    child: PagedRecords(
      api: api,
      path: 'gyms/$gymId/point-transfers',
      item: (r) => Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              r['kind'] == 'GYM_SALE' ? 'بيع نقاط لمتدرب' : 'شحن من المنصة',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            Fact('النقاط', '${r['points']} نقطة'),
            Fact('المستلم', '${r['recipientLabel']}'),
            Fact('التحصيل', '${money(r['chargePiasters'])} ج.م'),
            Text(
              shortDate(r['createdAt']),
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            Reference('${r['id']}'),
          ],
        ),
      ),
    ),
  );
}

class BranchesScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  const BranchesScreen({super.key, required this.api, required this.gym});
  @override
  Widget build(BuildContext context) => DataView(
    load: () => api.request('gyms/${gym['id']}/branches?limit=100'),
    builder: (d, reload) => ListView(
      padding: const EdgeInsets.all(22),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'فروع ${gym['name']}',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            IconButton.filled(
              tooltip: 'إضافة فرع',
              onPressed: () async {
                await open(context, BranchForm(api: api, gymId: gym['id']));
                await reload();
              },
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const Text(
          'حدد مكان الفرع على الخريطة واقترح نقاط الزيارة ومدتها. الإدارة هتراجعهم قبل التفعيل.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 22),
        if (rows(d).isEmpty)
          const EmptyState(
            'ضيف أول فرع ليك',
            detail: 'اضغط + وكمّل بيانات الفرع والموقع.',
          ),
        ...rows(d).map(
          (b) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${b['name']}',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      StatusPill(b['status']),
                    ],
                  ),
                  Text(
                    '${b['address']}',
                    style: const TextStyle(color: muted, fontSize: 12),
                  ),
                  Fact(
                    'الزيارة',
                    '${b['visitPricePoints']} نقطة · ${b['sessionMinutes']} دقيقة',
                  ),
                  Fact(
                    'رصيد الفرع',
                    '${(b['pointAccounts'] as List? ?? []).firstOrNull?['balance'] ?? 0} نقطة',
                  ),
                  if (b['priceApprovedAt'] == null)
                    const Text(
                      'الموقع وسعر الزيارة بانتظار اعتماد الإدارة.',
                      style: TextStyle(color: green, fontSize: 12),
                    ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton.icon(
                        onPressed: b['status'] != 'ACTIVE'
                            ? null
                            : () async {
                                await open(
                                  context,
                                  TopupScreen(api: api, branchId: b['id']),
                                );
                                await reload();
                              },
                        icon: const Icon(Icons.add_card_rounded, size: 18),
                        label: const Text('شراء نقاط'),
                      ),
                      TextButton(
                        onPressed: () async {
                          await open(
                            context,
                            BranchForm(api: api, gymId: gym['id'], branch: b),
                          );
                          await reload();
                        },
                        child: const Text('تعديل البيانات'),
                      ),
                      TextButton(
                        onPressed: () => open(
                          context,
                          StaffScreen(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: const Text('الموظفين'),
                      ),
                      TextButton(
                        onPressed: () => open(
                          context,
                          OwnerReport(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: const Text('الحركة'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

class BranchForm extends StatefulWidget {
  final ApiClient api;
  final String gymId;
  final Json? branch;
  const BranchForm({
    super.key,
    required this.api,
    required this.gymId,
    this.branch,
  });
  @override
  State<BranchForm> createState() => _BranchFormState();
}

class _BranchFormState extends State<BranchForm> {
  final form = GlobalKey<FormState>();
  late final fields = {
    for (final k in [
      'name',
      'address',
      'governorate',
      'city',
      'contactPhone',
      'openingHours',
      'visitPricePoints',
      'sessionMinutes',
    ])
      k: TextEditingController(
        text: '${widget.branch?[k] ?? (k == 'sessionMinutes' ? '120' : '')}',
      ),
  };
  LatLng? point;
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    final b = widget.branch;
    if (b?['latitude'] != null && b?['longitude'] != null) point = pointOf(b!);
  }

  @override
  void dispose() {
    for (final c in fields.values) c.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy || !form.currentState!.validate()) return;
    if (point == null) {
      setState(() => error = Exception('حدد مكان الفرع على الخريطة أولًا.'));
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body = <String, dynamic>{
        for (final e in fields.entries.where(
          (e) =>
              !['visitPricePoints', 'sessionMinutes'].contains(e.key) &&
              e.value.text.isNotEmpty,
        ))
          e.key: e.value.text,
        'latitude': point!.latitude,
        'longitude': point!.longitude,
        if (widget.branch == null) ...{
          'visitPricePoints': int.tryParse(
            digits(fields['visitPricePoints']!.text),
          ),
          'sessionMinutes': int.tryParse(
            digits(fields['sessionMinutes']!.text),
          ),
        },
      };
      await widget.api.request(
        'gyms/${widget.gymId}/branches${widget.branch == null ? '' : '/${widget.branch!['id']}'}',
        method: widget.branch == null ? 'POST' : 'PATCH',
        body: body,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: widget.branch == null ? 'فرع جديد' : 'تعديل الفرع',
    child: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(22),
        children: [
          for (final e in fields.entries.where(
            (e) =>
                widget.branch == null ||
                !['visitPricePoints', 'sessionMinutes'].contains(e.key),
          ))
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                controller: e.value,
                enabled: !busy,
                keyboardType:
                    ['visitPricePoints', 'sessionMinutes'].contains(e.key)
                    ? TextInputType.number
                    : e.key == 'contactPhone'
                    ? TextInputType.phone
                    : TextInputType.text,
                decoration: InputDecoration(
                  labelText: {
                    'name': 'اسم الفرع',
                    'address': 'العنوان بالتفصيل',
                    'governorate': 'المحافظة',
                    'city': 'المدينة',
                    'contactPhone': 'رقم تواصل الفرع · اختياري',
                    'openingHours': 'مواعيد العمل · اختياري',
                    'visitPricePoints': 'نقاط الزيارة المقترحة',
                    'sessionMinutes': 'مدة الجلسة بالدقائق',
                  }[e.key],
                ),
                validator: (v) =>
                    !['contactPhone', 'openingHours'].contains(e.key) &&
                        (v ?? '').trim().isEmpty
                    ? 'كمّل الحقل ده'
                    : null,
              ),
            ),
          OutlinedButton.icon(
            onPressed: busy
                ? null
                : () async {
                    final p = await open<LatLng>(
                      context,
                      LocationPicker(initial: point),
                    );
                    if (p != null && mounted) setState(() => point = p);
                  },
            icon: Icon(
              point == null
                  ? Icons.add_location_alt_outlined
                  : Icons.check_circle_outline_rounded,
            ),
            label: Text(
              point == null
                  ? 'حدد المكان على الخريطة'
                  : 'المكان متحدد · تعديل الموقع',
            ),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            widget.branch == null ? 'إرسال الفرع للمراجعة' : 'حفظ بيانات الفرع',
            busy: busy,
            onPressed: save,
          ),
        ],
      ),
    ),
  );
}

class StaffScreen extends StatelessWidget {
  final ApiClient api;
  final String gymId;
  final Json branch;
  const StaffScreen({
    super.key,
    required this.api,
    required this.gymId,
    required this.branch,
  });
  @override
  Widget build(BuildContext context) => Screen(
    title: 'موظفين ${branch['name']}',
    child: DataView(
      load: () => api.request('gyms/$gymId/staff?limit=100'),
      builder: (d, reload) => ListView(
        padding: const EdgeInsets.all(22),
        children: [
          ActionButton(
            'دعوة موظف',
            icon: Icons.person_add_alt_rounded,
            onPressed: () async {
              await open(
                context,
                InviteStaff(api: api, gymId: gymId, branchId: branch['id']),
              );
              await reload();
            },
          ),
          const SizedBox(height: 20),
          ...rows(d)
              .where((s) => s['branchId'] == branch['id'])
              .map(
                (s) => Panel(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.person_outline_rounded),
                    title: Text('${s['user']?['displayName']}'),
                    subtitle: Text(
                      '${s['role'] == 'CASHIER' ? 'كاشير' : 'مدير فرع'} · ${s['active'] == true ? 'نشط' : 'غير نشط'}',
                    ),
                  ),
                ),
              ),
        ],
      ),
    ),
  );
}

class InviteStaff extends StatefulWidget {
  final ApiClient api;
  final String gymId, branchId;
  const InviteStaff({
    super.key,
    required this.api,
    required this.gymId,
    required this.branchId,
  });
  @override
  State<InviteStaff> createState() => _InviteStaffState();
}

class _InviteStaffState extends State<InviteStaff> {
  final name = TextEditingController(),
      email = TextEditingController(),
      phone = TextEditingController();
  String role = 'CASHIER';
  bool busy = false;
  Object? error;
  Json? result;
  @override
  void dispose() {
    name.dispose();
    email.dispose();
    phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'دعوة موظف',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        if (result == null) ...[
          for (final field in [
            (name, 'اسم الموظف'),
            (email, 'الإيميل'),
            (phone, 'رقم الموبايل'),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: TextField(
                controller: field.$1,
                enabled: !busy,
                decoration: InputDecoration(labelText: field.$2),
              ),
            ),
          DropdownButtonFormField<String>(
            initialValue: role,
            decoration: const InputDecoration(labelText: 'الدور'),
            items: const [
              DropdownMenuItem(value: 'CASHIER', child: Text('كاشير')),
              DropdownMenuItem(
                value: 'BRANCH_MANAGER',
                child: Text('مدير فرع'),
              ),
            ],
            onChanged: busy ? null : (v) => setState(() => role = v!),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            'إنشاء الدعوة',
            busy: busy,
            onPressed: () async {
              if (busy) return;
              setState(() => busy = true);
              try {
                final r = await widget.api.request(
                  'gyms/${widget.gymId}/staff-invitations',
                  method: 'POST',
                  body: {
                    'branchId': widget.branchId,
                    'role': role,
                    'contact': {
                      'displayName': name.text,
                      'email': email.text,
                      'phone': phone.text,
                    },
                  },
                );
                if (mounted)
                  setState(() => result = Map<String, dynamic>.from(r));
              } catch (e) {
                if (mounted) setState(() => error = e);
              } finally {
                if (mounted) setState(() => busy = false);
              }
            },
          ),
        ] else ...[
          const EmptyState(
            'الدعوة جاهزة',
            detail:
                'شارك الرابط مع الموظف ليختار كلمة السر ويقبل الدعوة. الرابط مؤقت وسري.',
            icon: Icons.mark_email_read_outlined,
          ),
          const SizedBox(height: 18),
          SelectableText(
            'https://gym-network-platform.vercel.app/#invite=${result!['token']}',
            textDirection: TextDirection.ltr,
          ),
        ],
      ],
    ),
  );
}

class OwnerReport extends StatelessWidget {
  final ApiClient api;
  final String gymId;
  final Json? branch;
  const OwnerReport({
    super.key,
    required this.api,
    required this.gymId,
    this.branch,
  });
  @override
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: Text(branch == null ? 'حركة الجيم' : 'حركة ${branch!['name']}'),
        bottom: const TabBar(
          tabs: [
            Tab(text: 'الزيارات'),
            Tab(text: 'المبيعات'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          for (final kind in ['VISITS', 'SALES'])
            PagedRecords(
              api: api,
              path:
                  'reports/rows?gymId=$gymId&${reportRange()}&kind=$kind${branch == null ? '' : '&branchId=${branch!['id']}'}',
              item: (r) => Panel(
                child: Column(
                  children: [
                    Fact(
                      r['branchName'] ?? 'محفظة الجيم',
                      '${r['points']} نقطة',
                      strong: true,
                    ),
                    Fact('القيمة', '${money(r['amountPiasters'])} ج.م'),
                    StatusPill(r['status']),
                    Text(
                      shortDate(r['eventAt']),
                      style: const TextStyle(color: muted, fontSize: 12),
                    ),
                    Reference('${r['referenceId']}'),
                  ],
                ),
              ),
            ),
        ],
      ),
    ),
  );
}

