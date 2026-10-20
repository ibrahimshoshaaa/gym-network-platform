import 'campaigns.dart';
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
          CampaignBanner(api:widget.api),
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
                    style: FilledButton.styleFrom(backgroundColor: lime, foregroundColor: ink,
                      minimumSize:const Size(0,46),padding:const EdgeInsets.symmetric(horizontal:10),
                      textStyle:const TextStyle(fontSize:12,fontWeight:FontWeight.w700)),
                    onPressed: widget.showQr,
                    icon: const Icon(Icons.qr_code_2_rounded, size: 20),
                    label: const Text('حجوزاتي'),
                  ),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      minimumSize:const Size(0,46),padding:const EdgeInsets.symmetric(horizontal:10),
                      textStyle:const TextStyle(fontSize:12,fontWeight:FontWeight.w700),
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
    padding:const EdgeInsets.all(16),
    child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
        Container(padding:const EdgeInsets.all(10),
          decoration:BoxDecoration(color:const Color(0xffe3fbf3),borderRadius:BorderRadius.circular(12)),
          child:const Icon(Icons.fitness_center_rounded,color:green,size:21)),
        const SizedBox(width:10),
        Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('${visit['branch']?['gym']?['name'] ?? 'زيارة جيم'}',
            style:const TextStyle(fontWeight:FontWeight.w800,fontSize:15)),
          Text('${visit['branch']?['name'] ?? visit['branchName'] ?? ''}',
            style:const TextStyle(color:muted,fontSize:12)),
        ])),
        const SizedBox(width:8),
        StatusPill(visit['status']),
      ]),
      const SizedBox(height:14),
      Wrap(spacing:14,runSpacing:8,children:[
        Text('${visit['pointsCharged']} نقطة',
          style:const TextStyle(color:green,fontWeight:FontWeight.w800,fontSize:16)),
        Text(shortDate(visit['startedAt']),style:const TextStyle(color:muted,fontSize:11)),
      ]),
      if(visit['status']=='ACTIVE')...[
        const SizedBox(height:10),
        Text('نهاية الجلسة: ${shortDate(visit['expiresAt'])}',
          style:const TextStyle(color:green,fontSize:12,fontWeight:FontWeight.w600)),
      ],
      Reference('${visit['id']}'),
    ]),
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
    header: const TraineeSectionHeader('زياراتك', subtitle: 'كل تمرينة ونقاطها، في سجل واحد.'),
    empty: 'لسه مفيش زيارات',
    emptyDetail: 'احجز موعدك من تفاصيل الجيم واعرض QR الحجز عند وصولك. الزيارة هتظهر هنا بعد تأكيد حضورك.',
    emptyAction: showQr == null
        ? null
        : ActionButton(
            'اعرض حجوزاتي',
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
  Widget build(BuildContext context) {
    final valid=qr!=null && remaining>0 && foreground;
    return ListView(
      padding:const EdgeInsets.fromLTRB(20,8,20,28),
      children:[
        const TraineeSectionHeader('رمز الدخول',subtitle:'اعرض الرمز للكاشير عند وصولك للجيم.'),
        Panel(
          padding:const EdgeInsets.all(20),
          child:Column(children:[
            const Row(mainAxisAlignment:MainAxisAlignment.center,children:[
              Icon(Icons.verified_user_outlined,size:18,color:green),
              SizedBox(width:7),
              Flexible(child:Text('رمزك الشخصي',textAlign:TextAlign.center,
                style:TextStyle(color:green,fontSize:13,fontWeight:FontWeight.w700))),
            ]),
            const SizedBox(height:20),
            LayoutBuilder(builder:(context,box){
              final size=box.maxWidth.clamp(120.0,250.0);
              return SizedBox(width:size,height:size,child:busy
                ? const Center(child:CircularProgressIndicator())
                : valid
                ? Semantics(label:'رمز دخول مؤقت؛ اعرضه للكاشير فقط',
                    child:QrImageView(data:qr!['token'],version:QrVersions.auto,
                      size:size,backgroundColor:Colors.white))
                : const Column(mainAxisAlignment:MainAxisAlignment.center,children:[
                    Icon(Icons.qr_code_2_rounded,size:100,color:muted),
                    SizedBox(height:10),
                    Text('الرمز غير متاح أو انتهت صلاحيته',textAlign:TextAlign.center,
                      style:TextStyle(fontSize:12,color:muted)),
                  ]));
            }),
            const SizedBox(height:20),
            Text(valid?'صالح لمدة $remaining ثانية':'افتح رمزًا جديدًا وقت الدخول',
              style:const TextStyle(fontSize:13,fontWeight:FontWeight.w700,color:green)),
            const SizedBox(height:12),
            ClipRRect(borderRadius:BorderRadius.circular(8),
              child:LinearProgressIndicator(value:valid?remaining/60:0,
                color:green,backgroundColor:canvas,minHeight:4)),
            const SizedBox(height:18),
            ActionButton('تحديث رمز الدخول',onPressed:load,busy:busy,icon:Icons.refresh_rounded),
          ]),
        ),
        ErrorNote(error,retry:load),
        const SizedBox(height:16),
        const PortalNote('الرمز مؤقت وبيستخدم مرة واحدة. متشاركوش مع حد خارج الجيم.',
          icon:Icons.shield_outlined),
        const SizedBox(height:12),
        const Text('نقاط الزيارة بتتراجع عند الكاشير قبل تأكيد حضورك.',
          textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:11)),
      ],
    );
  }
}
