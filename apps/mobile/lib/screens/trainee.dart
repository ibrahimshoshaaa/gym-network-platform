import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'topup.dart';
import 'account.dart';

class TraineeHome extends StatefulWidget {
  final ApiClient api;
  final VoidCallback showGyms, showQr;
  const TraineeHome({
    super.key,
    required this.api,
    required this.showGyms,
    required this.showQr,
  });
  @override
  State<TraineeHome> createState() => _TraineeHomeState();
}

class _TraineeHomeState extends State<TraineeHome> {
  Json? wallet;
  List<Json>? visits, movements;
  Object? walletError, visitsError, movementsError;
  bool walletLoading = true, visitsLoading = true, movementsLoading = true;
  int generation = 0;

  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final current = ++generation;
    setState(() {
      walletLoading = visitsLoading = movementsLoading = true;
      walletError = visitsError = movementsError = null;
    });
    // Each section commits independently: a slow history must not hide the wallet.
    Future<void> part(String path, void Function(dynamic) success,
        void Function(Object) failure, void Function() finish) async {
      try {
        final result = await widget.api.request(path);
        if (mounted && current == generation) setState(() => success(result));
      } catch (e) {
        if (mounted && current == generation) setState(() => failure(e));
      } finally {
        if (mounted && current == generation) setState(finish);
      }
    }
    await Future.wait([
      part('trainee/wallet', (r) => wallet = Map<String, dynamic>.from(r),
          (e) { wallet = null; walletError = e; }, () => walletLoading = false),
      part('trainee/active-visits', (r) => visits = rows(r),
          (e) { visits = null; visitsError = e; }, () => visitsLoading = false),
      part('trainee/wallet/movements?limit=3', (r) => movements = rows(r),
          (e) { movements = null; movementsError = e; }, () => movementsLoading = false),
    ]);
  }

  Future<void> topup() async {
    await open(context, TopupScreen(api: widget.api));
    if (mounted) await load();
  }

  @override
  Widget build(BuildContext context) {
    final unavailable = int.tryParse('${wallet?['unavailablePoints']}') ?? 0;
    return RefreshIndicator(
      onRefresh: load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        children: [
          Row(children: [
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('أهلًا ${widget.api.user!['displayName'].toString().split(' ').first}',
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                const Text('جاهز لتمرينتك؟', style: TextStyle(color: muted, fontSize: 12)),
              ],
            )),
            IconButton(
              tooltip: 'الإشعارات',
              icon: const Icon(Icons.notifications_none_rounded),
              onPressed: () => open(context, NotificationsScreen(api: widget.api)),
            ),
          ]),
          const SizedBox(height: 18),
          Panel(
            color: ink,
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('رصيدك المتاح', style: TextStyle(color: Colors.white70, fontSize: 12)),
                const SizedBox(height: 10),
                if (walletLoading && wallet == null)
                  const Padding(padding: EdgeInsets.symmetric(vertical: 12),
                    child: CircularProgressIndicator(color: lime))
                else if (wallet != null) ...[
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerStart,
                    child: Text('${wallet!['spendablePoints']} نقطة',
                      style: const TextStyle(fontSize: 36, height: 1.2,
                        fontWeight: FontWeight.w900, color: lime)),
                  ),
                  const SizedBox(height: 8),
                  Text(wallet!['status'] == 'EXPIRED'
                    ? 'انتهت صلاحية الرصيد · راجع الإدارة'
                    : wallet!['expiresAt'] != null
                    ? 'صالح حتى ${shortDate(wallet!['expiresAt']).split(' · ').first}'
                    : 'اشحن رصيدك وابدأ تمرينك',
                    style: const TextStyle(color: Colors.white70, fontSize: 11)),
                ] else
                  const Text('تعذر تحميل الرصيد', style: TextStyle(color: Colors.white)),
                if (walletLoading && wallet != null) ...[
                  const SizedBox(height: 8),
                  const LinearProgressIndicator(color: lime, minHeight: 2),
                ],
                const SizedBox(height: 16),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: lime, foregroundColor: ink),
                    onPressed: widget.showQr,
                    icon: const Icon(Icons.qr_code_2_rounded, size: 20),
                    label: const Text('رمز الدخول'),
                  ),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white38)),
                    onPressed: topup,
                    icon: const Icon(Icons.add_rounded, size: 20),
                    label: const Text('اشحن رصيدك'),
                  ),
                ]),
              ],
            ),
          ),
          if (walletError != null) ErrorNote(walletError, retry: load),
          if (unavailable > 0) ...[
            const SizedBox(height: 12),
            PortalNote('$unavailable نقطة غير متاحة حاليًا. راجع الإدارة لتسوية صلاحية الرصيد.'),
          ],
          if (visitsLoading)
            const Padding(padding: EdgeInsets.symmetric(vertical: 12),
              child: LinearProgressIndicator(minHeight: 2))
          else if (visitsError != null)
            ErrorNote(visitsError, retry: load)
          else if (visits?.isNotEmpty == true) ...[
            const SectionTitle('جلستك الحالية'),
            ...visits!.map((v) => Padding(
              padding: const EdgeInsets.only(bottom: 12), child: VisitCard(v))),
          ],
          const SizedBox(height: 16),
          Panel(
            padding: EdgeInsets.zero,
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              leading: const Icon(Icons.near_me_outlined, color: green),
              title: const Text('اختار جيم قريب',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              subtitle: const Text('شوف المكان ونقاط الزيارة',
                style: TextStyle(color: muted, fontSize: 11)),
              trailing: const Icon(Icons.arrow_back_rounded, size: 18),
              onTap: widget.showGyms,
            ),
          ),
          SectionTitle('آخر حركة في رصيدك', trailing: TextButton(
            onPressed: () => open(context, WalletHistory(api: widget.api)),
            child: const Text('السجل كامل'))),
          if (movementsLoading && movements == null)
            const Center(child: CircularProgressIndicator())
          else if (movementsError != null)
            ErrorNote(movementsError, retry: load)
          else if (movements?.isEmpty == true)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('أول شحن أو زيارة هتظهر هنا.',
                style: TextStyle(color: muted, fontSize: 12)),
            )
          else if (movements != null)
            Panel(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(children: [
                for (final r in movements!)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon((r['delta'] as num) > 0
                      ? Icons.south_west_rounded : Icons.north_east_rounded, color: green),
                    title: Text('${r['sourceLabel'] ?? r['branch']?['name'] ?? 'حركة نقاط'}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                    subtitle: Text(shortDate(r['eventAt']), style: const TextStyle(fontSize: 11)),
                    trailing: Text('${(r['delta'] as num) > 0 ? '+' : ''}${r['delta']}',
                      textDirection: TextDirection.ltr,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: green)),
                    onTap: () => open(context, WalletHistory(api: widget.api)),
                  ),
              ]),
            ),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () => open(context, TopupHistory(api: widget.api)),
            icon: const Icon(Icons.pending_actions_rounded, size: 18),
            label: const Text('متابعة طلبات الشحن'),
          ),
        ],
      ),
    );
  }
}

