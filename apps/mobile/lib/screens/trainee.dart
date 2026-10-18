import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../core/api.dart';
import '../core/ui.dart';
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
    ]),
    builder: (data, reload) {
      final w = data[0], visits = rows(data[1]);
      return ListView(
        padding: const EdgeInsets.fromLTRB(22, 14, 22, 30),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'يوم جديد، تمرين جديد',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                    Text(
                      'أهلًا ${api.user!['displayName'].toString().split(' ').first}',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'الإشعارات',
                onPressed: () => open(context, NotificationsScreen(api: api)),
                icon: const Icon(Icons.notifications_none_rounded),
              ),
            ],
          ),
          const SizedBox(height: 24),
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
                    Spacer(),
                    Icon(Icons.hub_rounded, color: Colors.white24),
                  ],
                ),
                const SizedBox(height: 14),
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.center,
                  spacing: 10,
                  children: [
                    Text(
                      '${w['spendablePoints']}',
                      style: const TextStyle(
                        fontSize: 54,
                        height: 1.1,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    const Text(
                      'نقطة',
                      style: TextStyle(color: lime, fontSize: 17),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  w['expiresAt'] != null
                      ? 'صلاحية الرصيد حتى ${shortDate(w['expiresAt']).split(' · ').first}'
                      : 'اشحن رصيدك وابدأ تمرينك',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
                const SizedBox(height: 22),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: lime,
                    foregroundColor: ink,
                  ),
                  onPressed: () async {
                    await open(context, TopupScreen(api: api));
                    await reload();
                  },
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_rounded),
                      SizedBox(width: 8),
                      Text('اشحن رصيدك'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (w['unavailablePoints'] != 0)
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Panel(
                child: Text(
                  '${w['unavailablePoints']} نقطة غير متاحة حاليًا. راجع الإدارة لتسوية صلاحية الرصيد.',
                ),
              ),
            ),
          const SectionTitle('جاهز تتمرن؟'),
          Row(
            children: [
              Expanded(
                child: _Quick(
                  'رمز الدخول',
                  'افتح الـQR',
                  Icons.qr_code_2_rounded,
                  showQr,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _Quick(
                  'جيم قريب',
                  'اكتشف الفروع',
                  Icons.near_me_outlined,
                  showGyms,
                ),
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
            'حركة نقاطك',
            trailing: TextButton(
              onPressed: () => open(context, WalletHistory(api: api)),
              child: const Text('عرض الكل'),
            ),
          ),
          Panel(
            child: ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.receipt_long_rounded, color: green),
              title: const Text('شحنك وزياراتك في مكان واحد'),
              subtitle: const Text('تابع كل نقطة اتضافت أو اتخصمت'),
              trailing: const Icon(Icons.chevron_left_rounded),
              onTap: () => open(context, WalletHistory(api: api)),
            ),
          ),
          const SizedBox(height: 12),
          TextButton.icon(
            onPressed: () => open(context, TopupHistory(api: api)),
            icon: const Icon(Icons.pending_actions_rounded),
            label: const Text('متابعة طلبات الشحن'),
          ),
        ],
      );
    },
  );
}

class _Quick extends StatelessWidget {
  final String title, sub;
  final IconData icon;
  final VoidCallback tap;
  const _Quick(this.title, this.sub, this.icon, this.tap);
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(24),
    child: InkWell(
      onTap: tap,
      borderRadius: BorderRadius.circular(24),
      child: Padding(
        padding: const EdgeInsets.all(19),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xffeaf1df),
                borderRadius: BorderRadius.circular(15),
              ),
              child: Icon(icon, color: green),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
            ),
            Text(sub, style: const TextStyle(color: muted, fontSize: 11)),
          ],
        ),
      ),
    ),
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
  const VisitsScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) => PagedRecords(
    api: api,
    path: 'trainee/visits',
    empty: 'أول زيارة ليك لسه جاية',
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
