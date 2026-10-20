import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'account.dart';
import 'managed_branch.dart';

String? visitTicket(String input) {
  final text = input.trim();
  final value = text.startsWith('gymqr:') ? text.substring(6) : text;
  return RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(value) ? value : null;
}

/// Always-visible scope for staff and owner financial/attendance flows.
class OperationContext extends StatelessWidget {
 final String title,detail;
 final IconData icon;
 const OperationContext({super.key,required this.title,this.detail='',this.icon=Icons.storefront_outlined});
 @override Widget build(BuildContext context)=>Padding(
  padding:const EdgeInsets.only(bottom:18),
  child:Panel(padding:const EdgeInsets.all(14),child:Row(children:[
   Container(padding:const EdgeInsets.all(9),
    decoration:BoxDecoration(color:const Color(0xffe3fbf3),borderRadius:BorderRadius.circular(11)),
    child:Icon(icon,color:green,size:20)),
   const SizedBox(width:10),
   Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(title,style:const TextStyle(fontSize:14,fontWeight:FontWeight.w800)),
    if(detail.isNotEmpty)Text(detail,style:const TextStyle(color:muted,fontSize:11)),
   ])),
  ])));
}

class StaffWorkplace extends StatelessWidget {
  final ApiClient api;
  final int section;
  final String? branchId;
  final ValueChanged<String> onBranchChanged;
  final VoidCallback showVisits, showSales;
  const StaffWorkplace({super.key, required this.api, required this.section,
    required this.branchId, required this.onBranchChanged, required this.showVisits, required this.showSales});
  @override
  Widget build(BuildContext context) => DataView(
    load: () => api.request('operations/branches'),
    builder: (data, reload) {
      final branches = rows(data);
      if (branches.isEmpty) return ListView(padding: const EdgeInsets.all(20), children: const [
        EmptyState('مفيش فرع متاح للتشغيل', detail: 'راجع صاحب الجيم لتفعيل الفرع وتعيين حسابك عليه.'),
      ]);
      final branch = branches.where((b) => b['id'] == branchId).firstOrNull ?? branches.first;
      return Column(children: [
        Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12), child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(branch['canCancel'] == true ? 'مدير الفرع' : 'كاشير الفرع', style: const TextStyle(color: green, fontSize: 12, fontWeight: FontWeight.w700)),
            if (branches.length > 1) DropdownButton<String>(value: branch['id'], isExpanded: true,
              underline: const SizedBox.shrink(), items: branches.map((b) => DropdownMenuItem<String>(value: b['id'],
                child: Text('${b['name']}', maxLines: 1, overflow: TextOverflow.ellipsis))).toList(),
              onChanged: api.pending != null ? null : (id) => onBranchChanged(id!))
            else Text('${branch['name']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            Text('${branch['gymName']}', style: const TextStyle(color: muted, fontSize: 11)),
          ])),
          IconButton(tooltip: 'الإشعارات', icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => open(context, NotificationsScreen(api: api))),
        ])),
        Expanded(child: KeyedSubtree(key: ValueKey('${branch['id']}:$section'), child: switch(section) {
          1 => BranchRecords(api: api, branch: branch, kind: 'visits', embedded: true),
          2 => BranchRecords(api: api, branch: branch, kind: 'sales', embedded: true),
          _ => BranchDashboard(api: api, branch: branch, showVisits: showVisits, showSales: showSales),
        })),
      ]);
    },
  );
}

