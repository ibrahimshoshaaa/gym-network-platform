import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'topup.dart';
import 'account.dart';

class TraineeHome extends StatelessWidget {
  final ApiClient api;
  final VoidCallback showGyms, showQr;
  const TraineeHome({
    super.key,
    required this.api,
    required this.showGyms,
    required this.showQr,
  });
  @override
  Widget build(BuildContext context) => DataView(
    load: () => Future.wait([
      api.request('trainee/wallet'),
      api.request('trainee/active-visits'),
      api.request('trainee/wallet/movements?limit=3'),
    ]),
    builder: (data, reload) {
      final w = data[0], visits = rows(data[1]), movements = rows(data[2]);
      final unavailable = int.tryParse('${w['unavailablePoints']}') ?? 0;
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 30),
        children: [
          PortalIntro(
            'أهلًا ${api.user!['displayName'].toString().split(' ').first}',
            eyebrow: 'حساب المتدرب',
            detail: 'رصيد واحد. اختار مكان تمرينك وابدأ.',
            trailing: IconButton(
              tooltip: 'الإشعارات',
              icon: const Icon(Icons.notifications_none_rounded),
              onPressed: () => open(context, NotificationsScreen(api: api)),
            ),
          ),
          Panel(
            color: ink,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.account_balance_wallet_outlined,
                      color: lime,
                      size: 20,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'رصيدك المتاح',
                      style: TextStyle(color: Colors.white70),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    '${w['spendablePoints']} نقطة',
                    style: const TextStyle(
                      fontSize: 44,
                      height: 1.2,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  w['expiresAt'] != null
                      ? 'صالح حتى ${shortDate(w['expiresAt']).split(' · ').first}'
                      : 'اشحن رصيدك وابدأ تمرينك',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: lime,
                    foregroundColor: ink,
                  ),
                  onPressed: () async {
                    await open(context, TopupScreen(api: api));
                    await reload();
                  },
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('اشحن رصيدك'),
                ),
              ],
            ),
          ),
          if (unavailable > 0) ...[
            const SizedBox(height: 12),
            PortalNote(
              '$unavailable نقطة غير متاحة حاليًا. راجع الإدارة لتسوية صلاحية الرصيد.',
            ),
          ],
          const SectionTitle('تمرينتك الجاية'),
          PortalGrid(
            children: [
              PortalTask(
                'رمز الدخول',
                detail: 'اعرضه عند وصولك للفرع',
                icon: Icons.qr_code_2_rounded,
                primary: true,
                onTap: showQr,
              ),
              PortalTask(
                'جيم قريب',
                detail: 'قارن المكان ونقاط الزيارة',
                icon: Icons.near_me_outlined,
                onTap: showGyms,
              ),
            ],
          ),
          if (visits.isNotEmpty) ...[
            const SectionTitle('جلستك الحالية'),
            ...visits.map(
              (v) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: VisitCard(v),
              ),
            ),
          ],
          SectionTitle(
            'آخر حركة في رصيدك',
            trailing: TextButton(
              onPressed: () => open(context, WalletHistory(api: api)),
              child: const Text('السجل كامل'),
            ),
          ),
          if (movements.isEmpty)
            const EmptyState(
              'رصيدك لسه في البداية',
              detail:
                  'أول شحن أو زيارة هتظهر هنا، وتقدر تتابع كل نقطة من السجل.',
              icon: Icons.receipt_long_outlined,
            ),
          if (movements.isNotEmpty)
            Panel(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
              child: Column(
                children: [
                  for (final r in movements)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        (r['delta'] as num) > 0
                            ? Icons.south_west_rounded
                            : Icons.north_east_rounded,
                        color: green,
                      ),
                      title: Text(
                        '${r['sourceLabel'] ?? r['branch']?['name'] ?? 'حركة نقاط'}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      subtitle: Text(
                        shortDate(r['eventAt']),
                        style: const TextStyle(fontSize: 11),
                      ),
                      trailing: Text(
                        '${(r['delta'] as num) > 0 ? '+' : ''}${r['delta']}',
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          color: green,
                        ),
                      ),
                      onTap: () => open(context, WalletHistory(api: api)),
                    ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () => open(context, TopupHistory(api: api)),
            icon: const Icon(Icons.pending_actions_rounded),
            label: const Text('متابعة طلبات الشحن'),
          ),
        ],
      );
    },
  );
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
