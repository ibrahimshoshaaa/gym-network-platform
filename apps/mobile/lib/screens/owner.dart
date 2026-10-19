import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'directory.dart';
import 'topup.dart';
import 'account.dart';
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
 const OwnerHome({super.key,required this.api,required this.gym,
   required this.showBranches,required this.showMoney,required this.showOperations});
 @override State<OwnerHome> createState()=>_OwnerHomeState();
}
class _OwnerHomeState extends State<OwnerHome> {
 Json? wallet,report;
 Object? walletError,reportError;
 bool walletLoading=true,reportLoading=true;
 int generation=0;
 @override void initState(){super.initState();load();}
 Future<void> load()async{
  final current=++generation;
  setState((){walletLoading=reportLoading=true;walletError=reportError=null;});
  Future<void> part(String path,bool stock)async{
   try{
    final result=Map<String,dynamic>.from(await widget.api.request(path));
    if(mounted&&current==generation)setState((){if(stock){wallet=result;}else{report=result;}});
   }catch(e){
    if(mounted&&current==generation)setState((){
      if(stock){wallet=null;walletError=e;}else{report=null;reportError=e;}
    });
   }finally{
    if(mounted&&current==generation)setState((){if(stock){walletLoading=false;}else{reportLoading=false;}});
   }
  }
  await Future.wait([
   part('gyms/${widget.gym['id']}/point-wallet',true),
   part('reports/summary?gymId=${widget.gym['id']}&${reportRange()}',false),
  ]);
 }
 String? balance(String type){
  if(report==null)return null;
  final balances=report!['currentBalances'] as List? ?? [];
  return '${balances.cast<Map>().where((b)=>b['type']==type).firstOrNull?['balancePiasters']??'0'}';
 }
 @override Widget build(BuildContext context){
  final gym=widget.gym,active=gym['status']=='ACTIVE';
  final available=wallet?['available'];
  return RefreshIndicator(onRefresh:load,child:ListView(
   padding:const EdgeInsets.fromLTRB(20,8,20,28),
   physics:const AlwaysScrollableScrollPhysics(),
   children:[
    PortalIntro('${gym['name']}',detail:'رصيدك وتشغيل جيمك، من مكان واحد.',
     trailing:IconButton(tooltip:'الإشعارات',icon:const Icon(Icons.notifications_none_rounded),
      onPressed:()=>open(context,NotificationsScreen(api:widget.api)))),
    if(!active)...[
     const PortalNote('الجيم غير نشط حاليًا. تقدر تراجع بياناته، والتشغيل متاح بعد التفعيل.'),
     const SizedBox(height:12),
    ],
    Panel(color:ink,padding:const EdgeInsets.all(20),child:Column(
     crossAxisAlignment:CrossAxisAlignment.start,children:[
      const Text('نقاط متاحة لبيعها للمتدربين',style:TextStyle(color:Colors.white70,fontSize:12)),
      const SizedBox(height:10),
      if(walletLoading&&wallet==null)
       const Padding(padding:EdgeInsets.all(12),child:CircularProgressIndicator(color:lime))
      else if(wallet!=null)...[
       FittedBox(fit:BoxFit.scaleDown,alignment:AlignmentDirectional.centerStart,
        child:Text('$available نقطة',style:const TextStyle(color:lime,fontSize:36,height:1.2,fontWeight:FontWeight.w900))),
       const SizedBox(height:8),
       Text('إجمالي مخزون الفروع ${wallet!['total']} نقطة',
        style:const TextStyle(color:Colors.white70,fontSize:11)),
      ]else const Text('تعذر تحميل رصيد النقاط',style:TextStyle(color:Colors.white)),
      const SizedBox(height:16),
      FilledButton.icon(
       style:FilledButton.styleFrom(backgroundColor:lime,foregroundColor:ink),
       onPressed:!active||wallet==null||walletLoading||widget.api.pending!=null
        ?null:()async{
          await open(context,SendPoints(api:widget.api,gym:gym));
          if(mounted)await load();
        },
       icon:const Icon(Icons.north_west_rounded,size:20),
       label:const Text('بيع نقاط لمتدرب')),
      TextButton(onPressed:widget.showBranches,
       style:TextButton.styleFrom(foregroundColor:Colors.white70),
       child:const Text('شراء نقاط لرصيد الجيم',style:TextStyle(fontSize:12))),
     ])),
    if(walletError!=null)ErrorNote(walletError,retry:load),
    if(wallet!=null&&'${wallet!['total']}'!='${wallet!['available']}')...[
      const SizedBox(height:12),
      const PortalNote('نقاط الفروع غير المفعّلة محفوظة في الإجمالي، وغير متاحة للبيع.'),
    ],
    const SectionTitle('شغل الجيم'),
    Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),child:Column(children:[
      _ownerTask('تسجيل زيارة','امسح رمز المتدرب وأكّد حضوره',Icons.qr_code_scanner_rounded,
        active?widget.showOperations:null),
      const Divider(height:1),
      _ownerTask('الفروع والموظفين','بيانات الفروع، شراء النقاط والتعيينات',
        Icons.storefront_outlined,widget.showBranches),
      const Divider(height:1),
      _ownerTask('تقارير الجيم','راجع الزيارات وحركة النقاط',
        Icons.insights_rounded,()=>open(context,OwnerReport(api:widget.api,gymId:gym['id']))),
    ])),
    const SectionTitle('فلوس زيارات الجيم'),
    Panel(padding:const EdgeInsets.all(16),child:Column(
      crossAxisAlignment:CrossAxisAlignment.start,children:[
       if(reportLoading&&report==null)const LinearProgressIndicator(minHeight:2)
       else if(report!=null)Fact('متاح للسحب','${money(balance('GYM_AVAILABLE'))} ج.م',strong:true),
       if(reportError!=null)ErrorNote(reportError,retry:load),
       const Text('المستحقات بالجنيه منفصلة عن مخزون النقاط.',
        style:TextStyle(color:muted,fontSize:11)),
       TextButton.icon(onPressed:widget.showMoney,
        icon:const Icon(Icons.payments_outlined,size:18),
        label:const Text('مستحقاتي والسحب')),
      ])),
    if(report!=null)...[
     const SizedBox(height:12),
     Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),
      child:ExpansionTile(tilePadding:EdgeInsets.zero,title:const Text('ملخص آخر ٣٠ يوم',
        style:TextStyle(fontSize:14,fontWeight:FontWeight.w700)),
       children:[
        Fact('زيارة','${report!['visits']?['count']??'—'}'),
        Fact('نقطة مباعة','${report!['sales']?['points']??'—'}'),
        Fact('محجوز لطلبات السحب','${money(balance('GYM_RESERVED'))} ج.م'),
        Fact('محجوز للمراجعة','${money(balance('GYM_DISPUTED'))} ج.م'),
       ])),
    ],
    const SizedBox(height:12),
    TextButton.icon(onPressed:()=>open(context,DispatchHistory(api:widget.api,gymId:gym['id'])),
      icon:const Icon(Icons.history_rounded,size:18),label:const Text('سجل إرسال وشحن محفظة الجيم')),
   ],
  ));
 }
}
Widget _ownerTask(String title,String detail,IconData icon,VoidCallback? tap)=>ListTile(
 contentPadding:EdgeInsets.zero,enabled:tap!=null,
 leading:Icon(icon,color:tap==null?muted:green,size:23),
 title:Text(title,style:const TextStyle(fontSize:14,fontWeight:FontWeight.w700)),
 subtitle:Text(detail,style:const TextStyle(fontSize:11,color:muted)),
 trailing:const Icon(Icons.chevron_left_rounded,size:20,color:muted),onTap:tap,
);

