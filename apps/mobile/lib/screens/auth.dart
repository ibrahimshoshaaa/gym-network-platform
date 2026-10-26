import '../l10n/language.dart';
import 'account_deletion.dart';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/api.dart';
import '../core/ui.dart';
import 'phone_otp.dart';

const _authTeal = Color(0xff101719);

class AuthScreen extends StatefulWidget {
  final ApiClient api;
  const AuthScreen({super.key, required this.api});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool register = false, owner = false, busy = false, hidden = true;
  bool rememberMe = true;
  bool english = AppLanguage.instance.english, languageChosen = false, savingLanguage = false;
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
      await AppLanguage.instance.restore(widget.api.storage.read, widget.api.storage.write);
      final value = AppLanguage.instance.code;
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
      await AppLanguage.instance.select(english ? 'en' : 'ar');
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
                if (!phoneOtpPreview) 'email',
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
      if(register&&phoneOtpPreview){
        await choosePhoneVerification(context,widget.api,fields['phone']!.text,'REGISTER',english:english,onConfirm:(proof)async{
          await widget.api.authenticate('auth/phone/register',<String,dynamic>{
            'displayName':body['displayName'],'phone':body['phone'],'password':body['password'],...proof,
            'accountType':owner?'owner':'trainee',
            if(owner)'gym':{for(final k in ['gymName','description','governorate','city','address'])k:body[k]},
          },rememberSession:true);
        });
      }else{
        await widget.api.authenticate(register?(owner?'auth/owners/register':'auth/register'):'auth/signin',body,rememberSession:register||rememberMe);
      }
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
              hintText: tr(appText('s274', [ar]), 'Enter ${en.toLowerCase()}'),
              helperText: password && register
                  ? tr(
                      appText('s275'),
                      'At least 15 characters. Try a memorable phrase.',
                    )
                  : null,
              helperMaxLines: 2,
              errorMaxLines: 2,
              prefixIcon: Icon(
                password
                    ? Icons.lock_outline_rounded
                    : k == 'email'
                    ? Icons.mail_outline_rounded
                    : k == 'phone' || k == 'identifier'
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
                          ? tr(appText('s276'), 'Show password')
                          : tr(appText('s277'), 'Hide password'),
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
                return tr(appText('s274', [ar]), '$en is required');
              if (password && register && v.runes.length < 15)
                return tr(
                  appText('s278'),
                  'Use at least 15 characters',
                );
              if (k == 'email' && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(v.trim()))
                return tr(appText('s279'), 'Enter a valid email address');
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
        'Your mobile number or password is incorrect.',
      'ACCOUNT_UNAVAILABLE' =>
        'This mobile number is already registered. Try signing in.',
      'INVALID_INPUT' => 'Check the required fields and try again.',
      'RATE_LIMITED' => 'Too many attempts. Please wait and try again.',
      _ => 'Unable to connect right now. Please try again.',
    };
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Localizations.override(
    context: context,
    locale: Locale(english ? 'en' : 'ar'),
    child: Builder(
      builder: (context) { AppLanguage.watch(context); return  Directionality(
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
                                            english ? appText('s280') : 'English',
                                            style: const TextStyle(
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: ColorFiltered(
                                      colorFilter: ColorFilter.matrix([0, -1.05217, 0, 0, 242, 0, -.06087, 0, 0, 244, 0, -.34348, 0, 0, 247, 0, 0, 0, 1, 0]),
                                      child: Image.asset(
                                        'assets/brand/gymbank-wordmark.png',
                                        width: 200,
                                        height: 50,
                                        semanticLabel: 'GymBank',
                                      ),
                                      ),
                                    ),
                                    const SizedBox(height: 19),
                                    Text(
                                      register
                                          ? tr(
                                              appText('s281'),
                                              'Your next chapter',
                                            )
                                          : tr(
                                              appText('s282'),
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
                                              appText('s283'),
                                              'One account. A world of gyms.',
                                            )
                                          : tr(
                                              appText('s284'),
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
                                                    ? tr(appText('s285'), 'Sign up')
                                                    : tr(appText('s286'), 'Log in'),
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
                                if(phoneOtpPreview)...[
                                  Text(tr(appText('s287'),'Register with your mobile number and confirm it with a verification code.'),style:TextStyle(color:muted,fontSize:12)),
                                  const SizedBox(height:12),
                                ],
                                if (register) ...[
                                  IntrinsicHeight(
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.stretch,
                                      children: [
                                        for (final value in [false, true]) ...[
                                          if (value) const SizedBox(width: 12),
                                          Expanded(
                                            child: _RoleChoice(
                                              selected: owner == value,
                                              title: value
                                                  ? tr(appText('s288'), 'Gym owner')
                                                  : tr(appText('s289'), 'Trainee'),
                                              detail: value
                                                  ? tr(
                                                      appText('s290'),
                                                      'Manage your gyms',
                                                    )
                                                  : tr(
                                                      appText('s291'),
                                                      'Find your next workout',
                                                    ),
                                              icon: value
                                                  ? Icons.storefront_outlined
                                                  : Icons
                                                        .fitness_center_rounded,
                                              onPressed: busy
                                                  ? null
                                                  : () => setState(
                                                      () => owner = value,
                                                    ),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
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
                                            appText('s292'),
                                            'Full name',
                                          ),
                                          if (!phoneOtpPreview) field(
                                            'email',
                                            appText('s293'),
                                            'Email address',
                                            keyboard:
                                                TextInputType.emailAddress,
                                          ),
                                          field(
                                            'phone',
                                            appText('s294'),
                                            'Mobile number',
                                            keyboard: TextInputType.phone,
                                          ),
                                        ] else
                                          field(
                                            'identifier',
                                            appText('s294'),
                                            'Mobile number',
                                            keyboard: TextInputType.phone,
                                          ),
                                        field(
                                          'password',
                                          appText('s295'),
                                          'Password',
                                        ),
                                        if (register && owner) ...[
                                          Text(
                                            tr(appText('s296'), 'Gym details'),
                                            style: const TextStyle(
                                              fontWeight: FontWeight.w800,
                                              fontSize: 17,
                                            ),
                                          ),
                                          const SizedBox(height: 16),
                                          field(
                                            'gymName',
                                            appText('s297'),
                                            'Gym name',
                                          ),
                                          field(
                                            'governorate',
                                            appText('s298'),
                                            'Governorate',
                                          ),
                                          field(
                                            'city',
                                            appText('s299'),
                                            'City or area',
                                          ),
                                          field(
                                            'address',
                                            appText('s300'),
                                            'Full address',
                                          ),
                                          field(
                                            'description',
                                            appText('s301'),
                                            'About your gym',
                                            optional: true,
                                          ),
                                          Text(
                                            tr(
                                              appText('s302'),
                                              'Your application goes to the platform team for review. Track its status after signing up.',
                                            ),
                                            style: const TextStyle(
                                              color: muted,
                                              fontSize: 12,
                                            ),
                                          ),
                                          const SizedBox(height: 16),
                                        ],
                                        if (!register) ...[
                                          Material(
                                            color: Colors.transparent,
                                            child: Row(
                                              key: const Key('auth.options'),
                                              children: [
                                                Expanded(child: CheckboxListTile(
                                                  key: const ValueKey('auth.remember'),
                                                  value: rememberMe,
                                                  onChanged: busy ? null : (value) => setState(() => rememberMe = value ?? false),
                                                  contentPadding: EdgeInsets.zero,
                                                  dense: true,
                                                  controlAffinity: ListTileControlAffinity.leading,
                                                  visualDensity: VisualDensity.compact,
                                                  activeColor: _authTeal,
                                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                                  title: Text(tr(appText('s303'), 'Remember me'), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
                                                )),
                                                if (phoneOtpPreview) Expanded(child: Align(
                                                  alignment: AlignmentDirectional.centerEnd,
                                                  child: TextButton(
                                                    key: const Key('auth.forgotPassword'),
                                                    onPressed: busy ? null : () => open(context, PhonePasswordReset(api: widget.api, english: english)),
                                                    style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 12), textStyle: const TextStyle(fontSize: 13)),
                                                    child: Text(tr(appText('s304'), 'Forgot password?'), textAlign: TextAlign.center),
                                                  ),
                                                )),
                                              ],
                                            ),
                                          ),
                                          const SizedBox(height: 12),
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
                                                    appText('s305'),
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
                                                                appText('s306'),
                                                                'Create account & apply',
                                                              )
                                                            : tr(
                                                                appText('s307'),
                                                                'Create trainee account',
                                                              ))
                                                      : tr(
                                                          appText('s308'),
                                                          'Log in',
                                                        ),
                                                ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 20),
                                Wrap(
                                  alignment: WrapAlignment.center,
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    Text(
                                      register
                                          ? tr(
                                              appText('s309'),
                                              'Already a member?',
                                            )
                                          : tr(
                                              appText('s310'),
                                              "Don't have an account?",
                                            ),
                                      style: const TextStyle(
                                        fontSize: 14,
                                        color: muted,
                                      ),
                                    ),
                                    TextButton(
                                      key: const ValueKey('auth.mode.link'),
                                      onPressed: busy
                                          ? null
                                          : () => changeMode(!register),
                                      style: TextButton.styleFrom(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 10,
                                        ),
                                      ),
                                      child: Text(
                                        register
                                            ? tr(appText('s311'), 'Log in')
                                            : tr(
                                                appText('s312'),
                                                'Create account',
                                              ),
                                        style: const TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                OutlinedButton.icon(
                                  key: const ValueKey('auth.invitation'),
                                  onPressed: busy
                                      ? null
                                      : () => open(
                                          context,
                                          AcceptInviteScreen(api: widget.api),
                                        ),
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: _authTeal,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 16,
                                      vertical: 12,
                                    ),
                                    side: const BorderSide(
                                      color: Color(0xffe1e8eb),
                                    ),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(14),
                                    ),
                                  ),
                                  icon: const Icon(
                                    Icons.mark_email_unread_outlined,
                                    size: 19,
                                  ),
                                  label: Text(
                                    tr(
                                      appText('s313'),
                                      'Got an invitation? Accept invite',
                                    ),
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 20),
                                const SizedBox(height: 4),
                                const Text(
                                  'GYMBANK · SHO TECH',
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
      ); },
    ),
  ); }
}

class _RoleChoice extends StatelessWidget {
  final bool selected;
  final String title, detail;
  final IconData icon;
  final VoidCallback? onPressed;
  const _RoleChoice({
    required this.selected,
    required this.title,
    required this.detail,
    required this.icon,
    required this.onPressed,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Semantics(
    button: true,
    selected: selected,
    child: Material(
      color: selected ? const Color(0xffedf6f8) : const Color(0xfffafbfc),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(17),
        side: BorderSide(
          color: selected ? _authTeal : const Color(0xffe2e8eb),
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(17),
        child: Padding(
          padding: const EdgeInsets.all(13),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: selected ? _authTeal : muted, size: 23),
              const SizedBox(height: 10),
              Text(
                title,
                style: TextStyle(
                  color: selected ? _authTeal : ink,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 3),
              Text(
                detail,
                style: const TextStyle(color: muted, fontSize: 10, height: 1.5),
              ),
            ],
          ),
        ),
      ),
    ),
  ); }
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
    AppLanguage.watch(context);
    final a = widget.application, rejected = a['status'] == 'REJECTED';
    return Screen(
      title: appText('s314'),
      actions: [
        IconButton(
          tooltip: appText('s5'),
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
          const LanguageSelector(),
          const SizedBox(height: 30),
          EmptyState(
            rejected ? appText('s315') : appText('s316'),
            icon: rejected
                ? Icons.edit_note_rounded
                : Icons.hourglass_bottom_rounded,
            detail: rejected
                ? appText('s317')
                : appText('s318', [a['gymName']]),
          ),
          const SizedBox(height: 20),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                StatusPill(a['status']),
                Fact(appText('s319'), '${a['gymName']}'),
                Fact(appText('s320'), '${a['governorate']} · ${a['city']}'),
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
            appText('s321'),
            onPressed: widget.refresh,
            icon: Icons.refresh_rounded,
          ),
          TextButton(onPressed:busy?null:()=>open(context,AccountDeletionScreen(api:widget.api)),style:TextButton.styleFrom(foregroundColor:const Color(0xffba1a1a)),child:Text(appText('s322'))),
          if (rejected)
            TextButton(
              onPressed: () async {
                final changed = await open<bool>(
                  context,
                  ResubmitApplication(api: widget.api, application: a),
                );
                if (changed == true) widget.refresh();
              },
              child: Text(appText('s323')),
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s324'),
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
                    'gymName': appText('s297'),
                    'description': appText('s325'),
                    'governorate': appText('s298'),
                    'city': appText('s326'),
                    'address': appText('s327'),
                  }[entry.key],
                ),
                validator: (s) =>
                    entry.key != 'description' && (s ?? '').trim().length < 2
                    ? appText('s328')
                    : null,
              ),
            ),
          ErrorNote(error),
          ActionButton(
            appText('s329'),
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
  ); }
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
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Screen(
    title: appText('s330'),
    child: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(
          appText('s331'),
        ),
        const SizedBox(height: 22),
        TextField(
          controller: link,
          enabled: !busy,
          textDirection: TextDirection.ltr,
          decoration: InputDecoration(labelText: appText('s332')),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: password,
          enabled: !busy,
          obscureText: true,
          decoration: InputDecoration(labelText: appText('s295')),
        ),
        ErrorNote(error),
        const SizedBox(height: 20),
        ActionButton(
          appText('s333'),
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
  ); }
}

