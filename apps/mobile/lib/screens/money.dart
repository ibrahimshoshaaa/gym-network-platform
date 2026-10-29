import '../l10n/language.dart';
import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/ui.dart';
import '../core/portal_ui.dart';
import 'owner.dart';

class MoneyScreen extends StatelessWidget {
  final ApiClient api;
  final Json gym;
  final bool embedded;final int? section;
  const MoneyScreen({super.key, required this.api, required this.gym,this.embedded=false,this.section});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return embedded ? content(context) : Screen(title: appText('s795'),child:content(context)); }
  Widget content(BuildContext context)=>DataView(
    load: () => Future.wait([
      api.request('reports/summary?gymId=${gym['id']}&${reportRange()}'),
      api.request('gyms/${gym['id']}/withdrawals?limit=100'),
    ]),
    builder: (data, reload) {
      final charges=data[0]['serviceCharges'] as Map? ?? {};
      final net='${charges['netAvailablePiasters'] ?? ((data[0]['currentBalances'] as List? ?? []).cast<Map>().where((b)=>b['type']=='GYM_AVAILABLE').firstOrNull?['balancePiasters'] ?? '0')}';
      final balances = data[0]['currentBalances'] as List? ?? [];
      String get(String t) =>
          '${balances.cast<Map>().where((b) => b['type'] == t).firstOrNull?['balancePiasters'] ?? '0'}';
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(22),
        children: [
          if(!embedded)PortalIntro(
            appText('s796'),
            eyebrow: '${gym['name']}',
            detail: appText('s797'),
          ),
          Panel(
            color: ink,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  appText('s798'),
                  style: TextStyle(color: Colors.white70),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    appText('s122', [money(net)]),
                    style: const TextStyle(
                      fontSize: 37,
                      fontWeight: FontWeight.w900,
                      color: lime,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    backgroundColor: lime,
                    foregroundColor: ink,
                  ),
                  onPressed:
                      BigInt.parse(net) <= BigInt.zero ||
                          gym['status'] != 'ACTIVE'
                      ? null
                      : () async {
                          await open(
                            context,
                            WithdrawalForm(
                              api: api,
                              gymId: gym['id'],
                              available: net,
                            ),
                          );
                          await reload();
                        },
                  icon: const Icon(Icons.south_west_rounded),
                  label: Text(appText('s799')),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          PortalNote(
            appText('s800'),
          ),
          const SizedBox(height: 16),
          Panel(
            child: Column(
              children: [
                Fact(appText('s801'), appText('s122', [money(get('GYM_RESERVED'))])),
                Fact(appText('s802'), appText('s122', [money(get('GYM_DISPUTED'))])),
                Fact(appText('s803'), appText('s122', [money(get('GYM_PAID'))])),
              ],
            ),
          ),
          if(section!=1)...[
          SectionTitle(appText('s804')),
          PortalNote(appText('s805')),
          Panel(child:Column(children:[Fact(appText('s806'),appText('s122', [money(charges['grossAvailablePiasters']??'0')])),Fact(appText('s807'),appText('s122', [money(charges['debtPiasters']??'0')])),Fact(appText('s808'),appText('s122', [money(charges['scheduledPiasters']??'0')])),Fact(appText('s809'),appText('s122', [money(net)]))])),
          for(final c in (charges['items'] as List? ?? []))Panel(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${c['description']}'),Fact(appText('s810'),appText('s122', [money(c['amountPiasters'])])),Fact(appText('s811'),appText('s122', [money(c['collectedPiasters'])])),Fact(appText('s812'),appText('s122', [money(c['outstandingPiasters'])]))])),
          ],
          if(section!=0)...[
          SectionTitle(appText('s813')),
          if (rows(data[1]).isEmpty) EmptyState(appText('s814')),
          ...rows(data[1]).map(
            (w) => Padding(
              padding: const EdgeInsets.only(bottom: 14),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            appText('s122', [money(w['amountPiasters'])]),
                            style: const TextStyle(
                              fontSize: 23,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                        ),
                        StatusPill(w['status']),
                      ],
                    ),
                    Text(
                      shortDate(w['requestedAt']),
                      style: const TextStyle(color: muted, fontSize: 12),
                    ),
                    if (w['dueAt'] != null)
                      Fact(appText('s815'), '${shortDate(w['dueAt'])}'),
                    if (w['reviewReason'] != null) Text('${w['reviewReason']}'),
                    TextButton(
                      onPressed: () async {
                        await open(
                          context,
                          WithdrawalDetail(api: api, id: w['id']),
                        );
                        await reload();
                      },
                      child: Text(appText('s816')),
                    ),
                  ],
                ),
              ),
            ),
          ),
          ],
        ],
      );
    },
    );
}

class WithdrawalForm extends StatefulWidget {
  final ApiClient api;
  final String gymId, available;
  const WithdrawalForm({
    super.key,
    required this.api,
    required this.gymId,
    required this.available,
  });
  @override
  State<WithdrawalForm> createState() => _WithdrawalFormState();
}

