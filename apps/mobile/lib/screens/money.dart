import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'owner.dart';

class MoneyScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  const MoneyScreen({super.key, required this.api, required this.gym});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'المستحقات ومديونيات الخدمات',
    child: DataView(
    load: () => Future.wait([
      api.request('reports/summary?gymId=${gym['id']}&${reportRange()}'),
      api.request('gyms/${gym['id']}/withdrawals?limit=100'),
    ]),
    builder: (data, reload) {
      final charges=data[0]['serviceCharges'] as Map? ?? {};
      final net='${charges['netAvailablePiasters'] ?? ((data[0]['currentBalances'] as List? ?? []).cast<Map>().where((b)=>b['type']=='GYM_AVAILABLE').firstOrNull?['balancePiasters'] ?? '0')}';
      final balances = data[0]['currentBalances'] as List? ?? [];
      String get(String t) =>
          '${balances.cast<Map>().where((b) => b['type'] == t).firstOrNull?['balancePiasters'] ?? '0'}';
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(22),
        children: [
          PortalIntro(
            'مستحقاتك واضحة',
            eyebrow: '${gym['name']}',
            detail: 'تابع فلوس زيارات الجيم وحالة كل طلب سحب.',
          ),
          Panel(
            color: ink,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'متاح للسحب',
                  style: TextStyle(color: Colors.white70),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    '${money(net)} ج.م',
                    style: const TextStyle(
                      fontSize: 37,
                      fontWeight: FontWeight.w900,
                      color: lime,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: lime,
                    foregroundColor: ink,
                  ),
                  onPressed:
                      BigInt.parse(net) <= BigInt.zero ||
                          gym['status'] != 'ACTIVE'
                      ? null
                      : () async {
                          await open(
                            context,
                            WithdrawalForm(
                              api: api,
                              gymId: gym['id'],
                              available: net,
                            ),
                          );
                          await reload();
                        },
                  icon: const Icon(Icons.south_west_rounded),
                  label: const Text('طلب سحب مستحقات'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const PortalNote(
            'التحويل خلال ٣ أيام عمل من قبول طلب السحب.',
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Fact('محجوز للسحب', '${money(get('GYM_RESERVED'))} ج.م'),
                Fact('محجوز لمراجعة نزاع', '${money(get('GYM_DISPUTED'))} ج.م'),
                Fact('إجمالي مدفوع للجيم', '${money(get('GYM_PAID'))} ج.م'),
              ],
            ),
          ),
          const SectionTitle('مديونيات الخدمات'),
          const PortalNote('تكلفة الخدمات بتتخصم من المستحقات. لو المديونية أكبر، المتاح للسحب بيكون صفر والباقي بيترحّل للتحصيل القادم.'),
          Panel(child:Column(children:[Fact('مستحقات قبل الخصم','${money(charges['grossAvailablePiasters']??'0')} ج.م'),Fact('مديونية مستحقة','${money(charges['debtPiasters']??'0')} ج.م'),Fact('إعلانات مجدولة لم تستحق بعد','${money(charges['scheduledPiasters']??'0')} ج.م'),Fact('صافي متاح للسحب','${money(net)} ج.م')])),
          for(final c in (charges['items'] as List? ?? []))Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${c['description']}'),Fact('التكلفة','${money(c['amountPiasters'])} ج.م'),Fact('تم خصمه','${money(c['collectedPiasters'])} ج.م'),Fact('متبقي','${money(c['outstandingPiasters'])} ج.م')])),
          const SectionTitle('طلبات السحب'),
          if (rows(data[1]).isEmpty) const EmptyState('مفيش طلبات سحب لسه'),
          ...rows(data[1]).map(
            (w) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${money(w['amountPiasters'])} ج.م',
                            style: const TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        StatusPill(w['status']),
                      ],
                    ),
                    Text(
                      shortDate(w['requestedAt']),
                      style: const TextStyle(color: muted, fontSize: 12),
                    ),
                    if (w['dueAt'] != null)
                      Fact('موعد التنفيذ', '${shortDate(w['dueAt'])}'),
                    if (w['reviewReason'] != null) Text('${w['reviewReason']}'),
                    TextButton(
                      onPressed: () async {
                        await open(
                          context,
                          WithdrawalDetail(api: api, id: w['id']),
                        );
                        await reload();
                      },
                      child: const Text('التفاصيل والمتابعة'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      );
    },
    ),
  );
}

class WithdrawalForm extends StatefulWidget {
  final ApiClient api;
  final String gymId, available;
  const WithdrawalForm({
    super.key,
    required this.api,
    required this.gymId,
    required this.available,
  });
  @override
  State<WithdrawalForm> createState() => _WithdrawalFormState();
}