class WalletHistory extends StatelessWidget {
  final ApiClient api;
  const WalletHistory({super.key, required this.api});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'حركة نقاطك',
    child: PagedRecords(
      api: api,
      path: 'trainee/wallet/movements',
      item: (r) {
        final positive = (r['delta'] as num) > 0;
        return Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: positive ? const Color(0xffe5f4e9) : canvas,
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Icon(
                      positive
                          ? Icons.south_west_rounded
                          : Icons.north_east_rounded,
                      color: green,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      {
                            'TOPUP': 'شحن رصيد',
                            'SALE': 'شراء نقاط من الجيم',
                            'VISIT': 'خصم زيارة',
                            'VISIT_CANCELLATION': 'استرداد زيارة',
                            'EXPIRY': 'انتهاء صلاحية',
                            'ADJUSTMENT': 'تسوية رصيد',
                          }[r['operation']] ??
                          'حركة نقاط',
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                  Text(
                    '${positive ? '+' : ''}${r['delta']}',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      color: positive ? green : ink,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                '${r['sourceLabel'] ?? r['branch']?['name'] ?? 'المنصة'}',
                style: const TextStyle(color: muted),
              ),
              Text(
                shortDate(r['eventAt']),
                style: const TextStyle(color: muted, fontSize: 11),
              ),
              Reference('${r['referenceId']}'),
            ],
          ),
        );
      },
    ),
  );
}

class VisitCard extends StatelessWidget {
  final Json visit;
  const VisitCard(this.visit, {super.key});
  @override
  Widget build(BuildContext context) => Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(Icons.fitness_center_rounded, color: green),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '${visit['branch']?['name'] ?? visit['branchName'] ?? 'زيارة جيم'}',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
            StatusPill(visit['status']),
          ],
        ),
        Fact('النقاط', '${visit['pointsCharged']} نقطة'),
        Text(
          shortDate(visit['startedAt']),
          style: const TextStyle(color: muted, fontSize: 12),
        ),
        if (visit['status'] == 'ACTIVE')
          Text(
            'نهاية الجلسة: ${shortDate(visit['expiresAt'])}',
            style: const TextStyle(color: green, fontWeight: FontWeight.w600),
          ),
        Reference('${visit['id']}'),
      ],
    ),
  );
}

