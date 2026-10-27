import '../l10n/language.dart';
import 'whatsapp_phone_flow.dart';
import 'whatsapp_verification.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/ui.dart';

const phoneOtpPreview = bool.fromEnvironment('GYM_PHONE_OTP_PREVIEW', defaultValue: true);

Future<Json?> requestPhoneCode(BuildContext context, ApiClient api, String phone, String purpose, {Future<void> Function(Json)? onConfirm, bool? english}) async {
  english ??= AppLanguage.instance.english;
  final challenge = Map<String, dynamic>.from(await api.request('auth/phone/challenge', method: 'POST', auth: false, body: {'phone': phone, 'purpose': purpose, 'language': english ? 'en' : 'ar'}));
  if (!context.mounted) return null;
  final result = await open<Json>(context, _PhoneCodeScreen(api: api, phone: phone, purpose: purpose, challenge: challenge, onConfirm: onConfirm, english: english));
  if (result?['failure'] is ApiFailure) throw result!['failure'] as ApiFailure;
  return result;
}

Future<Json?> choosePhoneVerification(BuildContext context, ApiClient api, String phone, String purpose, {Future<void> Function(Json)? onConfirm, bool? english}) async {
  english ??= AppLanguage.instance.english;
  Json status = {};
  try { status = Map<String,dynamic>.from(await api.request('auth/phone/status', auth: false)); } catch (_) { /* SMS remains a fallback if discovery is temporarily unavailable. */ }
  if (!context.mounted) return null;
  final method = await open<String>(context, PhoneVerificationMethodScreen(phone: phone, english: english,
    smsEnabled: status['smsEnabled'] != false, whatsappEnabled: status['whatsappEnabled'] == true));
  if (!context.mounted || method == null) return null;
  if (method == 'whatsapp') {
    final result = await open<Json>(context, WhatsappPhoneFlow(api: api, phone: phone, purpose: purpose, english: english, onConfirm: onConfirm));
    if (result?['failure'] is ApiFailure) throw result!['failure'] as ApiFailure;
    if (!context.mounted || result?['useSms'] != true) return result;
  }
  return requestPhoneCode(context, api, phone, purpose, onConfirm: onConfirm, english: english);
}

class _FlowHeading extends StatelessWidget {
  final String title, detail;
  final IconData icon;
  final int step;
  const _FlowHeading(this.title, this.detail, {required this.icon, required this.step});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(children: List.generate(3, (i) => Expanded(child: Container(
      height: 4, margin: const EdgeInsetsDirectional.only(end: 6, bottom: 28),
      decoration: BoxDecoration(color: i < step ? green : const Color(0xffdce4e2), borderRadius: BorderRadius.circular(4)),
    )))),
    Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xffe3fbf3), borderRadius: BorderRadius.circular(20)), child: Icon(icon, color: green, size: 30)),
    const SizedBox(height: 20),
    Text(title, style: Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height: 8), Text(detail, style: const TextStyle(color: muted)),
    const SizedBox(height: 24),
  ]); }
}

Widget _flowPage({required BuildContext context, required bool english, required String title, required List<Widget> children}) =>
  Localizations.override(context: context, locale: Locale(english ? 'en' : 'ar'), delegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate], child: Directionality(
    textDirection: english ? TextDirection.ltr : TextDirection.rtl,
    child: Screen(title: title, child: LayoutBuilder(builder: (context, constraints) { AppLanguage.watch(context); return  SingleChildScrollView(
      padding: const EdgeInsets.all(24), child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      )),
    ); })),
  ));