class BranchDashboard extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  final VoidCallback? showVisits, showSales;
  const BranchDashboard({super.key, required this.api, required this.branch, this.showVisits, this.showSales});
  @override
  State<BranchDashboard> createState() => _BranchDashboardState();
}
class _BranchDashboardState extends State<BranchDashboard> {
  Json? summary, report;
  Object? summaryError, reportError;
  bool summaryLoading = true, reportLoading = true;
  int generation = 0;
  @override
  void initState() { super.initState(); load(); }
  Future<void> load() async {
    final current = ++generation;
    setState(() { summaryLoading = reportLoading = true; summaryError = reportError = null; });
    final now = DateTime.now();
    final day = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    Future<void> part(String path, bool stock) async {
      try {
        final data = Map<String, dynamic>.from(await widget.api.request(path));
        if (mounted && current == generation) setState(() { if (stock) { summary = data; } else { report = data; } });
      } catch(e) {
        if (mounted && current == generation) setState(() { if (stock) { summary = null; summaryError = e; } else { report = null; reportError = e; } });
      } finally {
        if (mounted && current == generation) setState(() { if (stock) { summaryLoading = false; } else { reportLoading = false; } });
      }
    }
    await Future.wait([
      part('operations/branches/${widget.branch['id']}/summary', true),
      part('reports/summary?gymId=${widget.branch['gymId']}&branchId=${widget.branch['id']}&from=$day&to=$day', false),
    ]);
  }
  Future<void> action(Widget page) async { await open(context, page); if (mounted) await load(); }
  void records(String kind) {
    final callback = kind == 'visits' ? widget.showVisits : widget.showSales;
    if (callback != null) { callback(); } else { open(context, BranchRecords(api: widget.api, branch: widget.branch, kind: kind)); }
  }
  @override
  Widget build(BuildContext context) {
    final branch = widget.branch, locked = widget.api.pending != null;
    return RefreshIndicator(onRefresh: load, child: ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28), physics: const AlwaysScrollableScrollPhysics(), children: [
        Panel(color: ink, padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('رصيد الفرع لبيع النقاط', style: TextStyle(color: Colors.white70, fontSize: 12)),
          const SizedBox(height: 8),
          if (summaryLoading && summary == null) const LinearProgressIndicator(color: lime)
          else FittedBox(fit: BoxFit.scaleDown, child: Text(summary == null ? 'تعذر تحميل الرصيد' : '${summary!['stock'] ?? '—'} نقطة',
            style: const TextStyle(color: lime, fontSize: 30, fontWeight: FontWeight.w900))),
          const SizedBox(height: 10),
          if (summary != null) Text('الزيارة ${summary!['visitPricePoints'] ?? '—'} نقطة · ${summary!['sessionMinutes'] ?? '—'} دقيقة', style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ])),
        if (summaryError != null) ErrorNote(summaryError, retry: load),
        if (summary != null && '${summary!['stock']}' == '0') const Padding(padding: EdgeInsets.only(top: 12),
          child: PortalNote('رصيد بيع النقاط خلص. اطلب من صاحب الجيم يوزّع نقاط للفرع. تسجيل الزيارات متاح من رصيد المتدرب.')),
        const SectionTitle('إجراء سريع'),
        if (branch['canSell'] == true) ...[
          ActionButton('تسجيل زيارة', icon: Icons.qr_code_scanner_rounded,
            onPressed: locked ? null : () => action(RecordVisit(api: widget.api, branch: branch))),
          const SizedBox(height: 10),
          OutlinedButton.icon(icon: const Icon(Icons.add_card_rounded), label: const Text('بيع نقاط لمتدرب'),
            onPressed: locked || summary == null || summaryLoading || '${summary!['stock']}' == '0' ? null : () => action(BranchSale(api: widget.api, branch: branch))),
        ],
        const SectionTitle('حركة الفرع النهارده'),
        Panel(padding: const EdgeInsets.all(16), child: Column(children: [
          if (reportLoading && report == null) const LinearProgressIndicator(minHeight: 2),
          if (report != null) ...[
            Fact('زيارات مسجلة', '${report!['visits']?['count'] ?? '—'}'),
            Fact('نقاط مباعة', '${report!['sales']?['points'] ?? '—'}'),
            if (report!['sales']?['amountPiasters'] != null) Fact('تحصيل بيع النقاط', '${money(report!['sales']['amountPiasters'])} ج.م', strong: true),
          ],
          if (reportError != null) ErrorNote(reportError, retry: load),
        ])),
        if((branch['permissions'] as List? ?? []).isNotEmpty)...[
          const SectionTitle('الصلاحيات المفوّضة لك'),
          Panel(child:Column(children:[
            for(final item in const [
              ('MANAGE_CASHIERS','staff','فريق الكاشير'),('EDIT_BRANCH','edit','بيانات الفرع'),
              ('REQUEST_PRICING','price','طلب تعديل السعر'),('REQUEST_WITHDRAWAL','withdraw','مستحقات الفرع والسحب'),
              ('TRANSFER_STOCK','transfer','تحويل نقاط الفرع'),
            ])if((branch['permissions'] as List).contains(item.$1))ListTile(contentPadding:EdgeInsets.zero,title:Text(item.$3),trailing:const Icon(Icons.chevron_left_rounded),onTap:locked?null:()=>action(ManagedBranch(api:widget.api,branch:branch,task:item.$2))),
          ])),
        ],
        const SectionTitle('متابعة الفرع'),
        Panel(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4), child: Column(children: [
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.directions_run_rounded, color: green),
            title: const Text('سجل الزيارات'), trailing: const Icon(Icons.chevron_left_rounded), onTap: () => records('visits')),
          const Divider(height: 1),
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.receipt_long_outlined, color: green),
            title: const Text('سجل المبيعات'), trailing: const Icon(Icons.chevron_left_rounded), onTap: () => records('sales')),
          if (branch['canCancel'] == true) ...[
            const Divider(height: 1),
            const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text('إلغاء الزيارة متاح خلال أول ١٠ دقائق من سجل الزيارات. بعد كده يُرسل طلب مراجعة.', style: TextStyle(color: muted, fontSize: 12))),
          ],
        ])),
        TextButton.icon(onPressed: () => open(context, OperationReviewsScreen(api: widget.api)),
          icon: const Icon(Icons.fact_check_outlined), label: const Text('طلبات المراجعة')),
      ],
    ));
  }
}

