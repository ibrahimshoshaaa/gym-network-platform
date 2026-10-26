import '../l10n/language.dart';
import 'branch_entry.dart';
import 'work_balance_hero.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'account.dart';
import 'managed_branch.dart';
import 'branch_finance.dart';

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
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Padding(
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
  ]))); }
}

class StaffWorkplace extends StatelessWidget {
  final ApiClient api;
  final int section;
  final String? branchId;
  final ValueChanged<String> onBranchChanged;
  final VoidCallback showVisits, showSales;
  final Widget? homeTools;
  const StaffWorkplace({super.key, required this.api, required this.section,
    required this.branchId, required this.onBranchChanged, required this.showVisits, required this.showSales,this.homeTools});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  DataView(
    load: () => api.request('operations/branches'),
    builder: (data, reload) {
      final branches = rows(data);
      if (branches.isEmpty) return ListView(padding: const EdgeInsets.all(20), children: [
        if(section==0 && homeTools!=null) homeTools!,
        EmptyState(appText('s364'), detail: appText('s365')),
      ]);
      final branch = branches.where((b) => b['id'] == branchId).firstOrNull ?? branches.first;
      return Column(children: [
        if(section!=0) Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12), child: Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(branch['canCancel'] == true ? appText('s366') : appText('s367'), style: const TextStyle(color: green, fontSize: 12, fontWeight: FontWeight.w700)),
            if (branches.length > 1) DropdownButton<String>(value: branch['id'], isExpanded: true,
              underline: const SizedBox.shrink(), items: branches.map((b) => DropdownMenuItem<String>(value: b['id'],
                child: Text('${b['name']}', maxLines: 1, overflow: TextOverflow.ellipsis))).toList(),
              onChanged: api.pending != null ? null : (id) => onBranchChanged(id!))
            else Text('${branch['name']}', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            Text('${branch['gymName']}', style: const TextStyle(color: muted, fontSize: 11)),
          ])),
          if (section != 0) IconButton(tooltip: appText('s368'), icon: const Icon(Icons.notifications_none_rounded),
            onPressed: () => open(context, NotificationsScreen(api: api))),
        ])),
        Expanded(child: KeyedSubtree(key: ValueKey('${branch['id']}:$section'), child: switch(section) {
          1 => BranchRecords(api: api, branch: branch, kind: 'visits', embedded: true),
          2 => RecordVisit(api: api, branch: branch),
          _ => BranchDashboard(api: api, branch: branch, showVisits: showVisits, showSales: showSales,controls:Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
           if(branches.length>1) DropdownButton<String>(value:branch['id'],isExpanded:true,items:branches.map((b)=>DropdownMenuItem<String>(value:b['id'],child:Text('${b['name']}',maxLines:1,overflow:TextOverflow.ellipsis))).toList(),onChanged:api.pending!=null?null:(id)=>onBranchChanged(id!))
           else Padding(padding:const EdgeInsets.only(top:10),child:Text('${branch['name']}',style:const TextStyle(color:green,fontSize:12))),
           if(homeTools!=null)homeTools!,
          ])),
        })),
      ]);
    },
  ); }
}

