import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/services.dart';
import '../core/api.dart';
import '../core/ui.dart';

const phoneOtpPreview = bool.fromEnvironment('GYM_PHONE_OTP_PREVIEW', defaultValue: true);

Future<Json?> requestPhoneCode(BuildContext context, ApiClient api, String phone, String purpose, {Future<void> Function(Json)? onConfirm, bool english = false}) async {
  final challenge = Map<String, dynamic>.from(await api.request('auth/phone/challenge', method: 'POST', auth: false, body: {'phone': phone, 'purpose': purpose}));
  if (!context.mounted) return null;
  return open<Json>(context, _PhoneCodeScreen(api: api, phone: phone, purpose: purpose, challenge: challenge, onConfirm: onConfirm, english: english));
}

class _FlowHeading extends StatelessWidget {
  final String title, detail;
  final IconData icon;
  final int step;
  const _FlowHeading(this.title, this.detail, {required this.icon, required this.step});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    Row(children: List.generate(3, (i) => Expanded(child: Container(
      height: 4, margin: const EdgeInsetsDirectional.only(end: 6, bottom: 28),
      decoration: BoxDecoration(color: i < step ? green : const Color(0xffdce4e2), borderRadius: BorderRadius.circular(4)),
    )))),
    Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: const Color(0xffe3fbf3), borderRadius: BorderRadius.circular(20)), child: Icon(icon, color: green, size: 30)),
    const SizedBox(height: 20),
    Text(title, style: Theme.of(context).textTheme.headlineMedium),
    const SizedBox(height: 8), Text(detail, style: const TextStyle(color: muted)),
    const SizedBox(height: 24),
  ]);
}

