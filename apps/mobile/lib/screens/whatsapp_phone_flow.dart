import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'whatsapp_verification.dart';

class WhatsappPhoneFlow extends StatefulWidget {
  final ApiClient api;
  final String phone, purpose;
  final bool english;
  final Future<void> Function(Json)? onConfirm;
  const WhatsappPhoneFlow({super.key, required this.api, required this.phone, required this.purpose,
    this.english = false, this.onConfirm});
  @override State<WhatsappPhoneFlow> createState() => _WhatsappPhoneFlowState();
}
class _WhatsappPhoneFlowState extends State<WhatsappPhoneFlow> with WidgetsBindingObserver {
  Json? challenge;
  WhatsappPhase phase = WhatsappPhase.ready;
  Timer? timer;
  bool loading = true, checking = false, completing = false, finished = false, verified = false, foreground = true;
  Object? error;
  Json proof(Json c) => {'challengeId': c['challengeId'], 'whatsappToken': c['whatsappToken']};
  Json checkBody(Json c) => {'phone': widget.phone, 'purpose': widget.purpose, ...proof(c)};
  @override void initState() { super.initState(); WidgetsBinding.instance.addObserver(this); unawaited(start()); }
  Future<void> cancel(Json c) async {
    try { await widget.api.request('auth/whatsapp/cancel', method: 'POST', auth: false, body: checkBody(c)); } catch (_) { /* Expiry also invalidates abandoned proofs. */ }
  }
  @override void dispose() {
    timer?.cancel(); WidgetsBinding.instance.removeObserver(this);
    if (!finished && challenge != null) unawaited(cancel(challenge!));
    super.dispose();
  }
  @override void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground = state == AppLifecycleState.resumed;
    if (foreground && challenge != null && !verified) unawaited(check());
  }
  Future<void> start() async {
    if (completing) return;
    timer?.cancel();
    setState(() { loading = true; error = null; });
    try {
      final result = Map<String,dynamic>.from(await widget.api.request('auth/whatsapp/challenge', method: 'POST', auth: false,
        body: {'phone': widget.phone, 'purpose': widget.purpose}));
      if (!mounted) { await cancel(result); return; }
      setState(() { challenge = result; verified = false; phase = WhatsappPhase.ready; });
      timer = Timer.periodic(const Duration(seconds: 5), (_) { if (foreground) unawaited(check()); });
    } catch (e) { if (mounted) setState(() { error = e; phase = e is ApiFailure && e.code == 'WHATSAPP_UNAVAILABLE' ? WhatsappPhase.unavailable : WhatsappPhase.error; }); }
    finally { if (mounted) setState(() => loading = false); }
  }
  Future<void> openWhatsapp() async {
    if (challenge == null || completing || loading) return;
    final uri = Uri.tryParse('${challenge!['whatsappUrl']}');
    // The backend supplies the recipient; never launch an arbitrary URL scheme.
    if (uri == null || uri.scheme != 'https' || uri.host != 'wa.me' || uri.userInfo.isNotEmpty ||
        !RegExp(r'^/[1-9]\d{7,14}$').hasMatch(uri.path)) {
      setState(() { phase = WhatsappPhase.error; error = const ApiFailure('SERVICE_UNAVAILABLE'); }); return;
    }
    try {
      if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) throw const ApiFailure('SERVICE_UNAVAILABLE');
      if (mounted && !verified) setState(() { phase = WhatsappPhase.waiting; error = null; });
    } catch (e) { if (mounted) setState(() { error = e; phase = WhatsappPhase.error; }); }
  }
  Future<void> check() async {
    if (!mounted || checking || loading || completing || verified || challenge == null || phase == WhatsappPhase.expired) return;
    final c = challenge!;
    final expiry = DateTime.tryParse('${c['expiresAt']}');
    if (expiry == null || !expiry.isAfter(DateTime.now())) {
      timer?.cancel(); setState(() => phase = WhatsappPhase.expired); return;
    }
    checking = true;
    try {
      final result = await widget.api.request('auth/whatsapp/check', method: 'POST', auth: false, body: checkBody(c));
      if (!mounted || !identical(challenge, c)) return;
      if (result['status'] == 'verified') { verified = true; timer?.cancel(); await complete(); }
      else if (result['status'] == 'expired' || result['status'] == 'cancelled') { timer?.cancel(); setState(() => phase = WhatsappPhase.expired); }
      else if (phase == WhatsappPhase.error) setState(() { phase = WhatsappPhase.waiting; error = null; });
    } catch (e) { if (mounted && identical(challenge, c)) { timer?.cancel(); setState(() { error = e; phase = WhatsappPhase.error; }); } }
    finally { checking = false; }
  }
  Future<void> complete() async {
    if (!mounted || !verified || completing || challenge == null) return;
    setState(() { completing = true; error = null; phase = WhatsappPhase.verified; });
    try {
      final value = proof(challenge!);
      await widget.onConfirm?.call(value);
      finished = true;
      if (mounted) Navigator.pop(context, value);
    } catch (e) { if (mounted) setState(() { error = e; phase = WhatsappPhase.error; }); }
    finally { if (mounted) setState(() => completing = false); }
  }
  Future<void> retry() async {
    if (verified) { await complete(); return; }
    if (challenge != null && phase != WhatsappPhase.expired) {
      await check();
      if (mounted && phase != WhatsappPhase.error && !verified) timer = Timer.periodic(const Duration(seconds: 5), (_) { if (foreground) unawaited(check()); });
    } else { await start(); }
  }
  @override Widget build(BuildContext context) => PopScope(canPop: !completing, child:
    loading || completing ? Screen(title: widget.english ? 'WhatsApp verification' : 'التحقق عبر واتساب', child: const Center(child: CircularProgressIndicator())) :
    Column(children: [if (error != null) Padding(padding: const EdgeInsets.all(16), child: ErrorNote(error)),
      Expanded(child: WhatsappVerificationScreen(phone: '${challenge?['phone'] ?? widget.phone}', english: widget.english, phase: phase,
        onOpen: () => unawaited(openWhatsapp()), onRetry: () => unawaited(retry()),
        onSms: () => Navigator.pop(context, <String,dynamic>{'useSms': true}))),
    ]));
}
