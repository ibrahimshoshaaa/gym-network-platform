import '../l10n/language.dart';
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
    AppLanguage.watch(context);
    if (!allowed) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(children: [Expanded(child: SectionTitle(appText('s569'))), TextButton(onPressed: load, child: Text(appText('s450')))]),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (finance == null && financeError == null) const LinearProgressIndicator(minHeight: 2),
        if (financeError != null) ErrorNote(financeError, retry: load),
        if (finance != null) ...[
          Fact(appText('s570'), appText('s122', [money(finance!['available'])]), strong: true),
          Fact(appText('s571'), appText('s122', [money(finance!['earned'])])),
          Fact(appText('s572'), appText('s122', [money(finance!['committed'])])),
          Fact(appText('s573'), appText('s122', [money(finance!['disputed'])])),
          if (finance!['legacyReviewRequired'] == true) PortalNote(appText('s574')),
        ],
        Text(appText('s575'), style: TextStyle(color: muted, fontSize: 11)),
      ])),
      SectionTitle(appText('s576')),
      DropdownButton<int>(value: days, isExpanded: true, items: [DropdownMenuItem(value: 1, child: Text(appText('s577'))), DropdownMenuItem(value: 30, child: Text(appText('s578')))], onChanged: (value) {if(value != null) {setState(() => days = value); loadReport();}}),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (report == null && reportError == null) const LinearProgressIndicator(minHeight: 2),
        if (reportError != null) ErrorNote(reportError, retry: loadReport),
        if (report != null) ...[
          Fact(appText('s373'), '${report!['visits']?['count'] ?? '—'}'),
          Fact(appText('s579'), '${report!['cancellations']?['count'] ?? '—'}'),
          Fact(appText('s580'), appText('s120', [report!['netVisitPoints']])),
          Fact(appText('s581'), appText('s122', [money(report!['netVisitReceivablesPiasters'])])),
        ],
        Text(appText('s582'), style: TextStyle(color: muted, fontSize: 11)),
      ])),
      SectionTitle(appText('s376')),
      Panel(child: Column(children: [
        if (details == null && detailsError == null) const LinearProgressIndicator(minHeight: 2),
        if (detailsError != null) ErrorNote(detailsError, retry: load),
        if (details != null) ...[
          Fact(appText('s327'), '${details!['address']}'),
          Fact(appText('s583'), '${details!['city']} · ${details!['governorate']}'),
          Fact(appText('s584'), '${details!['contactPhone'] ?? appText('s918')}'),
          Fact(appText('s585'), '${details!['openingHours'] ?? appText('s1005')}'),
        ],
      ])),
      const SizedBox(height: 16),
    ]);
  }
}