class _PhoneCodeScreen extends StatefulWidget {
  final ApiClient api;
  final bool english;
  final String phone, purpose;
  final Json challenge;
  final Future<void> Function(Json)? onConfirm;
  const _PhoneCodeScreen({required this.api, required this.phone, required this.purpose, required this.challenge, this.onConfirm, required this.english});
  @override State<_PhoneCodeScreen> createState() => _PhoneCodeScreenState();
}
class _PhoneCodeScreenState extends State<_PhoneCodeScreen> {
  final code = TextEditingController();
  late Json challenge;
  bool busy = false;
  Object? error;
  Timer? timer;
  int wait = 60;
  String tr(String ar, String en) => widget.english ? en : ar;
  @override void initState() { super.initState(); challenge = widget.challenge; fillTestCode(); countdown(); }
  void fillTestCode() { code.text = challenge['testMode'] == true ? '123456' : ''; }
  void countdown() {
    timer?.cancel(); wait = (challenge['retryAfterSeconds'] as num?)?.toInt() ?? 60;
    timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) { t.cancel(); return; }
      setState(() { if (wait > 0) wait--; });
      if (wait <= 0) t.cancel();
    });
  }
  @override void dispose() { timer?.cancel(); code.dispose(); super.dispose(); }
  Future<void> confirm() async {
    if (busy) return;
    final value = digits(code.text.trim());
    if (!RegExp(r'^\d{6}$').hasMatch(value)) { setState(() => error = const ApiFailure('INVALID_INPUT')); return; }
    final proof = <String, dynamic>{'challengeId': challenge['challengeId'], 'code': value};
    FocusScope.of(context).unfocus();
    setState(() { busy = true; error = null; });
    try {
      await widget.onConfirm?.call(proof);
      if (mounted) Navigator.pop(context, proof);
    } catch (e) {
      if(mounted){
        if(e is ApiFailure&&e.code=='PHONE_ACCOUNT_NOT_FOUND')Navigator.pop(context,<String,dynamic>{'failure':e});
        else setState(() => error = e);
      }
    }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> resend() async {
    if (busy || wait > 0) return;
    setState(() { busy = true; error = null; });
    try {
      final result = await widget.api.request('auth/phone/challenge', method: 'POST', auth: false, body: {'phone': widget.phone, 'purpose': widget.purpose, 'language': widget.english ? 'en' : 'ar'});
      if (mounted) setState(() { challenge = Map<String, dynamic>.from(result); fillTestCode(); countdown(); });
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) { AppLanguage.watch(context); return  PopScope(canPop: !busy, child: _flowPage(
    context: context, english: widget.english, title: tr(appText('s934'), 'Verify mobile number'), children: [
      _FlowHeading(tr(appText('s935'), 'Enter your code'), tr(appText('s936'), 'Check your number before continuing.'), icon: Icons.mark_chat_read_outlined, step: 2),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.phone, textDirection: TextDirection.ltr, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        TextButton(onPressed: busy ? null : () => Navigator.pop(context), child: Text(tr(appText('s937'), 'Change number'))),
        const SizedBox(height: 12),
        if (challenge['testMode'] != true) Text(tr(appText('s938'), 'The SMS spells out each digit; enter the code here as numbers.'), style: const TextStyle(color: muted, fontSize: 12)),
        TextField(key: const ValueKey('phone.otp.code'), controller: code, enabled: !busy,
          keyboardType: TextInputType.number, textDirection: TextDirection.ltr, textAlign: TextAlign.center,
          maxLength: 6, inputFormatters: [TextInputFormatter.withFunction((old, value) => value.copyWith(text: digits(value.text))), FilteringTextInputFormatter.digitsOnly],
          autofillHints: const [AutofillHints.oneTimeCode], textInputAction: TextInputAction.done, onSubmitted: (_) => confirm(),
          style: const TextStyle(fontSize: 28, letterSpacing: 6, fontWeight: FontWeight.w800),
          decoration: InputDecoration(labelText: tr(appText('s939'), 'Verification code'), counterText: '', hintText: '000000')),
        ErrorNote(error), const SizedBox(height: 24),
        ActionButton(tr(appText('s940'), 'Continue'), busy: busy, onPressed: confirm),
        const SizedBox(height: 12),
        TextButton(onPressed: busy || wait > 0 ? null : resend, child: Text(wait > 0 ? tr(appText('s941', [wait]), 'Request again in $wait seconds') : tr(appText('s942'), 'Request a new code'))),
      ])),
      if (challenge['testMode'] == true) ...[
        const SizedBox(height: 20),
        Text(tr(appText('s943'), 'Test mode: no SMS is sent. Code 123456 is autofilled and expires in 5 minutes.'), style: const TextStyle(color: muted, fontSize: 12)),
      ],
    ],
  )); }
}