Widget _flowPage({required BuildContext context, required bool english, required String title, required List<Widget> children}) =>
  Localizations.override(context: context, locale: Locale(english ? 'en' : 'ar'), delegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate], child: Directionality(
    textDirection: english ? TextDirection.ltr : TextDirection.rtl,
    child: Screen(title: title, child: LayoutBuilder(builder: (context, constraints) => SingleChildScrollView(
      padding: const EdgeInsets.all(24), child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      )),
    ))),
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
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> resend() async {
    if (busy || wait > 0) return;
    setState(() { busy = true; error = null; });
    try {
      final result = await widget.api.request('auth/phone/challenge', method: 'POST', auth: false, body: {'phone': widget.phone, 'purpose': widget.purpose});
      if (mounted) setState(() { challenge = Map<String, dynamic>.from(result); fillTestCode(); countdown(); });
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext context) => PopScope(canPop: !busy, child: _flowPage(
    context: context, english: widget.english, title: tr('تأكيد رقم الموبايل', 'Verify mobile number'), children: [
      _FlowHeading(tr('اكتب كود التأكيد', 'Enter your code'), tr('تأكد من الرقم قبل ما تكمّل.', 'Check your number before continuing.'), icon: Icons.mark_chat_read_outlined, step: 2),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.phone, textDirection: TextDirection.ltr, textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        TextButton(onPressed: busy ? null : () => Navigator.pop(context), child: Text(tr('تغيير الرقم', 'Change number'))),
        const SizedBox(height: 12),
        if (challenge['testMode'] != true) Text(tr('الكود في الرسالة مكتوب بالكلمات؛ اكتبه هنا بالأرقام.', 'The SMS spells out each digit; enter the code here as numbers.'), style: const TextStyle(color: muted, fontSize: 12)),
        TextField(key: const ValueKey('phone.otp.code'), controller: code, enabled: !busy,
          keyboardType: TextInputType.number, textDirection: TextDirection.ltr, textAlign: TextAlign.center,
          maxLength: 6, inputFormatters: [TextInputFormatter.withFunction((old, value) => value.copyWith(text: digits(value.text))), FilteringTextInputFormatter.digitsOnly],
          autofillHints: const [AutofillHints.oneTimeCode], textInputAction: TextInputAction.done, onSubmitted: (_) => confirm(),
          style: const TextStyle(fontSize: 28, letterSpacing: 6, fontWeight: FontWeight.w800),
          decoration: InputDecoration(labelText: tr('كود التأكيد', 'Verification code'), counterText: '', hintText: '000000')),
        ErrorNote(error), const SizedBox(height: 24),
        ActionButton(tr('متابعة', 'Continue'), busy: busy, onPressed: confirm),
        const SizedBox(height: 12),
        TextButton(onPressed: busy || wait > 0 ? null : resend, child: Text(wait > 0 ? tr('إعادة الطلب بعد $wait ثانية', 'Request again in $wait seconds') : tr('طلب كود جديد', 'Request a new code'))),
      ])),
      if (challenge['testMode'] == true) ...[
        const SizedBox(height: 20),
        Text(tr('وضع تجريبي: مفيش رسالة SMS بتتبعت. الكود 123456 بيتملّى تلقائيًا وصلاحيته ٥ دقائق.', 'Test mode: no SMS is sent. Code 123456 is autofilled and expires in 5 minutes.'), style: const TextStyle(color: muted, fontSize: 12)),
      ],
    ],
  ));
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
      setState(() => error = tr('اكتب رقم الموبايل المسجّل.', 'Enter your registered mobile number.')); return;
    }
    FocusScope.of(context).unfocus();
    setState(() { busy = true; error = null; });
    try {
      final result = await requestPhoneCode(context, widget.api, phone.text, 'RESET', english: widget.english, onConfirm: (value) async {
        await widget.api.request('auth/phone/reset/verify', method: 'POST', auth: false, body: {'phone': phone.text, ...value});
      });
      if (mounted && result != null) setState(() => proof = result);
    } catch (e) { if (mounted) setState(() => error = e); }
    finally { if (mounted) setState(() => busy = false); }
  }
  Future<void> save() async {
    if (busy || proof == null) return;
    if (password.text.runes.length < 15 || password.text.runes.length > 128) {
      setState(() => error = tr('كلمة السر من ١٥ إلى ١٢٨ حرفًا.', 'Use 15 to 128 characters.')); return;
    }
    if (password.text != confirmation.text) { setState(() => error = tr('كلمتا السر مش متطابقتين.', 'Passwords do not match.')); return; }
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
  @override Widget build(BuildContext context) => PopScope(canPop: !busy, child: _flowPage(
    context: context, english: widget.english, title: tr('نسيت كلمة السر', 'Reset password'), children: [
      _FlowHeading(done ? tr('كلمة السر اتغيّرت', 'Password changed') : proof == null ? tr('نرجّع حسابك', 'Recover your account') : tr('اختار كلمة سر جديدة', 'Choose a new password'),
        done ? tr('تم إغلاق الجلسات القديمة. ادخل برقمك وكلمة السر الجديدة.', 'Previous sessions are closed. Sign in with your new password.') : proof == null ? tr('اكتب رقم الموبايل اللي سجّلت بيه، وبعدها أكّد الكود.', 'Enter your registered mobile number, then verify the code.') : tr('اختار جملة سهلة تفتكرها وصعبة التخمين.', 'Choose a memorable phrase that is hard to guess.'),
        icon: done ? Icons.check_circle_outline : proof == null ? Icons.phone_iphone_rounded : Icons.lock_reset_rounded, step: proof == null && !done ? 1 : 3),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (done) ActionButton(tr('رجوع للدخول', 'Back to sign in'), onPressed: () => Navigator.pop(context))
        else if (proof == null) ...[
          TextField(key: const ValueKey('phone.reset.phone'), controller: phone, enabled: !busy, keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr, autofillHints: const [AutofillHints.telephoneNumber], textInputAction: TextInputAction.done,
            onSubmitted: (_) => requestCode(), decoration: InputDecoration(labelText: tr('رقم الموبايل المسجّل', 'Registered mobile number'), hintText: '01xxxxxxxxx', prefixIcon: const Icon(Icons.phone_iphone_rounded))),
          ErrorNote(error), const SizedBox(height: 24),
          ActionButton(tr('متابعة للكود', 'Continue to code'), busy: busy, onPressed: requestCode),
        ] else ...[
          TextField(key: const ValueKey('phone.reset.password'), controller: password, enabled: !busy, obscureText: hidden,
            textDirection: TextDirection.ltr, autocorrect: false, enableSuggestions: false, autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(labelText: tr('كلمة السر الجديدة', 'New password'), helperText: tr('١٥ حرفًا على الأقل', 'At least 15 characters'),
              suffixIcon: IconButton(tooltip: tr('إظهار أو إخفاء كلمة السر', 'Show or hide password'), onPressed: () => setState(() => hidden = !hidden), icon: Icon(hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined)))),
          const SizedBox(height: 20),
          TextField(key: const ValueKey('phone.reset.confirmation'), controller: confirmation, enabled: !busy, obscureText: hidden,
            textDirection: TextDirection.ltr, autocorrect: false, enableSuggestions: false, autofillHints: const [AutofillHints.newPassword],
            textInputAction: TextInputAction.done, onSubmitted: (_) => save(), decoration: InputDecoration(labelText: tr('تأكيد كلمة السر الجديدة', 'Confirm new password'))),
          ErrorNote(error), const SizedBox(height: 24),
          ActionButton(tr('حفظ كلمة السر', 'Save password'), busy: busy, onPressed: save),
          TextButton(onPressed: busy ? null : () => setState(() { proof = null; error = null; password.clear(); confirmation.clear(); }), child: Text(tr('البدء من جديد', 'Start again'))),
        ],
      ])),
      if (!done && proof == null) ...[
        const SizedBox(height: 20),
        Text(tr('الاسترجاع حاليًا لحسابات تجربة الموبايل فقط، بدون إرسال SMS. للحسابات القديمة تواصل مع الدعم.', 'Recovery currently supports phone test accounts only. No SMS is sent. Contact support for older accounts.'), style: const TextStyle(color: muted, fontSize: 12)),
      ],
    ],
  ));
}