class _WithdrawalFormState extends State<WithdrawalForm> {
  final amount = TextEditingController(),
      name = TextEditingController(),
      account = TextEditingController();
  String method = 'INSTAPAY';
  bool busy = false, review = false, verified = false;
  Object? error;
  @override
  void dispose() {
    amount.dispose();
    name.dispose();
    account.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'طلب سحب',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Panel(
          child: Fact(
            'رصيدك المتاح',
            '${money(widget.available)} ج.م',
            strong: true,
          ),
        ),
        const SizedBox(height: 22),
        if (!review) ...[
          for (final f in [
            (amount, 'المبلغ بالجنيه'),
            (name, 'اسم صاحب الحساب'),
            (account, 'حساب إنستا باي أو رقم المحفظة'),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 15),
              child: TextField(
                controller: f.$1,
                enabled: !busy,
                keyboardType: f.$1 == amount
                    ? const TextInputType.numberWithOptions(decimal: true)
                    : TextInputType.text,
                decoration: InputDecoration(labelText: f.$2),
              ),
            ),
          DropdownButtonFormField<String>(
            initialValue: method,
            decoration: const InputDecoration(labelText: 'طريقة الاستلام'),
            items: const [
              DropdownMenuItem(value: 'INSTAPAY', child: Text('إنستا باي')),
              DropdownMenuItem(value: 'WALLET', child: Text('محفظة إلكترونية')),
            ],
            onChanged: busy ? null : (v) => setState(() => method = v!),
          ),
          const SizedBox(height: 22),
          ActionButton(
            'مراجعة الطلب',
            onPressed: () {
              final n = piasters(amount.text);
              if (n == null ||
                  BigInt.parse(n) <= BigInt.zero ||
                  BigInt.parse(n) > BigInt.parse(widget.available) ||
                  name.text.trim().length < 2 ||
                  account.text.trim().length < 3) {
                setState(
                  () => error = Exception('راجع المبلغ وبيانات الاستلام.'),
                );
                return;
              }
              setState(() {
                review = true;
                error = null;
              });
            },
          ),
        ] else ...[
          Panel(
            child: Column(
              children: [
                Fact(
                  'المبلغ',
                  '${money(piasters(amount.text))} ج.م',
                  strong: true,
                ),
                Fact('المستلم', name.text),
                Fact('حساب الاستلام', account.text),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'المبلغ يتحجز من رصيدك المتاح عند إرسال الطلب، والتحويل يتم يدويًا بعد مراجعة الإدارة. موعد التنفيذ يظهر بعد القبول.',
            style: TextStyle(color: muted, fontSize: 13),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: verified,
            onChanged: busy
                ? null
                : (v) => setState(() => verified = v ?? false),
            title: const Text('راجعت بيانات حساب الاستلام والمبلغ.'),
          ),
          ActionButton(
            'تأكيد طلب السحب',
            busy: busy,
            onPressed: !verified || widget.api.pending != null
                ? null
                : () async {
                    if (busy) return;
                    setState(() => busy = true);
                    try {
                      await widget.api.transact(
                        'gyms/${widget.gymId}/withdrawals',
                        {
                          'paymentMethod': method,
                          'destinationAccount': account.text,
                          'destinationName': name.text,
                          'amountPiasters': piasters(amount.text),
                        },
                      );
                      if (context.mounted) Navigator.pop(context, true);
                    } catch (e) {
                      if (mounted) setState(() => error = e);
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
          ),
          TextButton(
            onPressed: busy || widget.api.pending != null
                ? null
                : () => setState(() => review = false),
            child: const Text('تعديل الطلب'),
          ),
        ],
        ErrorNote(error),
      ],
    ),
  );
}

class WithdrawalDetail extends StatefulWidget {
  final ApiClient api;
  final String id;
  const WithdrawalDetail({super.key, required this.api, required this.id});
  @override
  State<WithdrawalDetail> createState() => _WithdrawalDetailState();
}

class _WithdrawalDetailState extends State<WithdrawalDetail> {
  bool busy = false;
  Object? error;
  final reason = TextEditingController();
  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  Future<void> act(
    String path,
    Json body,
    Future<void> Function() reload,
  ) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.api.transact('withdrawals/${widget.id}/$path', body);
      await reload();
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'تفاصيل السحب',
    child: DataView(
      load: () => widget.api.request('withdrawals/${widget.id}'),
      builder: (d, reload) {
        final w = d['withdrawal'];
        return ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Panel(
              child: Column(
                children: [
                  StatusPill(w['status']),
                  Fact(
                    'المبلغ',
                    '${money(w['amountPiasters'])} ج.م',
                    strong: true,
                  ),
                  Fact('المستلم', '${w['destinationName']}'),
                  Fact('حساب الاستلام', '${w['destinationAccount']}'),
                  if (w['dueAt'] != null)
                    Fact('موعد التحويل', shortDate(w['dueAt'])),
                  if (w['reviewReason'] != null) Text('${w['reviewReason']}'),
                  if (w['rejectionReason'] != null)
                    Text('${w['rejectionReason']}'),
                  if (w['transferReference'] != null)
                    Fact('مرجع التحويل', '${w['transferReference']}'),
                  Reference('${w['id']}'),
                ],
              ),
            ),
            if (['REQUESTED', 'PAID'].contains(w['status']) &&
                d['feedback'] == null) ...[
              const SizedBox(height: 22),
              TextField(
                controller: reason,
                enabled: !busy,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'السبب أو ملاحظات المتابعة · 5 حروف على الأقل',
                ),
              ),
              ErrorNote(error),
              if (w['status'] == 'REQUESTED')
                ActionButton(
                  'إلغاء طلب السحب وإعادة المبلغ للمتاح',
                  busy: busy,
                  onPressed: widget.api.pending != null
                      ? null
                      : () => act('cancel', {'reason': reason.text}, reload),
                )
              else ...[
                ActionButton(
                  'تأكيد استلام التحويل',
                  busy: busy,
                  onPressed: widget.api.pending != null
                      ? null
                      : () => act('feedback', {
                          'kind': 'RECEIVED',
                          'reason': reason.text,
                        }, reload),
                ),
                TextButton(
                  onPressed: busy || widget.api.pending != null
                      ? null
                      : () => act('feedback', {
                          'kind': 'DISPUTE',
                          'reason': reason.text,
                        }, reload),
                  child: const Text('عندي اعتراض على التحويل'),
                ),
              ],
            ],
            if (d['feedback'] != null)
              Panel(
                child: Text('تم تسجيل متابعتك: ${d['feedback']['reason']}'),
              ),
          ],
        );
      },
    ),
  );
}