class PhonePasswordReset extends StatefulWidget {
  final ApiClient api;
  final bool english;
  const PhonePasswordReset({super.key, required this.api, this.english = false});
  @override State<PhonePasswordReset> createState() => _PhonePasswordResetState();
}
class _PhonePasswordResetState extends State<PhonePasswordReset> {
  final phone = TextEditingController(), password = TextEditingController(), confirmation = TextEditingController();
  bool busy = false, done = false, hidden = true;
  Json? proof;
  Object? error;
  String tr(String ar, String en) => widget.english ? en : ar;
  @override void dispose() { phone.dispose(); password.dispose(); confirmation.dispose(); super.dispose(); }
  Future<void> requestCode() async {
    if (busy) return;
    if (digits(phone.text).replaceAll(RegExp(r'[\s()+-]'), '').length < 10) {
      setState(() => error = tr(appText('s944'), 'Enter your registered mobile number.')); return;
    }
    FocusScope.of(context).unfocus();
    setState(() { busy = true; error = null; });
    try {
      final result = await choosePhoneVerification(context, widget.api, phone.text, 'RESET', english: widget.english, onConfirm: (value) async {
        await widget.api.request('auth/phone/reset/verify', method: 'POST', auth: false, body: {'phone': phone.text, ...value});
      });
      if (mounted && result != null) setState(() => proof = result);
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> save() async {
    if (busy || proof == null) return;
    if (password.text.runes.length < 8 || password.text.runes.length > 128) {
      setState(() => error = tr(appText('s945'), 'Use 8 to 128 characters.')); return;
    }
    if (password.text != confirmation.text) { setState(() => error = tr(appText('s946'), 'Passwords do not match.')); return; }
    FocusScope.of(context).unfocus();
    setState(() { busy = true; error = null; });
    try {
      await widget.api.request('auth/phone/reset', method: 'POST', auth: false, body: {'phone': phone.text, ...proof!, 'newPassword': password.text});
      password.clear(); confirmation.clear();
      if (mounted) setState(() => done = true);
    } catch (e) {
      if (mounted) setState(() { error = e; if (e is ApiFailure && e.code == 'PHONE_OTP_INVALID') proof = null; });
    } finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) { AppLanguage.watch(context); return  PopScope(canPop: !busy, child: _flowPage(
    context: context, english: widget.english, title: tr(appText('s947'), 'Reset password'), children: [
      _FlowHeading(done ? tr(appText('s948'), 'Password changed') : proof == null ? tr(appText('s949'), 'Recover your account') : tr(appText('s950'), 'Choose a new password'),
        done ? tr(appText('s951'), 'Previous sessions are closed. Sign in with your new password.') : proof == null ? tr(appText('s952'), 'Enter your registered mobile number, then verify the code.') : tr(appText('s953'), 'Choose a memorable phrase that is hard to guess.'),
        icon: done ? Icons.check_circle_outline : proof == null ? Icons.phone_iphone_rounded : Icons.lock_reset_rounded, step: proof == null && !done ? 1 : 3),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (done) ActionButton(tr(appText('s954'), 'Back to sign in'), onPressed: () => Navigator.pop(context))
        else if (proof == null) ...[
          TextField(key: const ValueKey('phone.reset.phone'), controller: phone, enabled: !busy, keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr, autofillHints: const [AutofillHints.telephoneNumber], textInputAction: TextInputAction.done,
            onSubmitted: (_) => requestCode(), decoration: InputDecoration(labelText: tr(appText('s533'), 'Registered mobile number'), hintText: '01xxxxxxxxx', prefixIcon: const Icon(Icons.phone_iphone_rounded))),
          ErrorNote(error), const SizedBox(height: 24),
          ActionButton(tr(appText('s955'), 'Continue to code'), busy: busy, onPressed: requestCode),
        ] else ...[
          TextField(key: const ValueKey('phone.reset.password'), controller: password, enabled: !busy, obscureText: hidden,
            textDirection: TextDirection.ltr, autocorrect: false, enableSuggestions: false, autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(labelText: tr(appText('s956'), 'New password'), helperText: tr(appText('s957'), 'At least 8 characters; numbers only are allowed'),
              suffixIcon: IconButton(tooltip: tr(appText('s958'), 'Show or hide password'), onPressed: () => setState(() => hidden = !hidden), icon: Icon(hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
          const SizedBox(height: 20),
          TextField(key: const ValueKey('phone.reset.confirmation'), controller: confirmation, enabled: !busy, obscureText: hidden,
            textDirection: TextDirection.ltr, autocorrect: false, enableSuggestions: false, autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.done, onSubmitted: (_) => save(), decoration: InputDecoration(labelText: tr(appText('s959'), 'Confirm new password'))),
          ErrorNote(error), const SizedBox(height: 24),
          ActionButton(tr(appText('s960'), 'Save password'), busy: busy, onPressed: save),
          TextButton(onPressed: busy ? null : () => setState(() { proof = null; error = null; password.clear(); confirmation.clear(); }), child: Text(tr(appText('s961'), 'Start again'))),
        ],
      ])),
      if (!done && proof == null) ...[
        const SizedBox(height: 20),
        Text(tr(appText('s962'), 'Use the mobile number registered to your account, then verify the code and choose a new password.'), style: const TextStyle(color: muted, fontSize: 12)),
      ],
    ],
  )); }
}