class VisitsScreen extends StatelessWidget {
  final ApiClient api;
  final VoidCallback? showQr;
  const VisitsScreen({super.key, required this.api, this.showQr});
  @override
  Widget build(BuildContext context) => PagedRecords(
    api: api,
    path: 'trainee/visits',
    header: const PortalIntro(
      'زياراتك',
      detail: 'تابع الجلسات الحالية والزيارات السابقة ونقاط كل زيارة.',
    ),
    empty: 'لسه مفيش زيارات',
    emptyDetail: 'اختار جيمك واعرض رمز الدخول عند وصولك. الزيارة هتظهر هنا بعد تأكيد حضورك.',
    emptyAction: showQr == null
        ? null
        : ActionButton(
            'افتح رمز الدخول',
            icon: Icons.qr_code_2_rounded,
            onPressed: showQr,
          ),
    item: (r) => VisitCard(r),
  );
}

class QrScreen extends StatefulWidget {
  final ApiClient api;
  const QrScreen({super.key, required this.api});
  @override
  State<QrScreen> createState() => _QrScreenState();
}

class _QrScreenState extends State<QrScreen> with WidgetsBindingObserver {
  Json? qr;
  Object? error;
  bool busy = false, foreground = true;
  Timer? timer;
  final clock = Stopwatch();
  Duration validity = Duration.zero;
  int get remaining =>
      (validity.inSeconds - clock.elapsed.inSeconds).clamp(0, 60);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    load();
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && foreground) setState(() {});
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    clock.stop();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (!foreground) {
      setState(() => qr = null);
    } else {
      load();
    }
  }

  Future<void> load() async {
    if (busy || !foreground) return;
    setState(() {
      busy = true;
      qr = null;
      error = null;
    });
    final requestClock = Stopwatch()..start();
    try {
      final r = Map<String, dynamic>.from(
        await widget.api.request('trainee/qr', method: 'POST'),
      );
      validity =
          DateTime.parse(r['expiresAt'])
              .difference(DateTime.parse(r['serverTime'])) -
          requestClock.elapsed;
      clock
        ..reset()
        ..start();
      if (mounted && foreground) setState(() => qr = r);
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(24),
    children: [
      const SizedBox(height: 14),
      Text(
        'دخولك يبدأ من هنا',
        style: Theme.of(context).textTheme.headlineMedium,
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 8),
      const Text(
        'ورّي الرمز للكاشير في الجيم. راجع نقاط الزيارة قبل ما تأكد حضورك.',
        textAlign: TextAlign.center,
        style: TextStyle(color: muted),
      ),
      const SizedBox(height: 28),
      Panel(
        child: Column(
          children: [
            const Brand(),
            const SizedBox(height: 28),
            if (busy)
              const SizedBox(
                height: 230,
                child: Center(child: CircularProgressIndicator()),
              )
            else if (qr != null && remaining > 0 && foreground)
              Semantics(
                label: 'رمز دخول مؤقت؛ اعرضه للكاشير فقط',
                child: QrImageView(
                  data: qr!['token'],
                  version: QrVersions.auto,
                  size: 230,
                  backgroundColor: Colors.white,
                ),
              )
            else
              const SizedBox(
                height: 230,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.qr_code_2_rounded, size: 110, color: muted),
                    Text('الرمز غير متاح أو انتهت صلاحيته'),
                  ],
                ),
              ),
            const SizedBox(height: 18),
            Text(
              qr != null && remaining > 0
                  ? 'صالح لمدة $remaining ثانية'
                  : 'افتح رمزًا جديدًا وقت الدخول',
              style: const TextStyle(fontWeight: FontWeight.w700, color: green),
            ),
            const SizedBox(height: 18),
            ActionButton(
              'تحديث رمز الدخول',
              onPressed: load,
              busy: busy,
              icon: Icons.refresh_rounded,
            ),
          ],
        ),
      ),
      ErrorNote(error),
      const SizedBox(height: 18),
      const Text(
        'الرمز مؤقت وبيستخدم مرة واحدة. متشاركوش مع حد خارج الجيم.',
        style: TextStyle(color: muted, fontSize: 12),
        textAlign: TextAlign.center,
      ),
    ],
  );
}
