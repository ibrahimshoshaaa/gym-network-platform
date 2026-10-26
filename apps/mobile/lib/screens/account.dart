import '../l10n/language.dart';
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
      TraineeSectionHeader(appText('s0'),subtitle:appText('s966')),
      Panel(color:ink,padding:const EdgeInsets.all(20),child:Column(
        crossAxisAlignment:CrossAxisAlignment.start,children:[
          Row(children:[
            CircleAvatar(radius:25,backgroundColor:lime,
              child:Text(name.trim().isEmpty?appText('s963'):name.characters.first,
                style:const TextStyle(fontSize:23,fontWeight:FontWeight.w800,color:ink))),
            const SizedBox(width:12),
            Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
              Text(name,style:const TextStyle(color:Colors.white,fontSize:18,fontWeight:FontWeight.w800)),
              const SizedBox(height:4),
              Text(appText('s15'),style:TextStyle(color:lime,fontSize:11)),
            ])),
          ]),
          const SizedBox(height:16),
          if ('${user['email'] ?? ''}'.trim().isNotEmpty) Text('${user['email']}',textDirection:TextDirection.ltr,
            style:const TextStyle(color:Colors.white70,fontSize:12)),
          const SizedBox(height:4),
          if ('${user['phone'] ?? ''}'.trim().isNotEmpty) Text('${user['phone']}',textDirection:TextDirection.ltr,
            style:const TextStyle(color:Colors.white70,fontSize:12)),
        ])),
      SectionTitle(appText('s967')),
      Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),child:Column(children:[
        _item(appText('s968'),Icons.person_outline_rounded,()async{
          await open(context,ProfileEdit(api:widget.api));
          if(mounted)setState((){});
        }),
        const Divider(height:1),
        _item(appText('s969'),Icons.lock_outline_rounded,
          ()=>open(context,PasswordScreen(api:widget.api))),
      ])),
      SectionTitle(appText('s970')),
      Panel(padding:const EdgeInsets.symmetric(horizontal:16,vertical:4),child:Column(children:[
        _item(appText('s162'),Icons.receipt_long_rounded,
          ()=>open(context,TopupHistory(api:widget.api))),
        const Divider(height:1),
        _item(appText('s368'),Icons.notifications_none_rounded,
          ()=>open(context,NotificationsScreen(api:widget.api))),
        const Divider(height:1),
        _item(appText('s971'),Icons.support_agent_rounded,
          ()=>open(context,SupportScreen(api:widget.api))),
      ])),
      ErrorNote(error),
      const SizedBox(height:20),
      _deleteAccountButton(context),
      const SizedBox(height: 8),
      const LanguageSelector(),
      _logoutButton(),
      const SizedBox(height:18),
      const Text('GYMBANK · 0.2.7\nShoTech Solutions',
        textAlign:TextAlign.center,style:TextStyle(color:muted,fontSize:10)),
    ]);
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  !widget.workplace
    ? traineeAccount(context) : workAccount(context); }

  Widget _deleteAccountButton(BuildContext context) => OutlinedButton.icon(
    key: const Key('account.delete'),
    onPressed: busy ? null : () => open(context, AccountDeletionScreen(api: widget.api)),
    icon: const Icon(Icons.delete_forever_outlined),
    label: Text(appText('s322')),
    style: OutlinedButton.styleFrom(foregroundColor: const Color(0xffba1a1a),
      side: const BorderSide(color: Color(0xffba1a1a)),
      minimumSize: const Size(double.infinity, 48)),
  );

  Widget _logoutButton() => OutlinedButton.icon(
    onPressed: busy ? null : logout,
    icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
      : const Icon(Icons.logout_rounded, size: 19),
    label: Text(busy ? appText('s972') : appText('s5')),
    style: OutlinedButton.styleFrom(foregroundColor: const Color(0xffa33740),
      minimumSize: const Size(double.infinity, 48)),
  );

  Widget workAccount(BuildContext context) => ListView(
    padding: const EdgeInsets.all(22),
    children: [
      PortalIntro(
        appText('s0'),
        detail: appText('s973'),
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
                  ? appText('s288')
                  : widget.workplace && widget.api.user!['role'] == 'TRAINEE'
                  ? appText('s974')
                  : {
                          'TRAINEE': appText('s289'),
                          'GYM_OWNER': appText('s288'),
                          'BRANCH_MANAGER': appText('s778'),
                          'CASHIER': appText('s779'),
                        }[widget.api.user!['role']] ??
                        appText('s975'),
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
            if(widget.ownerView||canPromote)_item(appText('s449'), Icons.campaign_outlined, () => open(context, PromotionsScreen(api: widget.api))),
            _item(appText('s681'), Icons.build_outlined, () => open(context, MaintenanceScreen(api: widget.api))),
                _item(
              appText('s968'),
              Icons.person_outline_rounded,
              () => open(context, ProfileEdit(api: widget.api)),
            ),
            _item(
              appText('s969'),
              Icons.lock_outline_rounded,
              () => open(context, PasswordScreen(api: widget.api)),
            ),
            if (!widget.workplace)
              _item(
                appText('s162'),
                Icons.receipt_long_rounded,
                () => open(context, TopupHistory(api: widget.api)),
              ),
            _item(
              appText('s368'),
              Icons.notifications_none_rounded,
              () => open(context, NotificationsScreen(api: widget.api)),
            ),
            _item(
              appText('s971'),
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
      const LanguageSelector(),
      _logoutButton(),
      const SizedBox(height: 26),
      Text(
        appText('s976'),
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s977'),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        TextField(
          controller: name,
          enabled: !busy,
          decoration: InputDecoration(labelText: appText('s292')),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          appText('s978'),
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
  ); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s979'),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          appText('s980'),
        ),
        const SizedBox(height: 22),
        TextField(
          controller: old,
          enabled: !busy,
          obscureText: true,
          decoration: InputDecoration(labelText: appText('s981')),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: next,
          enabled: !busy,
          obscureText: true,
          decoration: InputDecoration(labelText: appText('s956')),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          appText('s960'),
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
                  SnackBar(
                    content: Text(appText('s982')),
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
  ); }
}

class NotificationsScreen extends StatelessWidget {
  final ApiClient api;
  const NotificationsScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s368'),
    child: DataView(
      load: () => api.request('notifications'),
      builder: (d, reload) {
        final items = rows(d);
        return ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Text(
              appText('s983'),
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 14),
            if (items.isEmpty)
              EmptyState(
                appText('s984'),
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
                            tooltip: appText('s985'),
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
  ); }
}

class SupportScreen extends StatelessWidget {
  final ApiClient api;
  const SupportScreen({super.key, required this.api});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s971'),
    child: DataView(
      load: () => Future.wait([
        api.request('support/tickets?limit=50'),
        api.request('support/contact'),
      ]),
      builder: (d, reload) { return  ListView(
        padding: const EdgeInsets.all(22),
        children: [
          EmptyState(
            appText('s986'),
            detail: appText('s987'),
            icon: Icons.support_agent_rounded,
          ),
          const SizedBox(height: 20),
          ActionButton(
            appText('s988'),
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
              label: Text(appText('s989')),
            ),
          SectionTitle(appText('s990')),
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
      ); },
    ),
  ); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s991'),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        TextField(
          controller: subject,
          enabled: !busy,
          maxLength: 150,
          decoration: InputDecoration(labelText: appText('s992')),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: body,
          enabled: !busy,
          minLines: 4,
          maxLines: 8,
          maxLength: 3000,
          decoration: InputDecoration(labelText: appText('s993')),
        ),
        ErrorNote(error),
        const SizedBox(height: 18),
        ActionButton(
          appText('s994'),
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
  ); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s995'),
    child: DataView(
      load: () => widget.api.request('support/tickets/${widget.id}'),
      builder: (d, reload) { return  ListView(
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
            Text(
              appText('s996'),
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
              decoration: InputDecoration(labelText: appText('s997')),
            ),
            ErrorNote(error),
            ActionButton(
              appText('s998'),
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
      ); },
    ),
  ); }
}