class _WithdrawalFormState extends State<WithdrawalForm> {
  final amount = TextEditingController(),
      name = TextEditingController(),
      account = TextEditingController();
  String method = 'INSTAPAY';
  bool busy = false, review = false, verified = false;
  Object? error;
  @override
  void dispose() {
    amount.dispose();
    name.dispose();
    account.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s817'),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Panel(
          child: Fact(
            appText('s818'),
            appText('s122', [money(widget.available)]),
            strong: true,
          ),
        ),
        const SizedBox(height: 22),
        if (!review) ...[
          for (final f in [
            (amount, appText('s136')),
            (name, appText('s819')),
            (account, appText('s820')),
          ])
            Padding(
              padding: const EdgeInsets.only(bottom: 15),
              child: TextField(
                controller: f.$1,
                enabled: !busy,
                keyboardType: f.$1 == amount
                    ? const TextInputType.numberWithOptions(decimal: true)
                    : TextInputType.text,
                decoration: InputDecoration(labelText: f.$2),
              ),
            ),
          DropdownButtonFormField<String>(
            initialValue: method,
            decoration: InputDecoration(labelText: appText('s821')),
            items: [
              DropdownMenuItem(value: 'INSTAPAY', child: Text(appText('s145'))),
              DropdownMenuItem(value: 'WALLET', child: Text(appText('s146'))),
            ],
            onChanged: busy ? null : (v) => setState(() => method = v!),
          ),
          const SizedBox(height: 22),
          ActionButton(
            appText('s822'),
            onPressed: () {
              final n = piasters(amount.text);
              if (n == null ||
                  BigInt.parse(n) <= BigInt.zero ||
                  BigInt.parse(n) > BigInt.parse(widget.available) ||
                  name.text.trim().length < 2 ||
                  account.text.trim().length < 3) {
                setState(
                  () => error = Exception(appText('s823')),
                );
                return;
              }
              setState(() {
                review = true;
                error = null;
              });
            },
          ),
        ] else ...[
          Panel(
            child: Column(
              children: [
                Fact(
                  appText('s121'),
                  appText('s122', [money(piasters(amount.text))]),
                  strong: true,
                ),
                Fact(appText('s824'), name.text),
                Fact(appText('s496'), account.text),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Text(
            appText('s825'),
            style: TextStyle(color: muted, fontSize: 13),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: verified,
            onChanged: busy
                ? null
                : (v) => setState(() => verified = v ?? false),
            title: Text(appText('s826')),
          ),
          ActionButton(
            appText('s827'),
            busy: busy,
            onPressed: !verified || widget.api.pending != null
                ? null
                : () async {
                    if (busy) return;
                    setState(() => busy = true);
                    try {
                      await widget.api.transact(
                        'gyms/${widget.gymId}/withdrawals',
                        {
                          'paymentMethod': method,
                          'destinationAccount': account.text,
                          'destinationName': name.text,
                          'amountPiasters': piasters(amount.text),
                        },
                      );
                      if (context.mounted) Navigator.pop(context, true);
                    } catch (e) {
                      if (mounted) setState(() => error = e);
                    } finally {
                      if (mounted) setState(() => busy = false);
                    }
                  },
          ),
          TextButton(
            onPressed: busy || widget.api.pending != null
                ? null
                : () => setState(() => review = false),
            child: Text(appText('s828')),
          ),
        ],
        ErrorNote(error),
      ],
    ),
  ); }
}

class WithdrawalDetail extends StatefulWidget {
  final ApiClient api;
  final String id;
  const WithdrawalDetail({super.key, required this.api, required this.id});
  @override
  State<WithdrawalDetail> createState() => _WithdrawalDetailState();
}

class _WithdrawalDetailState extends State<WithdrawalDetail> {
  bool busy = false;
  Object? error;
  final reason = TextEditingController();
  @override
  void dispose() {
    reason.dispose();
    super.dispose();
  }

  Future<void> act(
    String path,
    Json body,
    Future<void> Function() reload,
  ) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await widget.api.transact('withdrawals/${widget.id}/$path', body);
      await reload();
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s829'),
    child: DataView(
      load: () => widget.api.request('withdrawals/${widget.id}'),
      builder: (d, reload) {
        final w = d['withdrawal'];
        return ListView(
          padding: const EdgeInsets.all(22),
          children: [
            Panel(
              child: Column(
                children: [
                  StatusPill(w['status']),
                  Fact(
                    appText('s121'),
                    appText('s122', [money(w['amountPiasters'])]),
                    strong: true,
                  ),
                  Fact(appText('s824'), '${w['destinationName']}'),
                  Fact(appText('s496'), '${w['destinationAccount']}'),
                  if (w['dueAt'] != null)
                    Fact(appText('s830'), shortDate(w['dueAt'])),
                  if (w['reviewReason'] != null) Text('${w['reviewReason']}'),
                  if (w['rejectionReason'] != null)
                    Text('${w['rejectionReason']}'),
                  if (w['transferReference'] != null)
                    Fact(appText('s831'), '${w['transferReference']}'),
                  Reference('${w['id']}'),
                ],
              ),
            ),
            if (['REQUESTED', 'PAID'].contains(w['status']) &&
                d['feedback'] == null) ...[
              const SizedBox(height: 22),
              TextField(
                controller: reason,
                enabled: !busy,
                maxLength: 1000,
                decoration: InputDecoration(
                  labelText: appText('s832'),
                ),
              ),
              ErrorNote(error),
              if (w['status'] == 'REQUESTED')
                ActionButton(
                  appText('s833'),
                  busy: busy,
                  onPressed: widget.api.pending != null
                      ? null
                      : () => act('cancel', {'reason': reason.text}, reload),
                )
              else ...[
                ActionButton(
                  appText('s834'),
                  busy: busy,
                  onPressed: widget.api.pending != null
                      ? null
                      : () => act('feedback', {
                          'kind': 'RECEIVED',
                          'reason': reason.text,
                        }, reload),
                ),
                TextButton(
                  onPressed: busy || widget.api.pending != null
                      ? null
                      : () => act('feedback', {
                          'kind': 'DISPUTE',
                          'reason': reason.text,
                        }, reload),
                  child: Text(appText('s835')),
                ),
              ],
            ],
            if (d['feedback'] != null)
              Panel(
                child: Text(appText('s836', [d['feedback']['reason']])),
              ),
          ],
        );
      },
    ),
  ); }
}

