import '../l10n/language.dart';
import 'campaigns.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';

class TopupScreen extends StatefulWidget {
  final ApiClient api;
  const TopupScreen({super.key, required this.api, });
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
    if(widget.api.user?['role']=='TRAINEE')load();
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  String get kind => 'TRAINEE';
  int? get customPoints {
    final text = digits(amount.text.trim());
    return RegExp(r'^\d+$').hasMatch(text) ? int.tryParse(text) : null;
  }
  Json get selection => {
    'kind': kind,
    if (selectedPackage != null) ...{
      'packageId': selectedPackage!['id'], 'packageVersion': selectedPackage!['version'],
    } else if (byAmount) 'amountPiasters': piasters(amount.text)
    else 'points': customPoints,
  };
  Json? estimateFor(int? points) {
    final policy = options?['policy'];
    final unit = BigInt.tryParse('${policy?['pointPricePiasters']}');
    final discount = 0;
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
    AppLanguage.watch(context);
    if(widget.api.user?['role']!='TRAINEE')return Screen(title:appText('s112'),child:Center(child:Text(appText('s113'))));
    final methods = (options?['paymentMethods'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final packages = (options?['packages'] as List? ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
    final locked = busy || widget.api.pending != null;
    final estimate = estimateFor(selectedPackage != null ? selectedPackage!['points'] as int : byAmount ? null : customPoints);
    final step = quote == null ? 0 : reviewing ? 2 : 1;
    final destination = appText('s114');
    final chosenMethod = methods.where((m) => m['type'] == method).firstOrNull;
    return Screen(title: appText('s115'), child: ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28), children: [
        CampaignBanner(api:widget.api,placement:'WALLET'),
        if (result != null) ...[
          EmptyState(appText('s116'), detail: appText('s117'), icon: Icons.task_alt_rounded),
          Panel(child: Column(children: [
            Fact(appText('s118'), destination),
            Fact(appText('s119'), appText('s120', [result!['points']]), strong: true),
            Fact(appText('s121'), appText('s122', [money(result!['chargePiasters'])])),
            StatusPill(result!['status']), Reference('${result!['id']}'),
          ])),
          const SizedBox(height: 16),
          ActionButton(appText('s123'), onPressed: () => Navigator.pop(context, true)),
        ] else if (options == null) ...[
          if (busy) const Center(child: CircularProgressIndicator()), ErrorNote(error, retry: load),
        ] else if (methods.isEmpty)
          EmptyState(appText('s124'), detail: appText('s125'))
        else if (options!['policy'] == null)
          EmptyState(appText('s126'), detail: appText('s127'))
        else ...[
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (var i = 0; i < 3; i++) Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(color: step == i ? ink : Colors.white, borderRadius: BorderRadius.circular(12)),
              child: Text('${i + 1} · ${[appText('s999'), appText('s1000'), appText('s1001')][i]}',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: step == i ? Colors.white : muted))),
          ]),
          const SizedBox(height: 20),
          Text(quote == null ? appText('s128') : reviewing ? appText('s129') : appText('s130'),
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          Text(appText('s131', [destination]), style: const TextStyle(color: muted, fontSize: 12)),
          const SizedBox(height: 20),
          if (quote == null) ...[
            if (!byAmount && packages.isNotEmpty) ...[
              Text(appText('s132'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
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
                      Text(appText('s120', [p['points']]), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      Text(appText('s122', [money(estimateFor(p['points'])?['chargePiasters'])]), style: const TextStyle(color: green, fontWeight: FontWeight.w700)),
                      if (!digits('${p['label']}').contains('${p['points']}')) Text('${p['label']}', style: const TextStyle(color: muted, fontSize: 11)),
                    ]))))),
                ]);
              }),
              const SizedBox(height: 20),
              Text(appText('s133'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 10),
            ],
            SegmentedButton<bool>(segments: [
              ButtonSegment(value: false, label: Text(appText('s134'))), ButtonSegment(value: true, label: Text(appText('s135'))),
            ], selected: {byAmount}, onSelectionChanged: locked ? null : (v) => setState(() {
              byAmount = v.first; selectedPackage = null; amount.clear(); error = null;
            })),
            const SizedBox(height: 14),
            TextField(controller: amount, enabled: !locked,
              onChanged: (_) => setState(() { selectedPackage = null; error = null; }),
              keyboardType: TextInputType.numberWithOptions(decimal: byAmount), textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: byAmount ? appText('s136') : appText('s137'), hintText: '100')),
            if (estimate != null) ...[
              const SizedBox(height: 14),
              Panel(padding: const EdgeInsets.all(14), child: Column(children: [
                Fact(appText('s138'), appText('s120', [estimate['points']])),
                Fact(appText('s139'), appText('s122', [money(estimate['chargePiasters'])]), strong: true),
              ])),
            ],
            ErrorNote(error), const SizedBox(height: 16),
            ActionButton(appText('s140'), onPressed: locked || estimate == null ? null : review, busy: busy),
          ] else ...[
            Panel(color: ink, padding: const EdgeInsets.all(18), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(reviewing ? appText('s141', [destination]) : appText('s142'), style: const TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 8),
              FittedBox(fit: BoxFit.scaleDown, child: Text(appText('s122', [money(quote!['chargePiasters'])]), style: const TextStyle(color: lime, fontSize: 32, fontWeight: FontWeight.w900))),
              Text(appText('s120', [quote!['points']]), style: const TextStyle(color: Colors.white, fontSize: 16)),
            ])),
            if (quote!['unallocatedPiasters'] != null && quote!['unallocatedPiasters'] != '0') Padding(padding: const EdgeInsets.only(top: 12),
              child: Text(appText('s143', [money(quote!['unallocatedPiasters'])]), style: const TextStyle(fontSize: 12))),
            if (!reviewing) ...[
              SectionTitle(appText('s144')),
              DropdownButtonFormField<String>(initialValue: method, isExpanded: true,
                items: methods.map((m) => DropdownMenuItem(value: '${m['type']}', child: Text(m['type'] == 'INSTAPAY' ? appText('s145') : appText('s146')))).toList(),
                onChanged: locked ? null : (v) => setState(() { method = v; receipt = null; confirmed = false; }),
                decoration: InputDecoration(labelText: appText('s147'))),
              const SizedBox(height: 12),
              if (chosenMethod != null) Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${chosenMethod['accountName']}', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                SelectableText('${chosenMethod['account']}', textDirection: TextDirection.ltr, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
                TextButton.icon(onPressed: () => Clipboard.setData(ClipboardData(text: '${chosenMethod['account']}')),
                  icon: const Icon(Icons.copy_rounded, size: 17), label: Text(appText('s148'))),
              ])),
              SectionTitle(appText('s149')),
              OutlinedButton.icon(onPressed: locked ? null : upload,
                icon: Icon(receipt == null ? Icons.add_photo_alternate_outlined : Icons.check_circle_rounded),
                label: Text(receipt == null ? appText('s150') : appText('s151'))),
              ErrorNote(error), const SizedBox(height: 16),
              ActionButton(appText('s152'), onPressed: locked || receipt == null ? null : () => setState(() { reviewing = true; confirmed = false; error = null; })),
              TextButton(onPressed: locked ? null : () => setState(() { quote = null; receipt = null; reviewedSelection = null; confirmed = false; error = null; }), child: Text(appText('s153'))),
            ] else ...[
              const SizedBox(height: 16),
              Panel(child: Column(children: [
                Fact(appText('s147'), method == 'INSTAPAY' ? appText('s145') : appText('s146')),
                Fact(appText('s154'), '${chosenMethod?['accountName']}'),
                Fact(appText('s155'), '${chosenMethod?['account']}'),
                Fact(appText('s156'), appText('s157')),
              ])),
              CheckboxListTile(contentPadding: EdgeInsets.zero, value: confirmed,
                onChanged: locked ? null : (v) => setState(() => confirmed = v ?? false),
                title: Text(appText('s158'))),
              ErrorNote(error),
              ActionButton(appText('s159'), busy: busy, onPressed: locked || !confirmed ? null : submit),
              TextButton(onPressed: locked ? null : () => setState(() { reviewing = false; confirmed = false; error = null; }), child: Text(appText('s160'))),
            ],
          ],
          if (widget.api.pending != null) PortalNote(appText('s161')),
        ],
      ],
    ));
  }
}

class TopupHistory extends StatelessWidget {
  final ApiClient api;
  const TopupHistory({super.key, required this.api});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s162'),
    child: PagedRecords(
      api: api,
      path: 'topups',
      empty: appText('s163'),
      item: (r) => Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    appText('s120', [r['points']]),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                StatusPill(r['status']),
              ],
            ),
            Fact(appText('s121'), appText('s122', [money(r['chargePiasters'])])),
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
  ); }
}

