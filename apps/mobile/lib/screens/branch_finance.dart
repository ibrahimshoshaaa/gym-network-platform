import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';

class BranchFinance extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  const BranchFinance({super.key, required this.api, required this.branch});
  @override
  State<BranchFinance> createState() => _BranchFinanceState();
}
class _BranchFinanceState extends State<BranchFinance> {
  Json? finance, report, details;
  Object? financeError, reportError, detailsError;
  int days = 30, generation = 0, reportGeneration = 0;
  bool get allowed => widget.branch['fullAccess'] == true || (widget.branch['permissions'] as List? ?? []).contains('REQUEST_WITHDRAWAL');
  @override
  void initState() { super.initState(); if (allowed) load(); }
  @override
  void didUpdateWidget(covariant BranchFinance oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.branch['id'] != widget.branch['id'] || oldWidget.branch['fullAccess'] != widget.branch['fullAccess']) {
      generation++; reportGeneration++;
      finance = report = details = null;
      if (allowed) load();
    }
  }
  Future<void> load() async {
    final current = ++generation;
    setState(() { finance = details = null; financeError = detailsError = null; });
    Future<void> part(String path, bool money) async {
      try {
        final data = Map<String,dynamic>.from(await widget.api.request(path));
        if (mounted && current == generation) setState(() { if (money) {finance = data;} else {details = data;} });
      } catch (e) {
        if (mounted && current == generation) setState(() { if (money) {financeError = e;} else {detailsError = e;} });
      }
    }
    await Future.wait([
      part('operations/branches/${widget.branch['id']}/entitlements', true),
      part('branches/${widget.branch['id']}/manage', false),
      loadReport(),
    ]);
  }
  Future<void> loadReport() async {
    final current = ++reportGeneration;
    setState(() {report = null; reportError = null;});
    final now = DateTime.now(), start = DateTime(now.year, now.month, now.day).subtract(Duration(days: days - 1));
    String date(DateTime d) => '${d.year}-${d.month.toString().padLeft(2,'0')}-${d.day.toString().padLeft(2,'0')}';
    try {
      final data = Map<String,dynamic>.from(await widget.api.request('reports/summary?gymId=${widget.branch['gymId']}&branchId=${widget.branch['id']}&from=${date(start)}&to=${date(now)}'));
      if (mounted && current == reportGeneration) setState(() => report = data);
    } catch (e) {
      if (mounted && current == reportGeneration) setState(() => reportError = e);
    }
  }
  @override
  Widget build(BuildContext context) {
    if (!allowed) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [const Expanded(child: SectionTitle('مستحقات الفرع')), TextButton(onPressed: load, child: const Text('تحديث'))]),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (finance == null && financeError == null) const LinearProgressIndicator(minHeight: 2),
        if (financeError != null) ErrorNote(financeError, retry: load),
        if (finance != null) ...[
          Fact('متاح للسحب من الفرع', '${money(finance!['available'])} ج.م', strong: true),
          Fact('إجمالي عائد الزيارات المؤكدة', '${money(finance!['earned'])} ج.م'),
          Fact('مسحوب أو مرتبط بطلبات سحب', '${money(finance!['committed'])} ج.م'),
          Fact('محجوز للمراجعة', '${money(finance!['disputed'])} ج.م'),
          if (finance!['legacyReviewRequired'] == true) const PortalNote('فيه سحوبات قديمة غير موزعة على الفروع؛ المتاح محسوب بتحفّظ لحين مراجعتها.'),
        ],
        const Text('مستحقات الفرع الحالية من كل الفترات. المتاح للسحب يخضع لرصيد الجيم، وهو منفصل عن مخزون النقاط.', style: TextStyle(color: muted, fontSize: 11)),
      ])),
      const SectionTitle('ملخص الزيارات'),
      DropdownButton<int>(value: days, isExpanded: true, items: const [DropdownMenuItem(value: 1, child: Text('اليوم')), DropdownMenuItem(value: 30, child: Text('آخر ٣٠ يوم'))], onChanged: (value) {if(value != null) {setState(() => days = value); loadReport();}}),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (report == null && reportError == null) const LinearProgressIndicator(minHeight: 2),
        if (reportError != null) ErrorNote(reportError, retry: loadReport),
        if (report != null) ...[
          Fact('زيارات مسجلة', '${report!['visits']?['count'] ?? '—'}'),
          Fact('زيارات ملغاة خلال الفترة', '${report!['cancellations']?['count'] ?? '—'}'),
          Fact('صافي نقاط الزيارات', '${report!['netVisitPoints']} نقطة'),
          Fact('صافي عائد الزيارات خلال الفترة', '${money(report!['netVisitReceivablesPiasters'])} ج.م'),
        ],
        const Text('الصافي = الزيارات المسجلة خلال الفترة ناقص الإلغاءات المنفذة خلالها.', style: TextStyle(color: muted, fontSize: 11)),
      ])),
      const SectionTitle('بيانات الفرع'),
      Panel(child: Column(children: [
        if (details == null && detailsError == null) const LinearProgressIndicator(minHeight: 2),
        if (detailsError != null) ErrorNote(detailsError, retry: load),
        if (details != null) ...[
          Fact('العنوان', '${details!['address']}'),
          Fact('المنطقة', '${details!['city']} · ${details!['governorate']}'),
          Fact('الهاتف', '${details!['contactPhone'] ?? 'غير محدد'}'),
          Fact('مواعيد العمل', '${details!['openingHours'] ?? 'غير محددة'}'),
        ],
      ])),
      const SizedBox(height: 16),
    ]);
  }
}
