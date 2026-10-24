import 'account_deletion.dart';
import 'campaigns.dart';
import 'maintenance.dart';
import 'promotions.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'topup.dart';

class AccountScreen extends StatefulWidget {
  final ApiClient api;
  final bool workplace, ownerView;
  const AccountScreen({
    super.key,
    required this.api,
    this.workplace = false,
    this.ownerView = false,
  });
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  bool canPromote = false;
  @override void initState(){super.initState();if(widget.workplace&&!widget.ownerView)loadPromotions();}
  Future<void> loadPromotions()async{try{final r=await widget.api.request('promotions/branches');if(mounted)setState(()=>canPromote=rows(r).isNotEmpty);}catch(_) {}}
  bool busy = false;
  Object? error;
  Future<void> logout() async {
    if(busy)return;
    setState((){busy=true;error=null;});
    try { await widget.api.logout(); }
    catch(e){if(mounted)setState(()=>error=e);}
    finally {if(mounted)setState(()=>busy=false);}
  }

  Widget traineeAccount(BuildContext context) {
    final user=widget.api.user!;
    final name='${user['displayName']}';
    return ListView(padding:const EdgeInsets.fromLTRB(20,8,20,28),children:[
      const TraineeSectionHeader('حسابك',subtitle:'بياناتك ونشاطك، في مكان واحد.'),
      Panel(color:ink,padding:const EdgeInsets.all(20),child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[
            CircleAvatar(radius:25,backgroundColor:lime,
              child:Text(name.trim().isEmpty?'؟':name.characters.first,
                style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800,color:ink))),
            const SizedBox(width:12),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(name,style:const TextStyle(color:Colors.white,fontSize:18,fontWeight:FontWeight.w800)),
              const SizedBox(height:4),
              const Text('حساب المتدرب',style:TextStyle(color:lime,fontSize:11)),
            ])),
          ]),
          const SizedBox(height:16),
          if ('${user['email'] ?? ''}'.trim().isNotEmpty) Text('${user['email']}',textDirection:TextDirection.ltr,
            style:const TextStyle(color:Colors.white70,fontSize:12)),
          const SizedBox(height:4),
          if ('${user['phone'] ?? ''}'.trim().isNotEmpty) Text('${user['phone']}',textDirection:TextDirection.ltr,
            style:const TextStyle(color:Colors.white70,fontSize:12)),
        ])),
      const SectionTitle('بياناتك والأمان'),
      Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),child:Column(children:[
        _item('تعديل الاسم',Icons.person_outline_rounded,()async{
          await open(context,ProfileEdit(api:widget.api));
          if(mounted)setState((){});
        }),
        const Divider(height:1),
        _item('كلمة السر والأمان',Icons.lock_outline_rounded,
          ()=>open(context,PasswordScreen(api:widget.api))),
      ])),
      const SectionTitle('نشاطك والمساعدة'),
      Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),child:Column(children:[
        _item('طلبات الشحن',Icons.receipt_long_rounded,
          ()=>open(context,TopupHistory(api:widget.api))),
        const Divider(height:1),
        _item('الإشعارات',Icons.notifications_none_rounded,
          ()=>open(context,NotificationsScreen(api:widget.api))),
        const Divider(height:1),
        _item('الدعم والمساعدة',Icons.support_agent_rounded,
          ()=>open(context,SupportScreen(api:widget.api))),
      ])),
      ErrorNote(error),
      const SizedBox(height:20),
      _deleteAccountButton(context),
      const SizedBox(height: 8),
      OutlinedButton.icon(onPressed:busy?null:logout,
        icon:busy?const SizedBox(width:18,height:18,child:CircularProgressIndicator(strokeWidth:2))
          :const Icon(Icons.logout_rounded,size:19),
        label:Text(busy?'جاري تسجيل الخروج…':'تسجيل الخروج'),
        style:OutlinedButton.styleFrom(foregroundColor:const Color(0xffa33740),
          minimumSize:const Size(double.infinity,48))),
      const SizedBox(height:18),
      const Text('GYMBANK · 0.2.7\nShoTech Solutions',
        textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:10)),
    ]);
  }

  @override
  Widget build(BuildContext context) => !widget.workplace
    ? traineeAccount(context) : workAccount(context);

  Widget _deleteAccountButton(BuildContext context) => TextButton.icon(
    key: const Key('account.delete'),
    onPressed: busy ? null : () => open(context, AccountDeletionScreen(api: widget.api)),
    icon: const Icon(Icons.delete_forever_outlined),
    label: const Text('حذف حسابي'),
    style: TextButton.styleFrom(foregroundColor: const Color(0xffba1a1a),
      minimumSize: const Size(double.infinity, 48)),
  );

  Widget workAccount(BuildContext context) => ListView(
    padding: const EdgeInsets.all(22),
    children: [
      const PortalIntro(
        'حسابك',
        detail: 'بياناتك والأمان والدعم في مكان واحد.',
      ),
      Panel(
        child: Column(
          children: [
            CircleAvatar(
              radius: 32,
              backgroundColor: lime,
              child: Text(
                widget.api.user!['displayName'].toString().characters.first,
                style: const TextStyle(
                  fontSize: 29,
                  fontWeight: FontWeight.w900,
                  color: ink,
                ),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              widget.ownerView
                  ? 'صاحب جيم'
                  : widget.workplace && widget.api.user!['role'] == 'TRAINEE'
                  ? 'موظف جيم'
                  : {
                          'TRAINEE': 'متدرب',
                          'GYM_OWNER': 'صاحب جيم',
                          'BRANCH_MANAGER': 'مدير فرع',
                          'CASHIER': 'كاشير',
                        }[widget.api.user!['role']] ??
                        'حساب GymBank',
              style: const TextStyle(color: green, fontWeight: FontWeight.w700),
            ),
            Text(
              '${widget.api.user!['displayName']}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            if ('${widget.api.user!['email'] ?? ''}'.trim().isNotEmpty) Text(
              '${widget.api.user!['email']}',
              textDirection: TextDirection.ltr,
              style: const TextStyle(color: muted, fontSize: 12),
            ),
            if ('${widget.api.user!['phone'] ?? ''}'.trim().isNotEmpty) Text(
              '${widget.api.user!['phone']}',
              textDirection: TextDirection.ltr,
              style: const TextStyle(color: muted, fontSize: 12),
            ),
          ],
        ),
      ),
      const SizedBox(height: 18),
      Panel(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 6),
        child: Column(
          children: [
            if(widget.ownerView||canPromote)_item('إعلانات الفروع', Icons.campaign_outlined, () => open(context, PromotionsScreen(api: widget.api))),
            _item('الصيانة', Icons.build_outlined, () => open(context, MaintenanceScreen(api: widget.api))),
                _item(
              'تعديل الاسم',
              Icons.person_outline_rounded,
              () => open(context, ProfileEdit(api: widget.api)),
            ),
            _item(
              'كلمة السر والأمان',
              Icons.lock_outline_rounded,
              () => open(context, PasswordScreen(api: widget.api)),
            ),
            if (!widget.workplace || widget.ownerView)
              _item(
                'طلبات الشحن',
                Icons.receipt_long_rounded,
                () => open(context, TopupHistory(api: widget.api)),
              ),
            _item(
              'الإشعارات',
              Icons.notifications_none_rounded,
              () => open(context, NotificationsScreen(api: widget.api)),
            ),
            _item(
              'الدعم والمساعدة',
              Icons.support_agent_rounded,
              () => open(context, SupportScreen(api: widget.api)),
            ),
          ],
        ),
      ),
      ErrorNote(error),
      const SizedBox(height: 22),
      _deleteAccountButton(context),
      const SizedBox(height: 8),
      ActionButton(
        'تسجيل الخروج',
        icon: Icons.logout_rounded,
        busy: busy,
        onPressed: () async {
          if (busy) return;
          setState(() => busy = true);
          try {
            await widget.api.logout();
          } catch (e) {
            if (mounted) setState(() => error = e);
          } finally {
            if (mounted) setState(() => busy = false);
          }
        },
      ),
      const SizedBox(height: 26),
      const Text(
        'GYMBANK\nنسخة 0.2.7 · ShoTech Solutions',
        textAlign: TextAlign.center,
        style: TextStyle(color: muted, fontSize: 11),
      ),
    ],
  );
}