class BranchDashboard extends StatefulWidget {
  final ApiClient api;
  final Json branch;
  final VoidCallback? showVisits, showSales;
  final Widget? controls;
  const BranchDashboard({super.key, required this.api, required this.branch, this.showVisits, this.showSales,this.controls});
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
    Future<void> part(String path, bool summaryPart) async {
      try {
        final data = Map<String, dynamic>.from(await widget.api.request(path));
        if (mounted && current == generation) setState(() { if (summaryPart) { summary = data; } else { report = data; } });
      } catch(e) {
        if (mounted && current == generation) setState(() { if (summaryPart) { summary = null; summaryError = e; } else { report = null; reportError = e; } });
      } finally {
        if (mounted && current == generation) setState(() { if (summaryPart) { summaryLoading = false; } else { reportLoading = false; } });
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
    AppLanguage.watch(context);
    final branch = widget.branch, locked = widget.api.pending != null;
    return ColoredBox(color:canvas,child:RefreshIndicator(onRefresh: load, child: ListView(
      padding: const EdgeInsets.only(bottom:28), physics: const AlwaysScrollableScrollPhysics(), children: [
        WorkBalanceHero(api:widget.api,scope:'${branch['canCancel']==true?appText('s366'):appText('s367')} · ${branch['gymName']??''} · ${branch['name']}',label:appText('s369'),points:summary==null?null:'${summary!['visitPricePoints']??'—'}',loading:summaryLoading,
         primary:BalanceHeroAction(appText('s109'),Icons.qr_code_scanner_rounded,locked||branch['canOperate']!=true?null:()=>action(RecordVisit(api:widget.api,branch:branch))),
         secondary:BalanceHeroAction(appText('s110'),Icons.history_rounded,()=>records('visits')),
         footer:BalanceHeroAction(appText('s370'),Icons.qr_code_2_rounded,locked||branch['canOperate']!=true?null:()=>action(BranchEntryQrScreen(api:widget.api,branch:branch)))),
        if(widget.controls!=null)widget.controls!,
        if(summary!=null)Padding(padding:const EdgeInsets.only(top:8),child:Text(appText('s371', [summary!['visitPricePoints']??'—', summary!['sessionMinutes']??'—']),style:const TextStyle(color:muted,fontSize:11))),
        const SizedBox(height:12),
        BranchFinance(key: ValueKey(generation), api: widget.api, branch: branch),
        if (summaryError != null) ErrorNote(summaryError, retry: load),
        SectionTitle(appText('s372')),
        Panel(padding: const EdgeInsets.all(16), child: Column(children: [
          if (reportLoading && report == null) const LinearProgressIndicator(minHeight: 2),
          if (report != null) ...[
            Fact(appText('s373'), '${report!['visits']?['count'] ?? '—'}'),
          ],
          if (reportError != null) ErrorNote(reportError, retry: load),
        ])),
        if((branch['permissions'] as List? ?? []).isNotEmpty)...[
          SectionTitle(appText('s374')),
          Panel(child:Column(children:[
            for(final item in [
              ('MANAGE_CASHIERS','staff',appText('s375')),('EDIT_BRANCH','edit',appText('s376')),
              ('REQUEST_PRICING','price',appText('s377')),('REQUEST_WITHDRAWAL','withdraw',appText('s378')),
            ])if((branch['permissions'] as List).contains(item.$1))ListTile(contentPadding:EdgeInsets.zero,title:Text(item.$3),trailing:const Icon(Icons.chevron_left_rounded),onTap:locked?null:()=>action(ManagedBranch(api:widget.api,branch:branch,task:item.$2))),
          ])),
        ],
        SectionTitle(appText('s379')),
        Panel(padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4), child: Column(children: [
          ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.directions_run_rounded, color: green),
            title: Text(appText('s110')), trailing: const Icon(Icons.chevron_left_rounded), onTap: () => records('visits')),
          if (branch['canCancel'] == true) ...[
            const Divider(height: 1),
            Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Text(appText('s380'), style: TextStyle(color: muted, fontSize: 12))),
          ],
        ])),
        TextButton.icon(onPressed: () => open(context, OperationReviewsScreen(api: widget.api)),
          icon: const Icon(Icons.fact_check_outlined), label: Text(appText('s381'))),
      ].asMap().entries.map((e)=>e.key==0?e.value:Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:e.value)).toList(),
    )));
  }
}

class OperationReviewsScreen extends StatelessWidget {
  final ApiClient api;
  const OperationReviewsScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(title: appText('s381'), child: PagedRecords(
    api: api, path: 'operation-reviews', item: (r) => Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      StatusPill('${r['status']}'), Fact(appText('s216'), '${r['reason']}'),
      if (r['reviewReason'] != null) Fact(appText('s382'), '${r['reviewReason']}'), Reference('${r['id']}'),
    ])),
  )); }
}

class OperationsHome extends StatelessWidget {
  final ApiClient api;
  final String? gymId;
  const OperationsHome({super.key, required this.api, this.gymId});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  DataView(
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
            manager ? appText('s383') : appText('s384'),
            eyebrow: manager
                ? appText('s366')
                : api.user?['role'] == 'GYM_OWNER'
                ? appText('s385')
                : appText('s386'),
            detail: appText('s387'),
          ),
          if (branches.isNotEmpty)
            Text(
              appText('s388', [branches.length]),
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          const SizedBox(height: 14),
          if (branches.isEmpty)
            EmptyState(
              appText('s364'),
              detail: appText('s389'),
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
                      Text(
                        appText('s390'),
                        style: TextStyle(color: green, fontSize: 12),
                      ),
                    if (branch['canOperate'] == true) ...[
                      const SizedBox(height: 14),
                      PortalGrid(
                        children: [
                          PortalTask(appText('s370'),icon:Icons.qr_code_2_rounded,detail:appText('s391'),onTap:()=>open(context,BranchEntryQrScreen(api:api,branch:branch))),
                          PortalTask(
                            appText('s109'),
                            icon: Icons.qr_code_scanner_rounded,
                            primary: true,
                            detail: appText('s392'),
                            onTap: () async {
                              await open(
                                context,
                                RecordVisit(api: api, branch: branch),
                              );
                              await reload();
                            },
                          ),

                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    ActionButton(
                      appText('s393'),
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
            label: Text(appText('s368')),
          ),
          TextButton.icon(
            onPressed: () => open(
              context,
              Screen(
                title: appText('s381'),
                child: PagedRecords(
                  api: api,
                  path: 'operation-reviews',
                  item: (r) => Panel(
                    child: Column(
                      children: [
                        StatusPill('${r['status']}'),
                        Fact(appText('s216'), '${r['reason']}'),
                        if (r['reviewReason'] != null)
                          Fact(appText('s382'), '${r['reviewReason']}'),
                        Reference('${r['id']}'),
                      ],
                    ),
                  ),
                ),
              ),
            ),
            icon: const Icon(Icons.fact_check_outlined),
            label: Text(appText('s394')),
          ),
        ],
      );
    },
  ); }
}

