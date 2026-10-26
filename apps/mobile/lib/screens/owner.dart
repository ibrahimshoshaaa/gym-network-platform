import '../l10n/language.dart';
import 'branch_entry.dart';
import 'branch_services.dart';
import 'work_balance_hero.dart';
import 'branch_cover.dart';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'delegation.dart';
import 'directory.dart';
import 'operations.dart';

String reportRange() {
  final now = DateTime.now(), from = now.subtract(const Duration(days: 29));
  String date(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  return 'from=${date(from)}&to=${date(now)}';
}

class OwnerHome extends StatefulWidget {
 final ApiClient api;
 final Json gym;
 final VoidCallback showBranches,showMoney,showOperations;
 final Widget? homeTools;
 const OwnerHome({super.key,required this.api,required this.gym,
   required this.showBranches,required this.showMoney,required this.showOperations,this.homeTools});
 @override State<OwnerHome> createState()=>_OwnerHomeState();
}
class _OwnerHomeState extends State<OwnerHome> {
 Json? report;Object? error;bool loading=true;int generation=0;
 @override void initState(){super.initState();load();}
 Future<void> load()async{final current=++generation;setState((){loading=true;error=null;});try{final r=Map<String,dynamic>.from(await widget.api.request('reports/summary?gymId=${widget.gym['id']}&${reportRange()}'));if(mounted&&current==generation)setState(()=>report=r);}catch(e){if(mounted&&current==generation)setState(()=>error=e);}finally{if(mounted&&current==generation)setState(()=>loading=false);}}
 String? balance(String type){if(report==null)return null;return '${(report!['currentBalances'] as List? ?? []).cast<Map>().where((b)=>b['type']==type).firstOrNull?['balancePiasters']??'0'}';}
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return ColoredBox(color:canvas,child:RefreshIndicator(onRefresh:load,child:ListView(padding:const EdgeInsets.only(bottom:28),physics:const AlwaysScrollableScrollPhysics(),children:[
 WorkBalanceHero(api:widget.api,scope:appText('s735', [widget.gym['name']]),label:appText('s736'),points:report==null?null:money(balance('GYM_AVAILABLE')),unit:appText('s106'),loading:loading,
 primary:BalanceHeroAction(appText('s737'),Icons.payments_outlined,widget.showMoney),secondary:BalanceHeroAction(appText('s109'),Icons.qr_code_scanner_rounded,widget.gym['status']=='ACTIVE'?widget.showOperations:null),footer:BalanceHeroAction(appText('s738'),Icons.storefront_outlined,widget.showBranches)),
 if(widget.homeTools!=null)widget.homeTools!,
 if(error!=null)ErrorNote(error,retry:load),
 Padding(padding:EdgeInsets.all(20),child:PortalNote(appText('s739'))),
 Padding(padding:const EdgeInsets.symmetric(horizontal:20),child:Panel(child:Column(children:[
 _ownerTask(appText('s740'),appText('s741'),Icons.storefront_outlined,widget.showBranches),
 _ownerTask(appText('s742'),appText('s743'),Icons.insights_rounded,()=>open(context,OwnerReport(api:widget.api,gymId:widget.gym['id']))),
 Fact(appText('s744'),report==null?'—':appText('s122', [money(balance('GYM_RESERVED'))])),Fact(appText('s573'),report==null?'—':appText('s122', [money(balance('GYM_DISPUTED'))])),
 ]))),
 ]))); }
}

Widget _ownerTask(String title,String detail,IconData icon,VoidCallback? tap)=>ListTile(
 contentPadding:EdgeInsets.zero,enabled:tap!=null,
 leading:Icon(icon,color:tap==null?muted:green,size:23),
 title:Text(title,style:const TextStyle(fontSize:14,fontWeight:FontWeight.w700)),
 subtitle:Text(detail,style:const TextStyle(fontSize:11,color:muted)),
 trailing:const Icon(Icons.chevron_left_rounded,size:20,color:muted),onTap:tap,
);


class BranchesScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  const BranchesScreen({super.key, required this.api, required this.gym});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  DataView(
    load: () => api.request('gyms/${gym['id']}/branches?limit=100'),
    builder: (d, reload) { return  ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                appText('s745', [gym['name']]),
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            IconButton.filled(
              tooltip: appText('s746'),
              onPressed: () async {
                await open(context, BranchForm(api: api, gymId: gym['id']));
                await reload();
              },
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          appText('s747'),
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 22),
        if (rows(d).isEmpty)
          EmptyState(
            appText('s748'),
            detail: appText('s749'),
          ),
        ...rows(d).map(
          (b) => Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Panel(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextButton(
                          onPressed: b['status'] != 'ACTIVE' || gym['status'] != 'ACTIVE' ? null : () async {
                            await open(context, BranchWorkspace(api: api, branch: {...b, 'gymName': gym['name'], 'canOperate': true, 'canCancel': true, 'fullAccess': true}));
                            await reload();
                          },
                          child: Text('${b['name']}', style: Theme.of(context).textTheme.titleLarge),
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
                    appText('s750'),
                    appText('s193', [b['visitPricePoints'], b['sessionMinutes']]),
                  ),
                  if (b['priceApprovedAt'] == null)
                    Text(
                      appText('s751'),
                      style: TextStyle(color: green, fontSize: 12),
                    ),
                  Wrap(
                    spacing: 8,
                    children: [
                      TextButton.icon(onPressed:()async{await open(context,BranchCoverScreen(api:api,gymId:'${gym['id']}',branchId:'${b['id']}',branchName:'${b['name']}'));},icon:const Icon(Icons.photo_outlined,size:18),label:Text(appText('s439'))),
                      TextButton.icon(
                        onPressed:
                            b['status'] != 'ACTIVE' || gym['status'] != 'ACTIVE'
                            ? null
                            : () async {
                                await open(
                                  context,
                                  BranchWorkspace(
                                    api: api,
                                    branch: {
                                      ...b,
                                      'gymName': gym['name'],
                                      'canOperate': true,
                                      'canCancel': true,
                                      'fullAccess': true,
                                    },
                                  ),
                                );
                                await reload();
                              },
                        icon: const Icon(
                          Icons.qr_code_scanner_rounded,
                          size: 18,
                        ),
                        label: Text(appText('s108')),
                      ),
                      SizedBox(width:double.infinity,child:ExpansionTile(
                        tilePadding:EdgeInsets.zero,
                        title:Text(appText('s488'),style:TextStyle(fontSize:13,fontWeight:FontWeight.w700)),
                        children:[Wrap(spacing:8,runSpacing:4,children:[
                      TextButton(
                        onPressed: () async {
                          await open(
                            context,
                            BranchForm(api: api, gymId: gym['id'], branch: b),
                          );
                          await reload();
                        },
                        child: Text(appText('s752')),
                      ),
                      TextButton(onPressed:()=>open(context,BranchServicesScreen(api:api,gymId:'${gym['id']}',branchId:'${b['id']}',branchName:'${b['name']}')),child:Text(appText('s753'))),
                      if(b['status']=='ACTIVE')TextButton(onPressed:()=>open(context,BranchEntryQrScreen(api:api,branch:Map<String,dynamic>.from(b))),child:Text(appText('s370'))),
                      TextButton(
                        onPressed: () => open(
                          context,
                          StaffScreen(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: Text(appText('s754')),
                      ),
                      TextButton(
                        onPressed: () => open(
                          context,
                          OwnerReport(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: Text(appText('s755')),
                      ),

                        ])],
                      )),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    ); },
  ); }
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
      setState(() => error = Exception(appText('s756')));
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: widget.branch == null ? appText('s757') : appText('s758'),
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
                    'name': appText('s489'),
                    'address': appText('s300'),
                    'governorate': appText('s298'),
                    'city': appText('s326'),
                    'contactPhone': appText('s759'),
                    'openingHours': appText('s760'),
                    'visitPricePoints': appText('s490'),
                    'sessionMinutes': appText('s761'),
                  }[e.key],
                ),
                validator: (v) =>
                    !['contactPhone', 'openingHours'].contains(e.key) &&
                        (v ?? '').trim().isEmpty
                    ? appText('s762')
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
                  ? appText('s763')
                  : appText('s764'),
            ),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            widget.branch == null ? appText('s765') : appText('s766'),
            busy: busy,
            onPressed: save,
          ),
        ],
      ),
    ),
  ); }
}

class StaffScreen extends StatefulWidget {
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
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  int version = 0;
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s767', [widget.branch['name']]),
    child: PagedRecords(
      key: ValueKey(version),
      api: widget.api,
      path: 'gyms/${widget.gymId}/staff?branchId=${widget.branch['id']}',
      empty: appText('s768'),
      emptyDetail:
          appText('s769'),
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          PortalIntro(
            appText('s770'),
            detail: appText('s771'),
          ),
          ActionButton(
            appText('s772'),
            icon: Icons.person_add_alt_rounded,
            onPressed: () async {
              await open(
                context,
                InviteStaff(
                  api: widget.api,
                  gymId: widget.gymId,
                  branchId: widget.branch['id'],
                ),
              );
              if (mounted) setState(() => version++);
            },
          ),
          const SizedBox(height: 20),
        ],
      ),
      item: (s) => StaffAccessCard(
        key: ValueKey(s['id']),
        api: widget.api,
        gymId: widget.gymId,
        assignment: s,
      ),
    ),
  ); }
}