Widget _item(String text, IconData icon, VoidCallback tap) => ListTile(
  contentPadding: EdgeInsets.zero,
  leading: Icon(icon, color: green, size: 23),
  title: Text(
    text,
    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
  ),
  trailing: const Icon(Icons.chevron_left_rounded, size: 21, color: muted),
  onTap: tap,
);

class ProfileEdit extends StatefulWidget {
  final ApiClient api;
  const ProfileEdit({super.key, required this.api});
  @override
  State<ProfileEdit> createState() => _ProfileEditState();
}

class _ProfileEditState extends State<ProfileEdit> {
  late final name = TextEditingController(
    text: '${widget.api.user!['displayName']}',
  );
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'تعديل اسمك',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        TextField(
          controller: name,
          enabled: !busy,
          decoration: const InputDecoration(labelText: 'الاسم بالكامل'),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          'حفظ التعديل',
          busy: busy,
          onPressed: () async {
            if (busy) return;
            setState(() => busy = true);
            try {
              await widget.api.request(
                'me/profile',
                method: 'PATCH',
                body: {'displayName': name.text},
              );
              widget.api.user!['displayName'] = name.text.trim();
              if (context.mounted) Navigator.pop(context);
            } catch (e) {
              if (mounted) setState(() => error = e);
            } finally {
              if (mounted) setState(() => busy = false);
            }
          },
        ),
      ],
    ),
  );
}

