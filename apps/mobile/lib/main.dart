import 'l10n/language.dart';
import 'screens/account_deletion.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api.dart';
import 'core/ui.dart';
import 'screens/auth.dart';
import 'screens/trainee.dart';
import 'screens/bookings.dart';
import 'screens/market.dart';
import 'screens/booking_admin.dart';
import 'screens/directory.dart';
import 'screens/owner.dart';
import 'screens/money.dart';
import 'screens/account.dart';
import 'screens/operations.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(GymNetworkApp(api: ApiClient()));
}

class GymNetworkApp extends StatefulWidget {
  final ApiClient api;
  const GymNetworkApp({super.key, required this.api});
  @override
  State<GymNetworkApp> createState() => _GymNetworkAppState();
}

class _GymNetworkAppState extends State<GymNetworkApp> {
  final navigator = GlobalKey<NavigatorState>();
  Object? error;
  bool loading = true;
  String? actor;
  @override
  void initState() {
    super.initState();
    actor = widget.api.user?['id'];
    AppLanguage.instance.addListener(changed);
    widget.api.addListener(changed);
    restore();
  }

  Future<void> restore() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await AppLanguage.instance.restore(widget.api.storage.read, widget.api.storage.write);
      if (!widget.api.restored ||
          (widget.api.token != null && widget.api.user == null)) {
        // A startup retry must restore both identity and its saved financial envelope.
        await widget.api.restore();
      }
    } catch (e) {
      error = const ApiFailure('SERVICE_UNAVAILABLE');
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  void changed() {
    if (!mounted) return;
    final next = widget.api.user?['id'] as String?;
    if (actor != next) {
      actor = next;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        navigator.currentState?.popUntil((r) => r.isFirst);
      });
    }
    setState(() {});
  }

  @override
  void dispose() {
    AppLanguage.instance.removeListener(changed);
    widget.api.removeListener(changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return LanguageScope(language: AppLanguage.instance, child: MaterialApp(
    navigatorKey: navigator,
    title: 'GymBank',
    debugShowCheckedModeBanner: false,
    theme: appTheme(),
    locale: AppLanguage.instance.locale,
    supportedLocales: const [Locale('ar'), Locale('en')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    home: loading
        ? const Scaffold(body: Center(child: Brand(large: true)))
        : error != null
        ? Scaffold(
            body: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: ErrorNote(error, retry: restore),
                ),
              ),
            ),
          )
        : widget.api.user == null
        ? widget.api.deletionReceipt != null
          ? AccountDeletionReceipt(api:widget.api)
          : AuthScreen(api: widget.api)
        : SessionGate(key: ValueKey(widget.api.user!['id']), api: widget.api),
  )); }
}

class SessionGate extends StatefulWidget {
  final ApiClient api;
  const SessionGate({super.key, required this.api});
  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  bool loading = true;
  Object? error;
  Json? application;
  List<Json> gyms = [];
  bool assignedWork = false;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      if (widget.api.user!['role'] == 'GYM_OWNER') {
        final d = await Future.wait([
          widget.api.request('me/gym-application'),
          widget.api.request('gyms?limit=100'),
        ]);
        application = d[0]['application'] == null
            ? null
            : Map<String, dynamic>.from(d[0]['application']);
        gyms = rows(d[1]);
      } else if ([
        'TRAINEE',
        'CASHIER',
        'BRANCH_MANAGER',
      ].contains(widget.api.user!['role'])) {
        final access = await widget.api.request('me/access');
        gyms = rows({'items': access['ownedGyms']});
        assignedWork =
            (access['assignments'] as List? ?? []).isNotEmpty ||
            gyms.isNotEmpty;
      }
    } catch (e) {
      error = e;
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    if (loading)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (error != null)
      return Screen(
        title: appText('s0'),
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [ErrorNote(error, retry: load)],
        ),
      );
    final role = widget.api.user!['role'];
    if(role=='PLATFORM_ADMIN') return BookingAdminScreen(api:widget.api);
    if (role == 'GYM_OWNER' &&
        application != null &&
        application!['status'] != 'APPROVED')
      return ApplicationScreen(
        api: widget.api,
        application: application!,
        refresh: load,
      );
    if (role == 'TRAINEE' ||
        role == 'GYM_OWNER' && gyms.isNotEmpty ||
        role == 'BRANCH_MANAGER' ||
        role == 'CASHIER')
      return NativeShell(
        api: widget.api,
        gyms: gyms,
        assignedWork: assignedWork,
      );
    return Screen(
      title: 'GymBank',
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          EmptyState(
            appText('s1'),
            detail:
                appText('s2'),
          ),
          const SizedBox(height: 20),
          ActionButton(
            appText('s3'),
            onPressed: () => launchUrl(
              Uri.parse('https://gym-network-platform.vercel.app/'),
              mode: LaunchMode.externalApplication,
            ),
          ),
          const LanguageSelector(),
          if(role!='PLATFORM_ADMIN')TextButton(onPressed:()=>open(context,AccountDeletionScreen(api:widget.api)),child:Text(appText('s4'))),
          TextButton(
            onPressed: () => widget.api.logout(),
            child: Text(appText('s5')),
          ),
        ],
      ),
    );
  }
}