class SendPoints extends StatefulWidget {
  final ApiClient api;
  final Json gym;
  const SendPoints({super.key, required this.api, required this.gym});
  @override
  State<SendPoints> createState() => _SendPointsState();
}

class _SendPointsState extends State<SendPoints> {
  final phone = TextEditingController(), points = TextEditingController();
  Json? person, quote, result;
  bool busy = false, checked = false;
  Object? error;
  String get path => 'gyms/${widget.gym['id']}/point-transfers';
  @override
  void dispose() {
    phone.dispose();
    points.dispose();
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
      if (person == null) {
        final r = await widget.api.request(
          '$path/lookup',
          method: 'POST',
          body: {'phone': phone.text},
        );
        if (mounted) setState(() => person = Map<String, dynamic>.from(r));
      } else if (quote == null) {
        final r = await widget.api.request(
          '$path/quotes',
          method: 'POST',
          body: {
            'recipientId': person!['id'],
            'gymId': widget.gym['id'],
            'points': int.tryParse(digits(points.text)),
          },
        );
        if (mounted) setState(() => quote = Map<String, dynamic>.from(r));
      } else if (checked) {
        final r = await widget.api.transact(path, {
          'recipientId': quote!['recipientId'],
          'recipientLabel': quote!['recipientLabel'],
          'gymId': widget.gym['id'],
          'points': quote!['points'],
          'pricingVersion': quote!['pricingVersion'],
          'receivedAmountPiasters': quote!['chargePiasters'],
          'fundsReceived': true,
          'recipientConfirmed': true,
          'paymentMethod': 'CASH',
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
  Widget build(BuildContext context) => Screen(
    title: 'بيع نقاط لمتدرب',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        OperationContext(title:'${widget.gym['name']}',detail:'من رصيد الجيم، بعد تأكيد التحصيل'),
        if (result != null) ...[
          const EmptyState(
            'تم إرسال النقاط',
            detail: 'اتخصمت من رصيد الجيم واتضافت لمحفظة المتدرب.',
            icon: Icons.check_circle_rounded,
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Fact('المستلم', '${result!['recipientLabel']}'),
                Fact('النقاط', '${result!['points']} نقطة', strong: true),
                Fact(
                  'المبلغ المحصّل',
                  '${money(result!['chargePiasters'])} ج.م',
                ),
                Reference('${result!['id']}'),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ActionButton('تم', onPressed: () => Navigator.pop(context, true)),
        ] else ...[
          FlowSteps(
            labels: const ['المتدرب', 'النقاط', 'التأكيد'],
            current: person == null
                ? 0
                : quote == null
                ? 1
                : 2,
          ),
          Text(
            person == null
                ? 'هتبعت لمين؟'
                : quote == null
                ? 'اتأكد من الاسم وحدد النقاط'
                : 'راجع وأكّد الإرسال',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 10),
          const Text(
            'البيع بالسعر المحدد من المنصة، بعد استلام المبلغ من المتدرب.',
            style: TextStyle(color: muted),
          ),
          const SizedBox(height: 24),
          if (person == null)
            TextField(
              controller: phone,
              enabled: !busy && widget.api.pending == null,
              keyboardType: TextInputType.phone,
              textDirection: TextDirection.ltr,
              decoration: const InputDecoration(
                labelText: 'رقم موبايل المتدرب',
                hintText: '01xxxxxxxxx',
              ),
            )
          else ...[
            Panel(
              color: const Color(0xffe6f2e9),
              child: Row(
                children: [
                  const Icon(
                    Icons.person_outline_rounded,
                    color: green,
                    size: 30,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'المستلم',
                          style: TextStyle(color: muted, fontSize: 12),
                        ),
                        Text(
                          '${person!['label']}',
                          style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 20,
                          ),
                        ),
                        Text(phone.text, textDirection: TextDirection.ltr),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (quote == null)
              TextField(
                controller: points,
                enabled: !busy && widget.api.pending == null,
                keyboardType: TextInputType.number,
                textDirection: TextDirection.ltr,
                decoration: const InputDecoration(labelText: 'عدد النقاط'),
              )
            else ...[
              Panel(
                child: Column(
                  children: [
                    Fact('النقاط', '${quote!['points']} نقطة', strong: true),
                    Fact(
                      'المطلوب تحصيله',
                      '${money(quote!['chargePiasters'])} ج.م',
                      strong: true,
                    ),
                    Fact(
                      'رصيد المستلم بعد الإرسال',
                      '${quote!['recipientAfter']} نقطة',
                    ),
                    Fact(
                      'المتبقي من رصيد جيمك',
                      '${BigInt.parse(quote!['stock']) - BigInt.from(quote!['points'])} نقطة',
                    ),
                  ],
                ),
              ),
              CheckboxListTile(
                value: checked,
                onChanged: busy || widget.api.pending != null
                    ? null
                    : (v) => setState(() => checked = v ?? false),
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'اتأكدت من اسم المتدرب واستلمت المبلغ كاملًا.',
                ),
              ),
            ],
          ],
          ErrorNote(error),
          const SizedBox(height: 12),
          ActionButton(
            quote != null
                ? 'تأكيد الإرسال'
                : person == null
                ? 'متابعة'
                : 'مراجعة الإرسال',
            onPressed: (quote == null || checked) && widget.api.pending == null
                ? advance
                : null,
            busy: busy,
            icon: Icons.arrow_back_rounded,
          ),
          if (widget.api.pending != null)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'العملية محفوظة. ارجع للرئيسية واضغط «إعادة نفس العملية» للتحقق من النتيجة بأمان.',
                style: TextStyle(color: muted),
              ),
            ),
          if (person != null && widget.api.pending == null)
            TextButton(
              onPressed: busy
                  ? null
                  : () => setState(() {
                      if (quote != null) {
                        quote = null;
                      } else {
                        person = null;
                      }
                      checked = false;
                      error = null;
                    }),
              child: const Text('تعديل البيانات'),
            ),
        ],
      ],
    ),
  );
}

class DispatchHistory extends StatelessWidget {
  final ApiClient api;
  final String gymId;
  const DispatchHistory({super.key, required this.api, required this.gymId});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'حركة محفظة الجيم',
    child: PagedRecords(
      api: api,
      path: 'gyms/$gymId/point-transfers',
      item: (r) => Panel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              r['kind'] == 'GYM_SALE' ? 'بيع نقاط لمتدرب' : 'شحن من المنصة',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            Fact('النقاط', '${r['points']} نقطة'),
            Fact('المستلم', '${r['recipientLabel']}'),
            Fact('التحصيل', '${money(r['chargePiasters'])} ج.م'),
            Text(
              shortDate(r['createdAt']),
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            Reference('${r['id']}'),
          ],
        ),
      ),
    ),
  );
}

class BranchesScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  const BranchesScreen({super.key, required this.api, required this.gym});
  @override
  Widget build(BuildContext context) => DataView(
    load: () => api.request('gyms/${gym['id']}/branches?limit=100'),
    builder: (d, reload) => ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'فروع ${gym['name']}',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            IconButton.filled(
              tooltip: 'إضافة فرع',
              onPressed: () async {
                await open(context, BranchForm(api: api, gymId: gym['id']));
                await reload();
              },
              icon: const Icon(Icons.add_rounded),
            ),
          ],
        ),
        const SizedBox(height: 10),
        const Text(
          'حدد مكان الفرع على الخريطة واقترح نقاط الزيارة ومدتها. الإدارة هتراجعهم قبل التفعيل.',
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: 22),
        if (rows(d).isEmpty)
          const EmptyState(
            'ضيف أول فرع ليك',
            detail: 'اضغط + وكمّل بيانات الفرع والموقع.',
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
                        child: Text(
                          '${b['name']}',
                          style: Theme.of(context).textTheme.titleLarge,
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
                    'الزيارة',
                    '${b['visitPricePoints']} نقطة · ${b['sessionMinutes']} دقيقة',
                  ),
                  Fact(
                    'رصيد الفرع',
                    '${(b['pointAccounts'] as List? ?? []).firstOrNull?['balance'] ?? 0} نقطة',
                  ),
                  if (b['priceApprovedAt'] == null)
                    const Text(
                      'الموقع وسعر الزيارة بانتظار اعتماد الإدارة.',
                      style: TextStyle(color: green, fontSize: 12),
                    ),
                  Wrap(
                    spacing: 8,
                    children: [
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
                                      'canSell': true,
                                      'canCancel': true,
                                    },
                                  ),
                                );
                                await reload();
                              },
                        icon: const Icon(
                          Icons.qr_code_scanner_rounded,
                          size: 18,
                        ),
                        label: const Text('تشغيل الفرع'),
                      ),
                      TextButton.icon(
                        onPressed: b['status'] != 'ACTIVE' || gym['status'] != 'ACTIVE'
                            ? null
                            : () async {
                                await open(
                                  context,
                                  TopupScreen(api: api, branchId: b['id']),
                                );
                                await reload();
                              },
                        icon: const Icon(Icons.add_card_rounded, size: 18),
                        label: const Text('شراء نقاط'),
                      ),
                      SizedBox(width:double.infinity,child:ExpansionTile(
                        tilePadding:EdgeInsets.zero,
                        title:const Text('إدارة الفرع',style:TextStyle(fontSize:13,fontWeight:FontWeight.w700)),
                        children:[Wrap(spacing:8,runSpacing:4,children:[
                      TextButton(
                        onPressed: () async {
                          await open(
                            context,
                            BranchForm(api: api, gymId: gym['id'], branch: b),
                          );
                          await reload();
                        },
                        child: const Text('تعديل البيانات'),
                      ),
                      TextButton(
                        onPressed: () => open(
                          context,
                          StaffScreen(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: const Text('الموظفين'),
                      ),
                      TextButton(
                        onPressed: () => open(
                          context,
                          OwnerReport(api: api, gymId: gym['id'], branch: b),
                        ),
                        child: const Text('الحركة'),
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
    ),
  );
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
      setState(() => error = Exception('حدد مكان الفرع على الخريطة أولًا.'));
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
  Widget build(BuildContext context) => Screen(
    title: widget.branch == null ? 'فرع جديد' : 'تعديل الفرع',
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
                    'name': 'اسم الفرع',
                    'address': 'العنوان بالتفصيل',
                    'governorate': 'المحافظة',
                    'city': 'المدينة',
                    'contactPhone': 'رقم تواصل الفرع · اختياري',
                    'openingHours': 'مواعيد العمل · اختياري',
                    'visitPricePoints': 'نقاط الزيارة المقترحة',
                    'sessionMinutes': 'مدة الجلسة بالدقائق',
                  }[e.key],
                ),
                validator: (v) =>
                    !['contactPhone', 'openingHours'].contains(e.key) &&
                        (v ?? '').trim().isEmpty
                    ? 'كمّل الحقل ده'
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
                  ? 'حدد المكان على الخريطة'
                  : 'المكان متحدد · تعديل الموقع',
            ),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            widget.branch == null ? 'إرسال الفرع للمراجعة' : 'حفظ بيانات الفرع',
            busy: busy,
            onPressed: save,
          ),
        ],
      ),
    ),
  );
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
  Widget build(BuildContext context) => Screen(
    title: 'موظفين ${widget.branch['name']}',
    child: PagedRecords(
      key: ValueKey(version),
      api: widget.api,
      path: 'gyms/${widget.gymId}/staff?branchId=${widget.branch['id']}',
      empty: 'الفرع لسه من غير موظفين',
      emptyDetail:
          'ادعُ مدير فرع أو كاشير. كل موظف يدخل بحسابه بعد قبول الدعوة.',
      header: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const PortalIntro(
            'فريق الفرع',
            detail: 'الصلاحية مرتبطة بالفرع. إيقاف تعيين الموظف هنا لا يوقف حسابه أو تعييناته في فروع أخرى.',
          ),
          ActionButton(
            'دعوة موظف',
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
  );
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
      builder: (c) => AlertDialog(
        title: Text(desired ? 'تفعيل تعيين الموظف؟' : 'إيقاف تعيين الموظف؟'),
        content: Text(
          '${widget.assignment['user']?['displayName']}\nالتغيير يخص صلاحية الموظف على الفرع ده فقط.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: const Text('رجوع'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text(desired ? 'تفعيل' : 'إيقاف'),
          ),
        ],
      ),
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
                      manager ? 'مدير فرع' : 'كاشير',
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
                ? 'تسجيل الزيارات، شحن المتدربين وإلغاء الزيارة خلال ١٠ دقائق.'
                : 'تسجيل الزيارات وشحن المتدربين. الإلغاء يحتاج طلب مراجعة.',
            style: const TextStyle(color: muted, fontSize: 12),
          ),
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
              active ? 'إيقاف التعيين على الفرع' : 'تفعيل التعيين على الفرع',
            ),
          ),
        ],
      ),
    );
  }
}