class OperationReviewsScreen extends StatelessWidget {
  final ApiClient api;
  const OperationReviewsScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) => Screen(title: 'طلبات المراجعة', child: PagedRecords(
    api: api, path: 'operation-reviews', item: (r) => Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      StatusPill('${r['status']}'), Fact('السبب', '${r['reason']}'),
      if (r['reviewReason'] != null) Fact('رد الإدارة', '${r['reviewReason']}'), Reference('${r['id']}'),
    ])),
  ));
}

class OperationsHome extends StatelessWidget {
  final ApiClient api;
  final String? gymId;
  const OperationsHome({super.key, required this.api, this.gymId});
  @override
  Widget build(BuildContext context) => DataView(
    load: () => api.request('operations/branches'),
    builder: (data, reload) {
      final branches = rows(data)
          .where((b) => gymId == null || b['gymId'] == gymId)
          .toList();
      final manager = api.user?['role'] == 'BRANCH_MANAGER';
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          PortalIntro(
            manager ? 'إدارة فرعك' : 'تشغيل الجيم',
            eyebrow: manager
                ? 'مدير الفرع'
                : api.user?['role'] == 'GYM_OWNER'
                ? 'صاحب الجيم'
                : 'مساحة الموظف',
            detail: 'اختار مهمتك من الفرع الصحيح. كل عملية بتتسجل باسم حسابك.',
          ),
          if (branches.isNotEmpty)
            Text(
              '${branches.length} فرع متاح لحسابك',
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          const SizedBox(height: 14),
          if (branches.isEmpty)
            const EmptyState(
              'مفيش فرع متاح للتشغيل',
              detail: 'لازم الفرع يكون نشط وحسابك متعيّن عليه. راجع صاحب الجيم أو الإدارة.',
            ),
          for (final branch in branches)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${branch['gymName']}',
                      style: const TextStyle(color: muted),
                    ),
                    Text(
                      '${branch['name']}',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 10),
                    if (branch['canCancel'] == true)
                      const Text(
                        'تقدر تلغي الزيارة خلال أول ١٠ دقائق.',
                        style: TextStyle(color: green, fontSize: 12),
                      ),
                    if (branch['canSell'] == true) ...[
                      const SizedBox(height: 14),
                      PortalGrid(
                        children: [
                          PortalTask(
                            'تسجيل زيارة',
                            icon: Icons.qr_code_scanner_rounded,
                            primary: true,
                            detail: 'مسح رمز المتدرب',
                            onTap: () async {
                              await open(
                                context,
                                RecordVisit(api: api, branch: branch),
                              );
                              await reload();
                            },
                          ),
                          PortalTask(
                            'شحن متدرب',
                            icon: Icons.add_card_rounded,
                            detail: 'من رصيد الفرع',
                            onTap: () async {
                              await open(
                                context,
                                BranchSale(api: api, branch: branch),
                              );
                              await reload();
                            },
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    ActionButton(
                      'فتح الفرع',
                      onPressed: () async {
                        await open(
                          context,
                          BranchWorkspace(api: api, branch: branch),
                        );
                        await reload();
                      },
                    ),
                  ],
                ),
              ),
            ),
          TextButton.icon(
            onPressed: () => open(context, NotificationsScreen(api: api)),
            icon: const Icon(Icons.notifications_none_rounded),
            label: const Text('الإشعارات'),
          ),
          TextButton.icon(
            onPressed: () => open(
              context,
              Screen(
                title: 'طلبات المراجعة',
                child: PagedRecords(
                  api: api,
                  path: 'operation-reviews',
                  item: (r) => Panel(
                    child: Column(
                      children: [
                        StatusPill('${r['status']}'),
                        Fact('السبب', '${r['reason']}'),
                        if (r['reviewReason'] != null)
                          Fact('رد الإدارة', '${r['reviewReason']}'),
                        Reference('${r['id']}'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            icon: const Icon(Icons.fact_check_outlined),
            label: const Text('متابعة طلبات المراجعة'),
          ),
        ],
      );
    },
  );
}

class BranchWorkspace extends StatelessWidget {
  final ApiClient api;
  final Json branch;
  const BranchWorkspace({super.key, required this.api, required this.branch});
  @override
  Widget build(BuildContext context) => Screen(title: '${branch['name']}',
    child: BranchDashboard(api: api, branch: branch));
}

class BranchSale extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  const BranchSale({super.key, required this.api, required this.branch});
  @override
  State<BranchSale> createState() => _BranchSaleState();
}

class _BranchSaleState extends State<BranchSale> {
  final phone = TextEditingController(), points = TextEditingController();
  Json? person, quote, result;
  bool busy = false, confirmed = false;
  Object? error;
  String get path => 'cashier/branches/${widget.branch['id']}';
  @override
  void dispose() {
    phone.dispose();
    points.dispose();
    super.dispose();
  }

  Future<void> advance() async {
    if (busy || widget.api.pending != null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (person == null) {
        final r = await widget.api.request(
          '$path/trainee-lookup',
          method: 'POST',
          body: {'phone': phone.text},
        );
        if (mounted) setState(() => person = Map<String, dynamic>.from(r));
      } else if (quote == null) {
        final r = await widget.api.request(
          '$path/sale-quotes',
          method: 'POST',
          body: {
            'traineeId': person!['id'],
            'points': int.tryParse(digits(points.text)),
          },
        );
        if (mounted) setState(() => quote = Map<String, dynamic>.from(r));
      } else if (confirmed) {
        final r = await widget.api.transact('$path/sales', {
          'traineeId': person!['id'],
          'points': quote!['points'],
          'pricingVersion': quote!['pricingVersion'],
          'receivedAmountPiasters': quote!['chargePiasters'],
          'fundsReceived': true,
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
    title: 'بيع نقاط لمتدرب',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        OperationContext(title:'${widget.branch['name']}',detail:'بيع من مخزون الفرع بعد تحصيل المبلغ'),
        if (result != null) ...[
          const EmptyState(
            'تم شحن المتدرب',
            icon: Icons.check_circle_rounded,
            detail: 'اتخصمت النقاط من رصيد الفرع واتضافت لمحفظة المتدرب.',
          ),
          Fact('النقاط', '${result!['points']}', strong: true),
          Fact('المبلغ المحصّل', '${money(result!['chargePiasters'])} ج.م'),
          Reference('${result!['id']}'),
          ActionButton('تم', onPressed: () => Navigator.pop(context)),
        ] else ...[
          FlowSteps(
            labels: const ['المتدرب', 'النقاط', 'التأكيد'],
            current: person == null
                ? 0
                : quote == null
                ? 1
                : 2,
          ),
          Text(
            person == null
                ? 'حدد المتدرب'
                : quote == null
                ? 'حدد عدد النقاط'
                : 'راجع الشحن',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 16),
          if (person == null)
            TextField(
              controller: phone,
              enabled: !busy && widget.api.pending == null,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'رقم موبايل المتدرب',
              ),
            ),
          if (person != null)
            Panel(
              child: Column(
                children: [
                  Fact('المتدرب', '${person!['label']}'),
                  Fact('آخر أرقام الموبايل', '${person!['phoneLast4']}'),
                ],
              ),
            ),
          if (person != null && quote == null) ...[
            const SizedBox(height: 16),
            TextField(
              controller: points,
              enabled: !busy && widget.api.pending == null,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'عدد النقاط'),
            ),
          ],
          if (quote != null) ...[
            Fact('النقاط', '${quote!['points']}'),
            Fact(
              'المطلوب تحصيله',
              '${money(quote!['chargePiasters'])} ج.م',
              strong: true,
            ),
            Fact('رصيد الفرع قبل البيع', '${quote!['stock']} نقطة'),
            Fact('المتبقي بعد البيع', '${BigInt.parse('${quote!['stock']}') - BigInt.from(quote!['points'])} نقطة'),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: confirmed,
              title: const Text('راجعت هوية المتدرب واستلمت المبلغ كاملًا'),
              onChanged: busy || widget.api.pending != null
                  ? null
                  : (v) => setState(() => confirmed = v == true),
            ),
          ],
          ErrorNote(error),
          if (widget.api.pending != null)
            const Text(
              'فيه عملية نتيجتها غير مؤكدة. ارجع للرئيسية وأعد نفس العملية بأمان.',
            ),
          const SizedBox(height: 20),
          ActionButton(
            person == null
                ? 'بحث عن المتدرب'
                : quote == null
                ? 'مراجعة الشحن'
                : 'تأكيد الشحن',
            busy: busy,
            onPressed: widget.api.pending != null || quote != null && !confirmed
                ? null
                : advance,
          ),
          if (person != null)
            TextButton(
              onPressed: busy || widget.api.pending != null
                  ? null
                  : () => setState(() {
                      if (quote != null) {
                        quote = null;
                      } else {
                        person = null;
                      }
                      confirmed = false;
                      error = null;
                    }),
              child: Text(quote != null ? 'تعديل النقاط' : 'اختيار متدرب آخر'),
            ),
        ],
      ],
    ),
  );
}

class RecordVisit extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  const RecordVisit({super.key, required this.api, required this.branch});
  @override
  State<RecordVisit> createState() => _RecordVisitState();
}

class _RecordVisitState extends State<RecordVisit> {
  final token = TextEditingController();
  Json? preview, result;
  String? reviewedToken;
  bool busy = false, confirmed = false;
  Object? error;
  @override
  void dispose() {
    token.dispose();
    super.dispose();
  }

  Future<void> advance() async {
    if (busy || widget.api.pending != null) return;
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final path = 'cashier/branches/${widget.branch['id']}';
      if (preview == null) {
        final value = visitTicket(token.text);
        if (value == null) throw const ApiFailure('QR_INVALID');
        final r = await widget.api.request(
          '$path/visit-previews',
          method: 'POST',
          body: {'token': value},
        );
        if (mounted)
          setState(() {
            preview = Map<String, dynamic>.from(r);
            reviewedToken = value;
          });
      } else if (confirmed) {
        final r = await widget.api.transact('$path/visits', {
          'token': reviewedToken,
          'pricingVersion': preview!['pricingVersion'],
          'branchPricingVersion': preview!['branchPricingVersion'],
          'presenceConfirmed': true,
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
    title: 'تسجيل زيارة',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        OperationContext(title:'${widget.branch['name']}',detail:'راجع المتدرب ونقاط الزيارة قبل التأكيد',icon:Icons.qr_code_scanner_rounded),
        if (result != null) ...[
          EmptyState(
            result!['alreadyActive'] == true
                ? 'الزيارة مسجلة بالفعل'
                : 'تم تسجيل الزيارة',
            detail: result!['alreadyActive'] == true
                ? 'لم يتم خصم نقاط مرة تانية.'
                : 'اتخصمت نقاط الزيارة من محفظة المتدرب.',
            icon: Icons.check_circle_rounded,
          ),
          Fact('نقاط الزيارة', '${result!['visit']['pointsCharged']}'),
          Fact('نهاية الجلسة', shortDate(result!['visit']['expiresAt'])),
          Reference('${result!['visit']['id']}'),
          ActionButton('تم', onPressed: () => Navigator.pop(context)),
        ] else ...[
          FlowSteps(
            labels: const ['رمز المتدرب', 'تأكيد الحضور'],
            current: preview == null ? 0 : 1,
          ),
          const Text(
            'المتدرب يفتح رمز الدخول من حسابه، وبعد المسح راجع بيانات الزيارة وأكد حضوره.',
          ),
          const SizedBox(height: 20),
          if (preview == null) ...[
            ActionButton(
              'مسح رمز المتدرب بالكاميرا',
              icon: Icons.qr_code_scanner_rounded,
              onPressed: busy || widget.api.pending != null
                  ? null
                  : () async {
                      final value = await open<String>(
                        context,
                        const ScanTicket(),
                      );
                      if (!mounted || value == null) return;
                      token.text = value;
                      await advance();
                    },
            ),
            const SizedBox(height: 16),
            TextField(
              controller: token,
              enabled: !busy && widget.api.pending == null,
              textDirection: TextDirection.ltr,
              decoration: const InputDecoration(
                labelText: 'أو الصق رمز الدخول',
              ),
            ),
          ] else ...[
            Panel(
              child: Column(
                children: [
                  Fact('المتدرب', '${preview!['traineeLabel']}'),
                  Fact('آخر أرقام الموبايل', '${preview!['phoneLast4']}'),
                  Fact(
                    'تكلفة الزيارة',
                    '${preview!['points']} نقطة',
                    strong: true,
                  ),
                  if (preview!['balance'] != null)
                    Fact('رصيد المتدرب', '${preview!['balance']} نقطة'),
                  Fact('مدة الزيارة', '${preview!['sessionMinutes']} دقيقة'),
                  if (preview!['alreadyActive'] == true)
                    const Text(
                      'فيه زيارة شغالة بالفعل؛ التأكيد مش هيخصم نقاط تاني.',
                    ),
                ],
              ),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: confirmed,
              title: const Text('تأكدت من هوية المتدرب وحضوره في الفرع'),
              onChanged: busy || widget.api.pending != null
                  ? null
                  : (v) => setState(() => confirmed = v == true),
            ),
          ],
          ErrorNote(error),
          if (widget.api.pending != null)
            const Text(
              'ارجع للرئيسية للتحقق من العملية المحفوظة قبل تسجيل زيارة جديدة.',
            ),
          const SizedBox(height: 20),
          ActionButton(
            preview == null ? 'مراجعة الزيارة' : 'تأكيد الحضور',
            busy: busy,
            onPressed:
                widget.api.pending != null || preview != null && !confirmed
                ? null
                : advance,
          ),
          if (preview != null)
            TextButton(
              onPressed: busy || widget.api.pending != null
                  ? null
                  : () => setState(() {
                      preview = null;
                      reviewedToken = null;
                      confirmed = false;
                      error = null;
                      token.clear();
                    }),
              child: const Text('مسح رمز جديد'),
            ),
        ],
      ],
    ),
  );
}

class ScanTicket extends StatefulWidget {
  const ScanTicket({super.key});
  @override
  State<ScanTicket> createState() => _ScanTicketState();
}

class _ScanTicketState extends State<ScanTicket> {
  bool done = false;
  @override
  Widget build(BuildContext context) => Screen(
    title: 'مسح رمز الدخول',
    child: Column(
      children: [
        const Padding(
          padding: EdgeInsets.all(20),
          child: Text(
            'وجّه الكاميرا لرمز المتدرب. لو الكاميرا غير متاحة، ارجع والصق الرمز.',
          ),
        ),
        Expanded(
          child: MobileScanner(
            onDetect: (capture) {
              if (done) return;
              for (final barcode in capture.barcodes) {
                final value = visitTicket(barcode.rawValue ?? '');
                if (value != null) {
                  done = true;
                  Navigator.pop(context, value);
                  break;
                }
              }
            },
          ),
        ),
      ],
    ),
  );
}

class BranchRecords extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  final String kind;
  final bool embedded;
  const BranchRecords({
    super.key,
    required this.api,
    required this.branch,
    required this.kind,
    this.embedded = false,
  });
  @override
  State<BranchRecords> createState() => _BranchRecordsState();
}

class _BranchRecordsState extends State<BranchRecords> {
  int version = 0;
  ApiClient get api => widget.api;
  Json get branch => widget.branch;
  String get kind => widget.kind;
  @override
  Widget build(BuildContext context) {
    final content = PagedRecords(
      key: ValueKey(version), api: api, path: 'operations/branches/${branch['id']}/$kind',
      item: (r) => _record(context, r),
    );
    return widget.embedded ? content : Screen(
    title: kind == 'visits' ? 'زيارات الفرع' : 'شحن المتدربين',
    child: content,
  );
  }
  Widget _record(BuildContext context, Json r) => Panel(

        child: Column(
          children: [
            if (kind == 'sales') Fact('المتدرب', '${r['traineeLabel']}'),
            Fact(
              'النقاط',
              '${r[kind == 'visits' ? 'pointsCharged' : 'points']}',
              strong: true,
            ),
            if (kind == 'sales')
              Fact('المبلغ المحصّل', '${money(r['chargePiasters'])} ج.م'),
            if (kind == 'visits') StatusPill('${r['status']}'),
            Fact(
              'التاريخ',
              shortDate(r[kind == 'visits' ? 'startedAt' : 'createdAt']),
            ),
            if (kind == 'visits')
              Fact('نهاية الجلسة', shortDate(r['expiresAt'])),
            Reference('${r['id']}'),
            if (kind == 'visits' && r['status'] != 'CANCELLED')
              TextButton(
                onPressed: () async {
                  await open(
                    context,
                    VisitCancellation(api: api, branch: branch, visit: r),
                  );
                  if (mounted) setState(() => version++);
                },
                child: Text(branch['canCancel'] == true ? 'مراجعة أو إلغاء الزيارة' : 'طلب مراجعة الزيارة'),
              ),
          ],
        ),
      );
}

class VisitCancellation extends StatefulWidget {
  final ApiClient api;
  final Json branch, visit;
  const VisitCancellation({
    super.key,
    required this.api,
    required this.branch,
    required this.visit,
  });
  @override
  State<VisitCancellation> createState() => _VisitCancellationState();
}

class _VisitCancellationState extends State<VisitCancellation> {
  final reason = TextEditingController(), details = TextEditingController();
  bool busy = false, confirmed = false;
  Json? result;
  Object? error;
  @override
  void dispose() {
    reason.dispose();
    details.dispose();
    super.dispose();
  }

  bool get direct {
    final started = DateTime.tryParse('${widget.visit['startedAt']}');
    final elapsed = started == null ? null : DateTime.now().difference(started);
    return widget.branch['canCancel'] == true &&
        elapsed != null &&
        !elapsed.isNegative &&
        elapsed <= const Duration(minutes: 10);
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'مراجعة الزيارة',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        OperationContext(title:'${widget.branch['name']}',detail:'زيارة بقيمة ${widget.visit['pointsCharged']} نقطة'),
        if (result != null) ...[
          EmptyState(
            result!['visit'] != null
                ? 'تم إلغاء الزيارة ورد النقاط'
                : 'تم إرسال الطلب للإدارة',
            icon: Icons.check_circle_rounded,
          ),
          Reference('${result!['id']}'),
          ActionButton('تم', onPressed: () => Navigator.pop(context)),
        ] else ...[
          Text(
            direct
                ? 'إلغاء خلال أول ١٠ دقائق مع رد نقاط الزيارة.'
                : 'الإلغاء محتاج مراجعة الإدارة قبل رد النقاط.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: reason,
            enabled: !busy && widget.api.pending == null,
            decoration: const InputDecoration(
              labelText: 'سبب الإلغاء (٥ حروف على الأقل)',
            ),
          ),
          const SizedBox(height: 12),
          if (!direct) TextField(
            controller: details,
            enabled: !busy && widget.api.pending == null,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'تفاصيل المراجعة (١٠ حروف على الأقل لو الطلب للإدارة)',
            ),
          ),
          CheckboxListTile(
            value: confirmed,
            title: const Text('راجعت الزيارة وسبب الإلغاء'),
            onChanged: busy || widget.api.pending != null
                ? null
                : (v) => setState(() => confirmed = v == true),
          ),
          ErrorNote(error),
          ActionButton(
            direct ? 'تأكيد إلغاء الزيارة' : 'إرسال طلب مراجعة',
            busy: busy,
            onPressed: !confirmed || widget.api.pending != null
                ? null
                : () async {
                    if (busy) return;
                    setState(() {
                      busy = true;
                      error = null;
                    });
                    try {
                      final immediate = direct;
                      final r = await widget.api.transact(
                        immediate
                            ? 'operations/branches/${widget.branch['id']}/visits/${widget.visit['id']}/cancel'
                            : 'operation-reviews',
                        {
                          'reason': reason.text,
                          if (!immediate) ...{
                            'kind': 'VISIT_CANCEL',
                            'targetId': widget.visit['id'],
                            'evidenceText': details.text,
                          },
                        },
                      );
                      if (mounted) setState(() => result = r);
                    } catch (e) {
                      if (mounted) setState(() => error = e);
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
          ),
        ],
      ],
    ),
  );
}