class StaffAccessCard extends StatefulWidget {
  final ApiClient api;
  final String gymId;
  final Json assignment;
  const StaffAccessCard({
    super.key,
    required this.api,
    required this.gymId,
    required this.assignment,
  });
  @override
  State<StaffAccessCard> createState() => _StaffAccessCardState();
}

class _StaffAccessCardState extends State<StaffAccessCard> {
  late bool active;
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    active = widget.assignment['active'] == true;
  }

  @override
  void didUpdateWidget(covariant StaffAccessCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!busy) active = widget.assignment['active'] == true;
  }

  Future<void> toggle() async {
    if (busy) return;
    final desired = !active;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) { AppLanguage.watch(c); return  AlertDialog(
        title: Text(desired ? appText('s773') : appText('s774')),
        content: Text(
          appText('s775', [widget.assignment['user']?['displayName']]),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text(appText('s217')),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text(desired ? appText('s776') : appText('s777')),
          ),
        ],
      ); },
    );
    if (!mounted || confirmed != true) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.api.request(
        'gyms/${widget.gymId}/staff/${widget.assignment['id']}',
        method: 'PATCH',
        body: {'active': desired},
      );
      if (mounted) setState(() => active = desired);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final manager = widget.assignment['role'] == 'BRANCH_MANAGER';
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const CircleAvatar(
                backgroundColor: canvas,
                child: Icon(Icons.person_outline_rounded, color: green),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${widget.assignment['user']?['displayName']}',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    Text(
                      manager ? appText('s778') : appText('s779'),
                      style: const TextStyle(color: muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              StatusPill(active ? 'ACTIVE' : 'SUSPENDED'),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            manager
                ? appText('s780')
                : appText('s781'),
            style: const TextStyle(color: muted, fontSize: 12),
          ),
          if(manager&&widget.assignment['canDelegate']==true)TextButton.icon(icon:const Icon(Icons.admin_panel_settings_outlined),label:Text(appText('s782')),onPressed:()=>open(context,StaffDelegation(api:widget.api,gymId:widget.gymId,userId:'${widget.assignment['user']['id']}',branchId:'${widget.assignment['branchId']}',name:'${widget.assignment['user']['displayName']}'))),
          ErrorNote(error),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : toggle,
            icon: busy
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
                    active
                        ? Icons.pause_circle_outline_rounded
                        : Icons.play_circle_outline_rounded,
                  ),
            label: Text(
              active ? appText('s783') : appText('s784'),
            ),
          ),
        ],
      ),
    );
  }
}

class InviteStaff extends StatefulWidget {
  final bool allowManager;
  final ApiClient api;
  final String gymId, branchId;
  const InviteStaff({
    super.key,
    this.allowManager=true,
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s772'),
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        if (result == null) ...[
          for (final field in [
            (name, appText('s785')),
            (email, appText('s293')),
            (phone, appText('s294')),
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
            decoration: InputDecoration(labelText: appText('s786')),
            items: [
              DropdownMenuItem(value: 'CASHIER', child: Text(appText('s779'))),
              if(widget.allowManager)DropdownMenuItem(
                value: 'BRANCH_MANAGER',
                child: Text(appText('s778')),
              ),
            ],
            onChanged: busy ? null : (v) => setState(() => role = v!),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            appText('s787'),
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
          EmptyState(
            appText('s788'),
            detail: appText('s789'),
            icon: Icons.mark_email_read_outlined,
          ),
          if(role=='BRANCH_MANAGER'&&result?['canDelegate']==true&&result?['user']?['id']!=null)ActionButton(appText('s790'),onPressed:()=>open(context,StaffDelegation(api:widget.api,gymId:widget.gymId,userId:result!['user']['id'],branchId:widget.branchId,name:name.text))),
          const SizedBox(height: 18),
          SelectableText(
            'https://gym-network-platform.vercel.app/#invite=${result!['invitation']?['token']??result!['token']}',
            textDirection: TextDirection.ltr,
          ),
        ],
      ],
    ),
  ); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  DefaultTabController(
    length: 1,
    child: Scaffold(
      appBar: AppBar(
        title: Text(branch == null ? appText('s791') : appText('s792', [branch!['name']])),
        bottom: TabBar(
          tabs: [
            Tab(text: appText('s11')),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          for (final kind in ['VISITS'])
            PagedRecords(
              api: api,
              path:
                  'reports/rows?gymId=$gymId&${reportRange()}&kind=$kind${branch == null ? '' : '&branchId=${branch!['id']}'}',
              item: (r) => Panel(
                child: Column(
                  children: [
                    Fact(
                      r['branchName'] ?? appText('s793'),
                      appText('s120', [r['points']]),
                      strong: true,
                    ),
                    Fact(appText('s794'), appText('s122', [money(r['amountPiasters'])])),
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
  ); }
}