class PasswordScreen extends StatefulWidget {
  final ApiClient api;
  const PasswordScreen({super.key, required this.api});
  @override
  State<PasswordScreen> createState() => _PasswordScreenState();
}

class _PasswordScreenState extends State<PasswordScreen> {
  final old = TextEditingController(), next = TextEditingController();
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    old.dispose();
    next.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'تغيير كلمة السر',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'اختار جملة سرية 15 حرفًا على الأقل. تغييرها بينهي جلساتك القديمة.',
        ),
        const SizedBox(height: 22),
        TextField(
          controller: old,
          enabled: !busy,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'كلمة السر الحالية'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: next,
          enabled: !busy,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'كلمة السر الجديدة'),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          'حفظ كلمة السر',
          busy: busy,
          onPressed: () async {
            if (busy) return;
            setState(() => busy = true);
            try {
              await widget.api.authenticate('auth/password/change', {
                'currentPassword': old.text,
                'newPassword': next.text,
              });
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('تم تغيير كلمة السر وتأمين حسابك'),
                  ),
                );
                Navigator.pop(context);
              }
            } catch (e) {
              if (mounted) setState(() => error = e);
            } finally {
              if (mounted) setState(() => busy = false);
            }
          },
        ),
      ],
    ),
  );
}

class NotificationsScreen extends StatelessWidget {
  final ApiClient api;
  const NotificationsScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'الإشعارات',
    child: DataView(
      load: () => api.request('notifications'),
      builder: (d, reload) {
        final items = rows(d);
        return ListView(
          padding: const EdgeInsets.all(22),
          children: [
            const Text(
              'تنبيهات حسابك داخل التطبيق',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 14),
            if (items.isEmpty)
              const EmptyState(
                'كله هادي دلوقتي',
                icon: Icons.notifications_none_rounded,
              ),
            ...items.map(
              (n) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Panel(
                  color: n['read'] == true
                      ? Colors.white
                      : const Color(0xffeaf3df),
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    onTap:n['destination']==null?null:()async{await openCampaign(context,api,'${n['destination']}');},
                    title: Text(
                      '${n['title']}',
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      '${n['description']}\n${shortDate(n['at'])}',
                    ),
                    trailing: n['read'] == true
                        ? null
                        : IconButton(
                            tooltip: 'تحديد كمقروء',
                            onPressed: () async {
                              await api.request(
                                'notifications/read',
                                method: 'POST',
                                body: {
                                  'ids': [n['id']],
                                },
                              );
                              await reload();
                            },
                            icon: const Icon(Icons.done_rounded, color: green),
                          ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    ),
  );
}

class SupportScreen extends StatelessWidget {
  final ApiClient api;
  const SupportScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) => Screen(
    title: 'الدعم والمساعدة',
    child: DataView(
      load: () => Future.wait([
        api.request('support/tickets?limit=50'),
        api.request('support/contact'),
      ]),
      builder: (d, reload) => ListView(
        padding: const EdgeInsets.all(22),
        children: [
          const EmptyState(
            'إحنا معاك',
            detail: 'اسأل عن حسابك أو الشحن أو الزيارات. فريق الإدارة هيرد عليك هنا.',
            icon: Icons.support_agent_rounded,
          ),
          const SizedBox(height: 20),
          ActionButton(
            'طلب مساعدة جديد',
            onPressed: () async {
              await open(context, NewTicket(api: api));
              await reload();
            },
            icon: Icons.add_comment_outlined,
          ),
          if (d[1]['whatsapp'] != null)
            TextButton.icon(
              onPressed: () => launchUrl(
                Uri.https(
                  'wa.me',
                  '/${d[1]['whatsapp'].toString().replaceAll('+', '')}',
                ),
                mode: LaunchMode.externalApplication,
              ),
              icon: const Icon(Icons.chat_outlined),
              label: const Text('تواصل على واتساب'),
            ),
          const SectionTitle('طلباتك'),
          ...rows(d[0]).map(
            (t) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Panel(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('${t['subject']}'),
                  subtitle: Text(statusName(t['status'])),
                  trailing: const Icon(Icons.chevron_left_rounded),
                  onTap: () => open(context, TicketChat(api: api, id: t['id'])),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class NewTicket extends StatefulWidget {
  final ApiClient api;
  const NewTicket({super.key, required this.api});
  @override
  State<NewTicket> createState() => _NewTicketState();
}

class _NewTicketState extends State<NewTicket> {
  final subject = TextEditingController(), body = TextEditingController();
  final key = newKey();
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    subject.dispose();
    body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'طلب مساعدة',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        TextField(
          controller: subject,
          enabled: !busy,
          maxLength: 150,
          decoration: const InputDecoration(labelText: 'عنوان مختصر'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: body,
          enabled: !busy,
          minLines: 4,
          maxLines: 8,
          maxLength: 3000,
          decoration: const InputDecoration(labelText: 'اشرح المشكلة'),
        ),
        ErrorNote(error),
        const SizedBox(height: 18),
        ActionButton(
          'إرسال الطلب',
          busy: busy,
          onPressed: () async {
            if (busy) return;
            setState(() => busy = true);
            try {
              final r = await widget.api.request(
                'support/tickets',
                method: 'POST',
                body: {
                  'subject': subject.text,
                  'body': body.text,
                  'category': 'HELP',
                  'clientKey': key,
                },
              );
              if (context.mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => TicketChat(api: widget.api, id: r['id']),
                  ),
                );
              }
            } catch (e) {
              if (mounted) setState(() => error = e);
            } finally {
              if (mounted) setState(() => busy = false);
            }
          },
        ),
      ],
    ),
  );
}

class TicketChat extends StatefulWidget {
  final ApiClient api;
  final String id;
  const TicketChat({super.key, required this.api, required this.id});
  @override
  State<TicketChat> createState() => _TicketChatState();
}

class _TicketChatState extends State<TicketChat> {
  final reply = TextEditingController();
  String key = newKey();
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    reply.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'متابعة طلب المساعدة',
    child: DataView(
      load: () => widget.api.request('support/tickets/${widget.id}'),
      builder: (d, reload) => ListView(
        padding: const EdgeInsets.all(22),
        children: [
          Text(
            '${d['ticket']['subject']}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          StatusPill(d['ticket']['status']),
          const SizedBox(height: 18),
          for (final m in rows(d))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Panel(
                color: m['authorId'] == widget.api.user!['id']
                    ? const Color(0xffe5f1df)
                    : Colors.white,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${m['author']['displayName']}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text('${m['body']}'),
                    Text(
                      shortDate(m['createdAt']),
                      style: const TextStyle(color: muted, fontSize: 10),
                    ),
                  ],
                ),
              ),
            ),
          if (d['nextCursor'] != null)
            const Text(
              'المعروض آخر 50 رسالة. تواصل مع الإدارة لو محتاج تفاصيل أقدم.',
              style: TextStyle(color: muted, fontSize: 11),
            ),
          if (d['ticket']['status'] != 'CLOSED') ...[
            const SizedBox(height: 12),
            TextField(
              controller: reply,
              enabled: !busy,
              minLines: 2,
              maxLines: 5,
              maxLength: 3000,
              decoration: const InputDecoration(labelText: 'اكتب ردك'),
            ),
            ErrorNote(error),
            ActionButton(
              'إرسال الرد',
              busy: busy,
              onPressed: () async {
                if (busy) return;
                setState(() => busy = true);
                try {
                  await widget.api.request(
                    'support/tickets/${widget.id}/messages',
                    method: 'POST',
                    body: {'body': reply.text, 'clientKey': key},
                  );
                  reply.clear();
                  key = newKey();
                  await reload();
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
    ),
  );
}