class BranchWorkspace extends StatelessWidget {
  final ApiClient api;
  final Json branch;
  const BranchWorkspace({super.key, required this.api, required this.branch});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(title: '${branch['name']}',
    child: BranchDashboard(api: api, branch: branch)); }
}

class BranchSale extends StatelessWidget {
 final ApiClient api;final Json branch;
 const BranchSale({super.key,required this.api,required this.branch});
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Screen(title:appText('s112'),child:Center(child:Text(appText('s395')))); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s109'),
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        OperationContext(title:'${widget.branch['name']}',detail:appText('s396'),icon:Icons.qr_code_scanner_rounded),
        if (result != null) ...[
          EmptyState(
            result!['alreadyActive'] == true
                ? appText('s397')
                : appText('s398'),
            detail: result!['alreadyActive'] == true
                ? appText('s399')
                : appText('s400'),
            icon: Icons.check_circle_rounded,
          ),
          Fact(appText('s401'), '${result!['visit']['pointsCharged']}'),
          Fact(appText('s402'), shortDate(result!['visit']['expiresAt'])),
          Reference('${result!['visit']['id']}'),
          ActionButton(appText('s20'), onPressed: () => Navigator.pop(context)),
        ] else ...[
          FlowSteps(
            labels: [appText('s403'), appText('s404')],
            current: preview == null ? 0 : 1,
          ),
          Text(
            appText('s405'),
          ),
          const SizedBox(height: 20),
          if (preview == null) ...[
            ActionButton(
              appText('s406'),
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
              decoration: InputDecoration(
                labelText: appText('s407'),
              ),
            ),
          ] else ...[
            Panel(
              child: Column(
                children: [
                  Fact(appText('s408'), '${preview!['traineeLabel']}'),
                  Fact(appText('s409'), '${preview!['phoneLast4']}'),
                  Fact(
                    appText('s410'),
                    appText('s120', [preview!['points']]),
                    strong: true,
                  ),
                  if (preview!['balance'] != null)
                    Fact(appText('s411'), appText('s120', [preview!['balance']])),
                  Fact(appText('s412'), appText('s184', [preview!['sessionMinutes']])),
                  if (preview!['alreadyActive'] == true)
                    Text(
                      appText('s413'),
                    ),
                ],
              ),
            ),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: confirmed,
              title: Text(appText('s414')),
              onChanged: busy || widget.api.pending != null
                  ? null
                  : (v) => setState(() => confirmed = v == true),
            ),
          ],
          ErrorNote(error),
          if (widget.api.pending != null)
            Text(
              appText('s415'),
            ),
          const SizedBox(height: 20),
          ActionButton(
            preview == null ? appText('s416') : appText('s404'),
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
              child: Text(appText('s417')),
            ),
        ],
      ],
    ),
  ); }
}

class ScanTicket extends StatefulWidget {
  const ScanTicket({super.key});
  @override
  State<ScanTicket> createState() => _ScanTicketState();
}

class _ScanTicketState extends State<ScanTicket> {
  bool done = false;
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s418'),
    child: Column(
      children: [
        Padding(
          padding: EdgeInsets.all(20),
          child: Text(
            appText('s419'),
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
  ); }
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
    AppLanguage.watch(context);
    final content = PagedRecords(
      key: ValueKey(version), api: api, path: 'operations/branches/${branch['id']}/$kind',
      item: (r) => _record(context, r),
    );
    return widget.embedded ? content : Screen(
    title: appText('s420'),
    child: content,
  );
  }
  Widget _record(BuildContext context, Json r) => Panel(

        child: Column(
          children: [
            Fact(
              appText('s119'),
              '${r['pointsCharged']}',
              strong: true,
            ),
            if (kind == 'visits') StatusPill('${r['status']}'),
            Fact(
              appText('s421'),
              shortDate(r['startedAt']),
            ),
            if (kind == 'visits')
              Fact(appText('s402'), shortDate(r['expiresAt'])),
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
                child: Text(branch['canCancel'] == true ? appText('s422') : appText('s423')),
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s416'),
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        OperationContext(title:'${widget.branch['name']}',detail:appText('s424', [widget.visit['pointsCharged']])),
        if (result != null) ...[
          EmptyState(
            result!['visit'] != null
                ? appText('s425')
                : appText('s426'),
            icon: Icons.check_circle_rounded,
          ),
          Reference('${result!['id']}'),
          ActionButton(appText('s20'), onPressed: () => Navigator.pop(context)),
        ] else ...[
          Text(
            direct
                ? appText('s427')
                : appText('s428'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: reason,
            enabled: !busy && widget.api.pending == null,
            decoration: InputDecoration(
              labelText: appText('s429'),
            ),
          ),
          const SizedBox(height: 12),
          if (!direct) TextField(
            controller: details,
            enabled: !busy && widget.api.pending == null,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: appText('s430'),
            ),
          ),
          CheckboxListTile(
            value: confirmed,
            title: Text(appText('s431')),
            onChanged: busy || widget.api.pending != null
                ? null
                : (v) => setState(() => confirmed = v == true),
          ),
          ErrorNote(error),
          ActionButton(
            direct ? appText('s432') : appText('s433'),
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
  ); }
}
