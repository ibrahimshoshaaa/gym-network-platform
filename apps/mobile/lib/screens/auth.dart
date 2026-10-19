import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/ui.dart';

const _authTeal = Color(0xff065466);

class AuthScreen extends StatefulWidget {
  final ApiClient api;
  const AuthScreen({super.key, required this.api});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool register = false, owner = false, busy = false, hidden = true;
  bool english = false, languageChosen = false, savingLanguage = false;
  Object? error;
  final form = GlobalKey<FormState>();
  final fields = <String, TextEditingController>{
    for (final k in [
      'identifier',
      'displayName',
      'email',
      'phone',
      'password',
      'gymName',
      'description',
      'governorate',
      'city',
      'address',
    ])
      k: TextEditingController(),
  };
  String tr(String ar, String en) => english ? en : ar;

  @override
  void initState() {
    super.initState();
    restoreLanguage();
  }

  Future<void> restoreLanguage() async {
    try {
      final value = await widget.api.storage.read('auth.language');
      if (mounted && !languageChosen) setState(() => english = value == 'en');
    } catch (_) {
      /* The form remains usable if preference storage is unavailable. */
    }
  }

  Future<void> toggleLanguage() async {
    if (savingLanguage || busy) return;
    setState(() {
      english = !english;
      languageChosen = true;
      savingLanguage = true;
    });
    try {
      await widget.api.storage.write('auth.language', english ? 'en' : 'ar');
    } catch (_) {
      // The current screen still switches even if this preference cannot be saved.
    } finally {
      if (mounted) setState(() => savingLanguage = false);
    }
  }