class InviteStaff extends StatefulWidget {
  final ApiClient api;
  final String gymId, branchId;
  const InviteStaff({
    super.key,
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
  Widget build(BuildContext context) => Screen(
    title: 'دعوة موظف',
    child: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        if (result == null) ...[
          for (final field in [
            (name, 'اسم الموظف'),
            (email, 'الإيميل'),
            (phone, 'رقم الموبايل'),
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
            decoration: const InputDecoration(labelText: 'الدور'),
            items: const [
              DropdownMenuItem(value: 'CASHIER', child: Text('كاشير')),
              DropdownMenuItem(
                value: 'BRANCH_MANAGER',
                child: Text('مدير فرع'),
              ),
            ],
            onChanged: busy ? null : (v) => setState(() => role = v!),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            'إنشاء الدعوة',
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
          const EmptyState(
            'الدعوة جاهزة',
            detail: 'شارك الرابط مع الموظف ليختار كلمة السر ويقبل الدعوة. الرابط مؤقت وسري.',
            icon: Icons.mark_email_read_outlined,
          ),
          const SizedBox(height: 18),
          SelectableText(
            'https://gym-network-platform.vercel.app/#invite=${result!['token']}',
            textDirection: TextDirection.ltr,
          ),
        ],
      ],
    ),
  );
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
  Widget build(BuildContext context) => DefaultTabController(
    length: 2,
    child: Scaffold(
      appBar: AppBar(
        title: Text(branch == null ? 'حركة الجيم' : 'حركة ${branch!['name']}'),
        bottom: const TabBar(
          tabs: [
            Tab(text: 'الزيارات'),
            Tab(text: 'المبيعات'),
          ],
        ),
      ),
      body: TabBarView(
        children: [
          for (final kind in ['VISITS', 'SALES'])
            PagedRecords(
              api: api,
              path:
                  'reports/rows?gymId=$gymId&${reportRange()}&kind=$kind${branch == null ? '' : '&branchId=${branch!['id']}'}',
              item: (r) => Panel(
                child: Column(
                  children: [
                    Fact(
                      r['branchName'] ?? 'محفظة الجيم',
                      '${r['points']} نقطة',
                      strong: true,
                    ),
                    Fact('القيمة', '${money(r['amountPiasters'])} ج.م'),
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
  );
}