class NativeShell extends StatefulWidget {
  final ApiClient api;
  final List<Json> gyms;
  final bool assignedWork;
  const NativeShell({
    super.key,
    required this.api,
    required this.gyms,
    this.assignedWork = false,
  });
  @override
  State<NativeShell> createState() => _NativeShellState();
}

class _NativeShellState extends State<NativeShell> {
  int index = 0, gymIndex = 0, version = 0;
  bool retrying = false;
  String? staffBranchId;
  Object? error;
  bool workMode = false;
  @override
  void initState() {
    super.initState();
    workMode = widget.api.user?['role'] != 'TRAINEE';
  }

  bool get owner => workMode && widget.gyms.isNotEmpty;
  bool get staff => workMode && !owner;
  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final gym = owner ? widget.gyms[gymIndex] : null;
    final tabs = owner
        ? [
            (Icons.dashboard_outlined, appText('s6')),
            (Icons.storefront_outlined, appText('s7')),
            (Icons.qr_code_scanner_rounded, appText('s8')),
            (Icons.shopping_bag_outlined, appText('s9')),
            (Icons.person_outline_rounded, appText('s10')),
          ]
        : staff
        ? [
            (Icons.dashboard_outlined, appText('s6')),
            (Icons.directions_run_rounded, appText('s11')),
            (Icons.qr_code_scanner_rounded, appText('s8')),
            (Icons.shopping_bag_outlined, appText('s9')),
            (Icons.person_outline_rounded, appText('s10')),
          ]
        : [
            (Icons.home_outlined, appText('s6')),
            (Icons.near_me_outlined, appText('s12')),
            (Icons.qr_code_2_rounded, appText('s13')),
            (Icons.shopping_bag_outlined, appText('s9')),
            (Icons.person_outline_rounded, appText('s10')),
          ];
    final workHomeTools=Column(crossAxisAlignment:CrossAxisAlignment.stretch,children:[
            if (owner && index != 3 && widget.gyms.length > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Row(
                  children: [
                    const Icon(
                      Icons.storefront_outlined,
                      color: green,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Semantics(
                        label: appText('s14'),
                        child: DropdownButton<int>(
                          value: gymIndex,
                          isExpanded: true,
                          underline: const SizedBox.shrink(),
                          items: [
                            for (var i = 0; i < widget.gyms.length; i++)
                              DropdownMenuItem(
                                value: i,
                                child: Text(
                                  '${widget.gyms[i]['name']}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                          ],
                          onChanged: widget.api.pending != null
                              ? null
                              : (v) => setState(() {
                                  gymIndex = v!;
                                  version++;
                                }),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
     Wrap(alignment:WrapAlignment.end,spacing:8,children:[
      if(widget.api.user?['role']=='TRAINEE'&&widget.assignedWork)TextButton(onPressed:widget.api.pending!=null?null:()=>setState((){workMode=false;index=0;version++;}),child:Text(appText('s15'))),
     ]),
    ]);
    Widget content;
    if (owner) {
      content = switch (index) {
        0 => OwnerHome(
          api: widget.api,
          gym: gym!,
          showBranches: () => setState(() => index = 1),
          showMoney: () => open(context, MoneyScreen(api: widget.api, gym: gym)),
          showOperations: () => setState(() => index = 2),
          homeTools:workHomeTools,
        ),
        1 => BranchesScreen(api: widget.api, gym: gym!),
        2 => OperationsHome(api: widget.api, gymId: '${gym!['id']}'),
        3 => MarketScreen(api: widget.api),
        _ => AccountScreen(api: widget.api, workplace: true, ownerView: true),
      };
    } else if (staff) {
      content = index < 3
          ? StaffWorkplace(api: widget.api, section: index, branchId: staffBranchId,homeTools:workHomeTools,
              onBranchChanged: (id) => setState(() { staffBranchId = id; version++; }),
              showVisits: () => setState(() => index = 1),
              showSales: () => setState(() => index = 2))
          : index == 3 ? MarketScreen(api: widget.api) : AccountScreen(api: widget.api, workplace: true);
    } else {
      content = switch (index) {
        0 => TraineeHome(
          api: widget.api,
          showGyms: () => setState(() => index = 1),
          showQr: () => setState(() => index = 2),
          showWork: widget.assignedWork ? () => setState(() {workMode = true;index = 0;version++;}) : null,
        ),
        1 => DirectoryScreen(api: widget.api),
        2 => GymEntryScreen(api: widget.api),
        3 => MarketScreen(api: widget.api),
        _ => AccountScreen(api: widget.api),
      };
    }
    return AnnotatedRegion<SystemUiOverlayStyle>(value: index == 0 ? SystemUiOverlayStyle.light.copyWith(statusBarColor: ink) : SystemUiOverlayStyle.dark, child: Scaffold(
      backgroundColor: index == 0 ? ink : canvas,
      extendBody: !staff,
      appBar: index == 0 || (!workMode && index == 1) ? null : AppBar(
        title: const Brand(),
        centerTitle: !workMode,
        actions: [
          if (widget.api.user?['role'] == 'TRAINEE' && widget.assignedWork)
            TextButton(
              onPressed: widget.api.pending != null
                  ? null
                  : () => setState(() {
                      workMode = !workMode;
                      index = 0;
                      version++;
                    }),
              child: Text(workMode ? appText('s15') : appText('s16')),
            ),
        ],
      ),
      body: MediaQuery.removePadding(
        context: context,
        removeBottom: !staff,
        child: SafeArea(
          bottom: staff,
          // Only the opaque bar reserves space; content fills the QR headroom.
          child: Padding(
            padding: EdgeInsets.only(bottom: staff ? 0 : 60 + MediaQuery.viewPaddingOf(context).bottom),
            child: Column(
          children: [
            if (owner && index != 0 && index != 3 && widget.gyms.length > 1)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Row(
                  children: [
                    const Icon(
                      Icons.storefront_outlined,
                      color: green,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Semantics(
                        label: appText('s14'),
                        child: DropdownButton<int>(
                          value: gymIndex,
                          isExpanded: true,
                          underline: const SizedBox.shrink(),
                          items: [
                            for (var i = 0; i < widget.gyms.length; i++)
                              DropdownMenuItem(
                                value: i,
                                child: Text(
                                  '${widget.gyms[i]['name']}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                          ],
                          onChanged: widget.api.pending != null
                              ? null
                              : (v) => setState(() {
                                  gymIndex = v!;
                                  version++;
                                }),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (widget.api.pending != null)
              Container(
                width: double.infinity,
                color: const Color(0xfffff1d6),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                child: Column(
                  children: [
                    Text(
                      appText('s17'),
                      style: TextStyle(fontSize: 12),
                    ),
                    TextButton(
                      onPressed: retrying
                          ? null
                          : () async {
                              setState(() {
                                retrying = true;
                                error = null;
                              });
                              try {
                                final r = await widget.api.retryPending();
                                if (context.mounted) {
                                  setState(() => version++);
                                  await showDialog<void>(
                                    context: context,
                                    builder: (c) { AppLanguage.watch(c); return  AlertDialog(
                                      title: Text(appText('s18')),
                                      content: Text(appText('s19', [r['id']])),
                                      actions: [
                                        TextButton(
                                          onPressed: () => Navigator.pop(c),
                                          child: Text(appText('s20')),
                                        ),
                                      ],
                                    ); },
                                  );
                                }
                              } catch (e) {
                                if (mounted) setState(() => error = e);
                              } finally {
                                if (mounted) setState(() => retrying = false);
                              }
                            },
                      child: Text(
                        retrying
                            ? appText('s21')
                            : appText('s22'),
                      ),
                    ),
                    if (error != null) ErrorNote(error),
                  ],
                ),
              ),
            Expanded(
              child: KeyedSubtree(
                key: ValueKey('$index:$gymIndex:$version'),
                child: Theme(
                  data: !workMode ? Theme.of(context).copyWith(
                    textTheme: Theme.of(context).textTheme.copyWith(
                      titleLarge: const TextStyle(fontSize:18,fontWeight:FontWeight.w800,color:ink),
                      headlineMedium: const TextStyle(fontSize:23,fontWeight:FontWeight.w800,color:ink),
                    ),
                  ) : Theme.of(context),
                  child: content,
                ),
              ),
            ),
          ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: Stack(
        clipBehavior: Clip.none,
        children: [
          Padding(
            padding: EdgeInsets.only(top: staff ? 0 : 16),
            child: NavigationBar(
              height: 60,
              elevation: 0,
              surfaceTintColor: Colors.transparent,
              selectedIndex: index,
              indicatorColor: !staff && index == 2 ? Colors.transparent : null,
              onDestinationSelected: (v) => setState(() => index = v),
              destinations: [
                for (final (i, tab) in tabs.indexed)
                  NavigationDestination(
                    icon: !staff && i == 2 ? const SizedBox(width: 24, height: 24) : Icon(tab.$1),
                    label: tab.$2,
                  ),
              ],
            ),
          ),
          if (!staff) Positioned(top: 0, left: 0, right: 0,
            child: Center(child: _FloatingQrButton(
              key: const Key('navigation.qr'),
              icon: tabs[2].$1,
              onPressed: () => setState(() => index = 2),
            )),
          ),
        ],
      ),
    ));
  }
}

// The transparent headroom belongs to the bar's layout, so the raised
// portion is tappable too. The native destination retains keyboard/reader access.
class _FloatingQrButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  const _FloatingQrButton({super.key, required this.icon, required this.onPressed});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  ExcludeSemantics(child: SizedBox(
    width: 48, height: 48,
    child: Material(
      color: lime,
      elevation: 3,
      shadowColor: const Color(0x33006b52),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Colors.white, width: 2)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        canRequestFocus: false,
        onTap: onPressed,
        child: Icon(icon, color: ink, size: 26),
      ),
    ),
  )); }
}

class GymEntryScreen extends StatefulWidget {
 final ApiClient api;
 const GymEntryScreen({super.key,required this.api});
 @override State<GymEntryScreen> createState()=>_GymEntryScreenState();
}
class _GymEntryScreenState extends State<GymEntryScreen>{
 bool bookings=false;
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Column(children:[
  Padding(padding:const EdgeInsets.fromLTRB(20,8,20,8),child:Row(children:[
   Expanded(child:OutlinedButton(onPressed:()=>setState(()=>bookings=false),child:Text(appText('s23')))),
   const SizedBox(width:10),
   Expanded(child:OutlinedButton(onPressed:()=>setState(()=>bookings=true),child:Text(appText('s24')))),
  ])),
  TextButton.icon(onPressed:()=>open(context,Screen(title:appText('s25'),child:VisitsScreen(api:widget.api,showQr:()=>Navigator.pop(context)))),icon:const Icon(Icons.history_rounded),label:Text(appText('s25'))),
  if(!bookings)...[
   Padding(padding:EdgeInsets.symmetric(horizontal:20),child:Text(appText('s26'),style:TextStyle(color:muted,fontSize:12))),
   TextButton.icon(onPressed:()=>open(context,Screen(title:appText('s27'),child:DirectoryScreen(api:widget.api))),icon:const Icon(Icons.place_outlined),label:Text(appText('s28'))),
  ],
  Expanded(child:bookings?BookingsScreen(api:widget.api,embedded:true):QrScreen(api:widget.api)),
 ]); }
}