  void changeMode(bool value) {
    if (busy || register == value) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      register = value;
      error = null;
      form.currentState?.reset();
    });
  }

  @override
  void dispose() {
    for (final c in fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final body = register
          ? <String, dynamic>{
              for (final k in [
                'displayName',
                'email',
                'phone',
                'password',
                if (owner) ...[
                  'gymName',
                  'description',
                  'governorate',
                  'city',
                  'address',
                ],
              ])
                k: fields[k]!.text,
            }
          : <String, dynamic>{
              'identifier': fields['identifier']!.text,
              'password': fields['password']!.text,
            };
      await widget.api.authenticate(
        register
            ? (owner ? 'auth/owners/register' : 'auth/register')
            : 'auth/signin',
        body,
      );
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget field(
    String k,
    String ar,
    String en, {
    TextInputType? keyboard,
    bool optional = false,
  }) {
    final label = tr(ar, en);
    final password = k == 'password';
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: ink,
            ),
          ),
          const SizedBox(height: 8),
          TextFormField(
            key: ValueKey('auth.$k'),
            controller: fields[k],
            enabled: !busy,
            keyboardType: keyboard,
            obscureText: password && hidden,
            textInputAction: password && !register
                ? TextInputAction.done
                : TextInputAction.next,
            onFieldSubmitted: password && !register ? (_) => submit() : null,
            autocorrect: ![
              'phone',
              'email',
              'identifier',
              'password',
            ].contains(k),
            enableSuggestions: !password,
            textDirection:
                ['phone', 'email', 'password', 'identifier'].contains(k)
                ? TextDirection.ltr
                : null,
            autofillHints: password
                ? [
                    register
                        ? AutofillHints.newPassword
                        : AutofillHints.password,
                  ]
                : k == 'email'
                ? [AutofillHints.email]
                : k == 'identifier'
                ? [AutofillHints.username]
                : k == 'phone'
                ? [AutofillHints.telephoneNumber]
                : k == 'displayName'
                ? [AutofillHints.name]
                : null,
            decoration: InputDecoration(
              hintText: tr('اكتب $ar', 'Enter ${en.toLowerCase()}'),
              helperText: password && register
                  ? tr(
                      '15 حرفًا على الأقل؛ جرّب جملة سهلة تحفظها.',
                      'At least 15 characters. Try a memorable phrase.',
                    )
                  : null,
              helperMaxLines: 2,
              errorMaxLines: 2,
              prefixIcon: Icon(
                password
                    ? Icons.lock_outline_rounded
                    : k == 'identifier' || k == 'email'
                    ? Icons.mail_outline_rounded
                    : k == 'phone'
                    ? Icons.phone_iphone_rounded
                    : k == 'displayName'
                    ? Icons.person_outline_rounded
                    : k == 'gymName'
                    ? Icons.storefront_outlined
                    : Icons.location_on_outlined,
                size: 21,
                color: ink,
              ),
              suffixIcon: password
                  ? IconButton(
                      tooltip: hidden
                          ? tr('إظهار كلمة السر', 'Show password')
                          : tr('إخفاء كلمة السر', 'Hide password'),
                      onPressed: busy
                          ? null
                          : () => setState(() => hidden = !hidden),
                      icon: Icon(
                        hidden
                            ? Icons.visibility_off_outlined
                            : Icons.visibility_outlined,
                        size: 21,
                      ),
                    )
                  : null,
            ),
            validator: (v) {
              if (optional) return null;
              if (v == null || v.trim().isEmpty)
                return tr('اكتب $ar', '$en is required');
              if (password && register && v.runes.length < 15)
                return tr(
                  'كلمة السر 15 حرفًا على الأقل',
                  'Use at least 15 characters',
                );
              if (k == 'email' && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(v.trim()))
                return tr('اكتب إيميل صحيح', 'Enter a valid email address');
              return null;
            },
          ),
        ],
      ),
    );
  }

  String get errorText {
    if (!english) return error.toString();
    return switch (error is ApiFailure ? (error as ApiFailure).code : '') {
      'INVALID_CREDENTIALS' =>
        'Your email, mobile number or password is incorrect.',
      'ACCOUNT_UNAVAILABLE' =>
        'This email or mobile number is already registered. Try signing in.',
      'INVALID_INPUT' => 'Check the required fields and try again.',
      'RATE_LIMITED' => 'Too many attempts. Please wait and try again.',
      _ => 'Unable to connect right now. Please try again.',
    };
  }

  void social(BuildContext context, String provider) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            tr(
              'الدخول والتسجيل باستخدام $provider هيتاح قريبًا. استخدم الإيميل حاليًا.',
              '$provider sign-in and sign-up are coming soon. Please use email for now.',
            ),
          ),
        ),
      );
  }

  @override
  Widget build(BuildContext context) => Localizations.override(
    context: context,
    locale: Locale(english ? 'en' : 'ar'),
    child: Builder(
      builder: (context) => Directionality(
        textDirection: english ? TextDirection.ltr : TextDirection.rtl,
        child: Theme(
          data: Theme.of(context).copyWith(
            colorScheme: Theme.of(
              context,
            ).colorScheme.copyWith(primary: _authTeal),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 17,
              ),
              hintStyle: const TextStyle(
                color: Color(0xff899397),
                fontSize: 13,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: const BorderSide(color: Color(0xffdce2e4)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: const BorderSide(color: Color(0xffdce2e4)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(18),
                borderSide: const BorderSide(color: _authTeal, width: 1.5),
              ),
            ),
          ),
          child: AnnotatedRegion<SystemUiOverlayStyle>(
            value: SystemUiOverlayStyle.light.copyWith(
              statusBarColor: Colors.transparent,
            ),
            child: Scaffold(
              backgroundColor: _authTeal,
              body: SafeArea(
                bottom: false,
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: CustomScrollView(
                      slivers: [
                        SliverToBoxAdapter(
                          child: Stack(
                            children: [
                              const Positioned.fill(
                                child: CustomPaint(painter: _AuthBackdrop()),
                              ),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  24,
                                  12,
                                  24,
                                  30,
                                ),
                                child: Column(
                                  children: [
                                    Row(
                                      children: [
                                        const Spacer(),
                                        TextButton.icon(
                                          key: const ValueKey('auth.language'),
                                          onPressed: busy || savingLanguage
                                              ? null
                                              : toggleLanguage,
                                          style: TextButton.styleFrom(
                                            foregroundColor: Colors.white,
                                            backgroundColor: Colors.white
                                                .withValues(alpha: .1),
                                            padding: const EdgeInsets.symmetric(
                                              horizontal: 12,
                                            ),
                                          ),
                                          icon: const Icon(
                                            Icons.language_rounded,
                                            size: 17,
                                          ),
                                          label: Text(
                                            english ? 'العربية' : 'English',
                                            style: const TextStyle(
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    const Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        Icon(
                                          Icons.hub_rounded,
                                          color: Color(0xffb5e9dc),
                                          size: 25,
                                        ),
                                        SizedBox(width: 9),
                                        Text(
                                          'GYM NETWORK',
                                          textDirection: TextDirection.ltr,
                                          style: TextStyle(
                                            fontSize: 15,
                                            letterSpacing: 1.7,
                                            color: Colors.white,
                                            fontWeight: FontWeight.w800,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 19),
                                    Text(
                                      register
                                          ? tr(
                                              'ابدأ رحلتك معانا',
                                              'Your next chapter',
                                            )
                                          : tr(
                                              'أهلًا بيك من جديد',
                                              'Welcome back',
                                            ),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 28,
                                        height: 1.3,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.white,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Text(
                                      register
                                          ? tr(
                                              'حساب واحد يفتح لك عالم الجيمات.',
                                              'One account. A world of gyms.',
                                            )
                                          : tr(
                                              'جيمك، رصيدك، وتمرينتك… في مكان واحد.',
                                              'Your gyms, your wallet, your next workout.',
                                            ),
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        fontSize: 13,
                                        height: 1.5,
                                        color: Color(0xffc0dce1),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        SliverToBoxAdapter(
                          child: Container(
                            constraints: BoxConstraints(
                              minHeight: math.max(
                                0,
                                MediaQuery.sizeOf(context).height - 240,
                              ),
                            ),
                            decoration: const BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.vertical(
                                top: Radius.circular(34),
                              ),
                            ),
                            padding: EdgeInsets.fromLTRB(
                              22,
                              22,
                              22,
                              MediaQuery.paddingOf(context).bottom + 24,
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Container(
                                  padding: const EdgeInsets.all(5),
                                  decoration: BoxDecoration(
                                    color: const Color(0xfff3f5f6),
                                    borderRadius: BorderRadius.circular(30),
                                  ),
                                  child: Row(
                                    children: [
                                      for (final value in [false, true])
                                        Expanded(
                                          child: Semantics(
                                            selected: register == value,
                                            child: TextButton(
                                              key: ValueKey(
                                                value
                                                    ? 'auth.signup.tab'
                                                    : 'auth.login.tab',
                                              ),
                                              onPressed: busy
                                                  ? null
                                                  : () => changeMode(value),
                                              style: TextButton.styleFrom(
                                                backgroundColor:
                                                    register == value
                                                    ? Colors.white
                                                    : Colors.transparent,
                                                foregroundColor:
                                                    register == value
                                                    ? ink
                                                    : muted,
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      vertical: 12,
                                                    ),
                                                shape: const StadiumBorder(),
                                              ),
                                              child: Text(
                                                value
                                                    ? tr('حساب جديد', 'Sign up')
                                                    : tr('دخول', 'Log in'),
                                                style: TextStyle(
                                                  fontSize: 14,
                                                  fontWeight: register == value
                                                      ? FontWeight.w700
                                                      : FontWeight.w500,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                                const SizedBox(height: 24),
                                if (register) ...[
                                  SegmentedButton<bool>(
                                    segments: [
                                      ButtonSegment(
                                        value: false,
                                        label: Text(tr('متدرب', 'Trainee')),
                                        icon: const Icon(
                                          Icons.person_outline,
                                          size: 18,
                                        ),
                                      ),
                                      ButtonSegment(
                                        value: true,
                                        label: Text(
                                          tr('صاحب جيم', 'Gym owner'),
                                        ),
                                        icon: const Icon(
                                          Icons.storefront_outlined,
                                          size: 18,
                                        ),
                                      ),
                                    ],
                                    selected: {owner},
                                    onSelectionChanged: busy
                                        ? null
                                        : (v) =>
                                              setState(() => owner = v.first),
                                  ),
                                  const SizedBox(height: 22),
                                ],
                                AutofillGroup(
                                  child: Form(
                                    key: form,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        if (register) ...[
                                          field(
                                            'displayName',
                                            'الاسم بالكامل',
                                            'Full name',
                                          ),
                                          field(
                                            'email',
                                            'الإيميل',
                                            'Email address',
                                            keyboard:
                                                TextInputType.emailAddress,
                                          ),
                                          field(
                                            'phone',
                                            'رقم الموبايل',
                                            'Mobile number',
                                            keyboard: TextInputType.phone,
                                          ),
                                        ] else
                                          field(
                                            'identifier',
                                            'الإيميل أو رقم الموبايل',
                                            'Email or mobile number',
                                            keyboard:
                                                TextInputType.emailAddress,
                                          ),
                                        field(
                                          'password',
                                          'كلمة السر',
                                          'Password',
                                        ),
                                        if (register && owner) ...[
                                          Text(
                                            tr('بيانات الجيم', 'Gym details'),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 17,
                                            ),
                                          ),
                                          const SizedBox(height: 16),
                                          field(
                                            'gymName',
                                            'اسم الجيم',
                                            'Gym name',
                                          ),
                                          field(
                                            'governorate',
                                            'المحافظة',
                                            'Governorate',
                                          ),
                                          field(
                                            'city',
                                            'المدينة أو المنطقة',
                                            'City or area',
                                          ),
                                          field(
                                            'address',
                                            'العنوان بالتفصيل',
                                            'Full address',
                                          ),
                                          field(
                                            'description',
                                            'نبذة عن الجيم',
                                            'About your gym',
                                            optional: true,
                                          ),
                                          Text(
                                            tr(
                                              'طلبك هيوصل للإدارة للمراجعة. تقدر تتابع حالته بعد التسجيل.',
                                              'Your application goes to the platform team for review. Track its status after signing up.',
                                            ),
                                            style: const TextStyle(
                                              color: muted,
                                              fontSize: 12,
                                            ),
                                          ),
                                          const SizedBox(height: 16),
                                        ],
                                        if (error != null)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              bottom: 16,
                                            ),
                                            child: Semantics(
                                              liveRegion: true,
                                              child: Text(
                                                errorText,
                                                style: const TextStyle(
                                                  color: Color(0xffa13746),
                                                ),
                                              ),
                                            ),
                                          ),
                                        FilledButton(
                                          onPressed: busy ? null : submit,
                                          style: FilledButton.styleFrom(
                                            backgroundColor: _authTeal,
                                            minimumSize: const Size.fromHeight(
                                              54,
                                            ),
                                            shape: const StadiumBorder(),
                                          ),
                                          child: busy
                                              ? Semantics(
                                                  label: tr(
                                                    'جاري التنفيذ',
                                                    'Please wait',
                                                  ),
                                                  child: const SizedBox(
                                                    width: 21,
                                                    height: 21,
                                                    child:
                                                        CircularProgressIndicator(
                                                          strokeWidth: 2,
                                                          color: Colors.white,
                                                        ),
                                                  ),
                                                )
                                              : Text(
                                                  register
                                                      ? (owner
                                                            ? tr(
                                                                'إنشاء حساب وإرسال الطلب',
                                                                'Create account & apply',
                                                              )
                                                            : tr(
                                                                'إنشاء حساب متدرب',
                                                                'Create trainee account',
                                                              ))
                                                      : tr(
                                                          'تسجيل الدخول',
                                                          'Log in',
                                                        ),
                                                ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 25),
                                Row(
                                  children: [
                                    const Expanded(child: Divider()),
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                      ),
                                      child: Text(
                                        tr(
                                          'أو كمّل باستخدام',
                                          'Or continue with',
                                        ),
                                        style: const TextStyle(
                                          fontSize: 12,
                                          color: muted,
                                        ),
                                      ),
                                    ),
                                    const Expanded(child: Divider()),
                                  ],
                                ),
                                const SizedBox(height: 16),
                                Row(
                                  children: [
                                    Expanded(
                                      child: _SocialButton(
                                        provider: 'Google',
                                        soon: tr('قريبًا', 'Soon'),
                                        onPressed: busy
                                            ? null
                                            : () => social(context, 'Google'),
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: _SocialButton(
                                        provider: 'Apple',
                                        soon: tr('قريبًا', 'Soon'),
                                        onPressed: busy
                                            ? null
                                            : () => social(context, 'Apple'),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 13),
                                TextButton(
                                  onPressed: busy
                                      ? null
                                      : () => changeMode(!register),
                                  child: Text(
                                    register
                                        ? tr(
                                            'عندك حساب؟ سجّل دخولك',
                                            'Already a member? Log in',
                                          )
                                        : tr(
                                            'جديد معانا؟ أنشئ حساب',
                                            'New here? Create an account',
                                          ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 12),
                                  ),
                                ),
                                TextButton(
                                  onPressed: busy
                                      ? null
                                      : () => open(
                                          context,
                                          AcceptInviteScreen(api: widget.api),
                                        ),
                                  child: Text(
                                    tr(
                                      'عندك دعوة؟ اقبلها من هنا',
                                      'Have an invitation? Accept it here',
                                    ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: muted,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                const Text(
                                  'GYM NETWORK · SHO TECH',
                                  textAlign: TextAlign.center,
                                  textDirection: TextDirection.ltr,
                                  style: TextStyle(
                                    fontSize: 9,
                                    letterSpacing: 1.5,
                                    color: muted,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class _SocialButton extends StatelessWidget {
  final String provider, soon;
  final VoidCallback? onPressed;
  const _SocialButton({
    required this.provider,
    required this.soon,
    required this.onPressed,
  });
  @override
  Widget build(BuildContext context) => OutlinedButton(
    key: ValueKey('auth.social.$provider'),
    onPressed: onPressed,
    style: OutlinedButton.styleFrom(
      foregroundColor: ink,
      backgroundColor: const Color(0xfff7f8f9),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 11),
      side: BorderSide.none,
      shape: const StadiumBorder(),
    ),
    child: Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          textDirection: TextDirection.ltr,
          children: [
            if (provider == 'Apple')
              const Icon(Icons.apple, size: 23, color: Colors.black)
            else
              const SizedBox(
                width: 20,
                height: 20,
                child: CustomPaint(painter: _GoogleMark()),
              ),
            const SizedBox(width: 8),
            Text(
              provider,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(soon, style: const TextStyle(fontSize: 10, color: muted)),
      ],
    ),
  );
}

class _GoogleMark extends CustomPainter {
  const _GoogleMark();
  @override
  void paint(Canvas canvas, Size size) {
    final rect = Rect.fromLTWH(2, 2, size.width - 4, size.height - 4);
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    for (final piece in [
      (0.0, .55, const Color(0xff4285f4)),
      (.55, .7, const Color(0xff34a853)),
      (1.25, .4, const Color(0xfffbbc05)),
      (1.65, .67, const Color(0xffea4335)),
    ]) {
      p.color = piece.$3;
      canvas.drawArc(rect, piece.$1 * math.pi, piece.$2 * math.pi, false, p);
    }
    canvas.drawLine(
      Offset(size.width / 2, size.height / 2),
      Offset(size.width - 1, size.height / 2),
      Paint()
        ..color = const Color(0xff4285f4)
        ..strokeWidth = 4,
    );
  }

  @override
  bool shouldRepaint(covariant _GoogleMark oldDelegate) => false;
}

class _AuthBackdrop extends CustomPainter {
  const _AuthBackdrop();
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = Colors.white.withValues(alpha: .045)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.3;
    for (var i = 0; i < 4; i++) {
      canvas.drawCircle(
        Offset(i.isEven ? -20 : size.width + 20, size.height * .6),
        65 + i * 24,
        p,
      );
    }
    canvas.save();
    canvas.translate(size.width * .5, size.height + 12);
    canvas.rotate(-.32);
    canvas.drawLine(
      const Offset(-92, 0),
      const Offset(92, 0),
      p..strokeWidth = 8,
    );
    for (final side in [-1, 1]) {
      for (var i = 0; i < 3; i++) {
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromCenter(
              center: Offset(side * (65.0 + i * 16), 0),
              width: 12,
              height: 76.0 - i * 17,
            ),
            const Radius.circular(3),
          ),
          p..strokeWidth = 3,
        );
      }
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _AuthBackdrop oldDelegate) => false;
}

class ApplicationScreen extends StatefulWidget {
  final ApiClient api;
  final Json application;
  final VoidCallback refresh;
  const ApplicationScreen({
    super.key,
    required this.api,
    required this.application,
    required this.refresh,
  });
  @override
  State<ApplicationScreen> createState() => _ApplicationScreenState();
}

class _ApplicationScreenState extends State<ApplicationScreen> {
  bool busy = false;
  Object? error;
  @override
  Widget build(BuildContext context) {
    final a = widget.application, rejected = a['status'] == 'REJECTED';
    return Screen(
      title: 'طلب انضمامك',
      actions: [
        IconButton(
          tooltip: 'تسجيل الخروج',
          onPressed: busy
              ? null
              : () async {
                  setState(() => busy = true);
                  try {
                    await widget.api.logout();
                  } catch (e) {
                    if (mounted) setState(() => error = e);
                  } finally {
                    if (mounted) setState(() => busy = false);
                  }
                },
          icon: const Icon(Icons.logout_rounded),
        ),
      ],
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 30),
          EmptyState(
            rejected ? 'طلبك محتاج تعديل' : 'طلبك وصلنا',
            icon: rejected
                ? Icons.edit_note_rounded
                : Icons.hourglass_bottom_rounded,
            detail: rejected
                ? 'راجع سبب الرفض وعدّل البيانات وأعد إرسالها.'
                : 'بنراجع بيانات ${a['gymName']}. هتقدر تدير جيمك بمجرد الموافقة.',
          ),
          const SizedBox(height: 20),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusPill(a['status']),
                Fact('الجيم', '${a['gymName']}'),
                Fact('المكان', '${a['governorate']} · ${a['city']}'),
                Text('${a['address']}'),
                if (a['reviewReason'] != null) ...[
                  const Divider(),
                  Text('${a['reviewReason']}'),
                ],
              ],
            ),
          ),
          ErrorNote(error),
          const SizedBox(height: 20),
          ActionButton(
            'تحديث حالة الطلب',
            onPressed: widget.refresh,
            icon: Icons.refresh_rounded,
          ),
          if (rejected)
            TextButton(
              onPressed: () async {
                final changed = await open<bool>(
                  context,
                  ResubmitApplication(api: widget.api, application: a),
                );
                if (changed == true) widget.refresh();
              },
              child: const Text('تعديل البيانات وإعادة التقديم'),
            ),
        ],
      ),
    );
  }
}

class ResubmitApplication extends StatefulWidget {
  final ApiClient api;
  final Json application;
  const ResubmitApplication({
    super.key,
    required this.api,
    required this.application,
  });
  @override
  State<ResubmitApplication> createState() => _ResubmitApplicationState();
}

class _ResubmitApplicationState extends State<ResubmitApplication> {
  final form = GlobalKey<FormState>();
  late final fields = {
    for (final k in [
      'gymName',
      'description',
      'governorate',
      'city',
      'address',
    ])
      k: TextEditingController(text: '${widget.application[k] ?? ''}'),
  };
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    for (final c in fields.values) c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'تعديل طلب الانضمام',
    child: Form(
      key: form,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          for (final entry in fields.entries)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: TextFormField(
                controller: entry.value,
                enabled: !busy,
                decoration: InputDecoration(
                  labelText: {
                    'gymName': 'اسم الجيم',
                    'description': 'نبذة',
                    'governorate': 'المحافظة',
                    'city': 'المدينة',
                    'address': 'العنوان',
                  }[entry.key],
                ),
                validator: (s) =>
                    entry.key != 'description' && (s ?? '').trim().length < 2
                    ? 'كمّل البيانات'
                    : null,
              ),
            ),
          ErrorNote(error),
          ActionButton(
            'إعادة إرسال الطلب',
            busy: busy,
            onPressed: () async {
              if (busy || !form.currentState!.validate()) return;
              setState(() => busy = true);
              try {
                await widget.api.request(
                  'me/gym-application/resubmit',
                  method: 'POST',
                  body: {
                    'expectedVersion': widget.application['version'],
                    for (final e in fields.entries) e.key: e.value.text,
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
        ],
      ),
    ),
  );
}

class AcceptInviteScreen extends StatefulWidget {
  final ApiClient api;
  const AcceptInviteScreen({super.key, required this.api});
  @override
  State<AcceptInviteScreen> createState() => _AcceptInviteScreenState();
}

class _AcceptInviteScreenState extends State<AcceptInviteScreen> {
  final link = TextEditingController(), password = TextEditingController();
  bool busy = false;
  Object? error;
  @override
  void dispose() {
    link.dispose();
    password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Screen(
    title: 'قبول دعوة',
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text(
          'الصق رابط الدعوة اللي وصلك من الأدمن أو صاحب الجيم. اختار كلمة سر جديدة، أو اكتب الحالية لو عندك حساب.',
        ),
        const SizedBox(height: 22),
        TextField(
          controller: link,
          enabled: !busy,
          textDirection: TextDirection.ltr,
          decoration: const InputDecoration(labelText: 'رابط أو رمز الدعوة'),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: password,
          enabled: !busy,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'كلمة السر'),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          'قبول الدعوة والدخول',
          busy: busy,
          onPressed: () async {
            if (busy) return;
            setState(() => busy = true);
            try {
              final uri = Uri.tryParse(link.text.trim());
              final token = uri != null && uri.hasFragment
                  ? Uri.splitQueryString(uri.fragment)['invite']
                  : link.text.trim();
              if (token == null ||
                  !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(token))
                throw const ApiFailure('INVALID_INPUT');
              await widget.api.authenticate('auth/invitations/accept', {
                'token': token,
                'password': password.text,
              });
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
