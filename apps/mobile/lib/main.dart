import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:url_launcher/url_launcher.dart';

import 'core/api.dart';
import 'core/ui.dart';
import 'screens/auth.dart';
import 'screens/trainee.dart';
import 'screens/bookings.dart';
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
    widget.api.addListener(changed);
    restore();
  }

  Future<void> restore() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
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
    widget.api.removeListener(changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    navigatorKey: navigator,
    title: 'GymBank',
    debugShowCheckedModeBanner: false,
    theme: appTheme(),
    locale: const Locale('ar'),
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
        ? AuthScreen(api: widget.api)
        : SessionGate(key: ValueKey(widget.api.user!['id']), api: widget.api),
  );
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
    if (loading)
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (error != null)
      return Screen(
        title: 'حسابك',
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [ErrorNote(error, retry: load)],
        ),
      );
    final role = widget.api.user!['role'];
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
          const EmptyState(
            'مساحة الإدارة على الويب',
            detail:
                'إدارة المنصة متاحة من لوحة الويب. لو حسابك تابع لجيم، راجع تفعيل الجيم وتعيينات الفروع.',
          ),
          const SizedBox(height: 20),
          ActionButton(
            'افتح لوحة الويب',
            onPressed: () => launchUrl(
              Uri.parse('https://gym-network-platform.vercel.app/'),
              mode: LaunchMode.externalApplication,
            ),
          ),
          TextButton(
            onPressed: () => widget.api.logout(),
            child: const Text('تسجيل الخروج'),
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
    final gym = owner ? widget.gyms[gymIndex] : null;
    final tabs = owner
        ? const [
            (Icons.dashboard_outlined, 'الرئيسية'),
            (Icons.storefront_outlined, 'الفروع'),
            (Icons.qr_code_scanner_rounded, 'التشغيل'),
            (Icons.payments_outlined, 'مستحقاتي'),
            (Icons.person_outline_rounded, 'حسابي'),
          ]
        : staff
        ? const [
            (Icons.dashboard_outlined, 'الرئيسية'),
            (Icons.directions_run_rounded, 'الزيارات'),
            (Icons.receipt_long_outlined, 'المبيعات'),
            (Icons.person_outline_rounded, 'حسابي'),
          ]
        : const [
            (Icons.home_outlined, 'الرئيسية'),
            (Icons.near_me_outlined, 'الجيمات'),
            (Icons.qr_code_2_rounded, 'حجوزاتي'),
            (Icons.history_rounded, 'زياراتي'),
            (Icons.person_outline_rounded, 'حسابي'),
          ];
    Widget content;
    if (owner) {
      content = switch (index) {
        0 => OwnerHome(
          api: widget.api,
          gym: gym!,
          showBranches: () => setState(() => index = 1),
          showMoney: () => setState(() => index = 3),
          showOperations: () => setState(() => index = 2),
        ),
        1 => BranchesScreen(api: widget.api, gym: gym!),
        2 => OperationsHome(api: widget.api, gymId: '${gym!['id']}'),
        3 => MoneyScreen(api: widget.api, gym: gym!),
        _ => AccountScreen(api: widget.api, workplace: true, ownerView: true),
      };
    } else if (staff) {
      content = index < 3
          ? StaffWorkplace(api: widget.api, section: index, branchId: staffBranchId,
              onBranchChanged: (id) => setState(() { staffBranchId = id; version++; }),
              showVisits: () => setState(() => index = 1),
              showSales: () => setState(() => index = 2))
          : AccountScreen(api: widget.api, workplace: true);
    } else {
      content = switch (index) {
        0 => TraineeHome(
          api: widget.api,
          showGyms: () => setState(() => index = 1),
          showQr: () => setState(() => index = 2),
        ),
        1 => DirectoryScreen(api: widget.api),
        2 => BookingsScreen(api: widget.api,embedded:true),
        3 => VisitsScreen(
          api: widget.api,
          showQr: () => setState(() => index = 2),
        ),
        _ => AccountScreen(api: widget.api),
      };
    }
    return Scaffold(
      appBar: AppBar(
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
              child: Text(workMode ? 'حساب المتدرب' : 'عملي في الجيم'),
            ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (owner && widget.gyms.length > 1)
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
                        label: 'الجيم الحالي',
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
                    const Text(
                      'فيه عملية محفوظة لسه نتيجتها غير مؤكدة. اتأكد منها قبل أي تحويل جديد.',
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
                                    builder: (c) => AlertDialog(
                                      title: const Text('تم تأكيد العملية'),
                                      content: Text('المرجع: ${r['id']}'),
                                      actions: [
                                        TextButton(
                                          onPressed: () => Navigator.pop(c),
                                          child: const Text('تم'),
                                        ),
                                      ],
                                    ),
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
                            ? 'بنتحقق من العملية…'
                            : 'إعادة نفس العملية بأمان',
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
      bottomNavigationBar: NavigationBar(
        height: workMode ? 80 : 72,
        selectedIndex: index,
        onDestinationSelected: (v) => setState(() => index = v),
        destinations: tabs
            .map((t) => NavigationDestination(icon: Icon(t.$1), label: t.$2))
            .toList(),
      ),
    );
  }
}
