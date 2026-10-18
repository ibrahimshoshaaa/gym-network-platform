import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/ui.dart';

class AuthScreen extends StatefulWidget {
  final ApiClient api;
  const AuthScreen({super.key, required this.api});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool register = false, owner = false, busy = false, hidden = true;
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
  @override
  void dispose() {
    for (final c in fields.values) c.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (busy || !form.currentState!.validate()) return;
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
    String label, {
    TextInputType? keyboard,
    bool optional = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: TextFormField(
      controller: fields[k],
      enabled: !busy,
      keyboardType: keyboard,
      obscureText: k == 'password' && hidden,
      textDirection: ['phone', 'email', 'password', 'identifier'].contains(k)
          ? TextDirection.ltr
          : null,
      autofillHints: k == 'password'
          ? [register ? AutofillHints.newPassword : AutofillHints.password]
          : k == 'email'
          ? [AutofillHints.email]
          : null,
      decoration: InputDecoration(
        labelText: label,
        suffixIcon: k == 'password'
            ? IconButton(
                tooltip: hidden ? 'إظهار كلمة السر' : 'إخفاء كلمة السر',
                onPressed: () => setState(() => hidden = !hidden),
                icon: Icon(
                  hidden
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                ),
              )
            : null,
      ),
      validator: (v) {
        if (optional) return null;
        if (v == null || v.trim().isEmpty) return 'اكتب $label';
        if (k == 'password' && register && v.runes.length < 15)
          return '15 حرفًا على الأقل؛ ممكن تستخدم جملة سهلة تحفظها';
        if (k == 'email' && !RegExp(r'^\S+@\S+\.\S+$').hasMatch(v.trim()))
          return 'اكتب إيميل صحيح';
        return null;
      },
    ),
  );
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 30, 24, 28),
            children: [
              const Brand(large: true),
              const SizedBox(height: 30),
              Container(
                height: 126,
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: ink,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: const Row(
                  children: [
                    Expanded(
                      child: Text(
                        'مساحة واحدة.\nكل جيماتك.',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 25,
                          fontWeight: FontWeight.w900,
                          height: 1.35,
                        ),
                      ),
                    ),
                    Icon(Icons.fitness_center_rounded, color: lime, size: 66),
                  ],
                ),
              ),
              const SizedBox(height: 28),
              Text(
                register ? 'خطوتك الأولى تبدأ هنا' : 'أهلًا بيك من جديد',
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              Text(
                register ? 'حساب واحد، تجربة أسهل.' : 'سجّل دخولك وكمل رحلتك.',
                style: const TextStyle(color: muted),
              ),
              const SizedBox(height: 22),
              if (register) ...[
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                      value: false,
                      label: Text('متدرب'),
                      icon: Icon(Icons.person_outline),
                    ),
                    ButtonSegment(
                      value: true,
                      label: Text('صاحب جيم'),
                      icon: Icon(Icons.storefront_outlined),
                    ),
                  ],
                  selected: {owner},
                  onSelectionChanged: busy
                      ? null
                      : (v) => setState(() => owner = v.first),
                ),
                const SizedBox(height: 20),
              ],
              AutofillGroup(
                child: Form(
                  key: form,
                  child: Column(
                    children: [
                      if (register) ...[
                        field('displayName', 'الاسم بالكامل'),
                        field(
                          'email',
                          'الإيميل',
                          keyboard: TextInputType.emailAddress,
                        ),
                        field(
                          'phone',
                          'رقم الموبايل',
                          keyboard: TextInputType.phone,
                        ),
                      ] else
                        field('identifier', 'الإيميل أو رقم الموبايل'),
                      field(
                        'password',
                        register
                            ? 'كلمة السر · 15 حرفًا على الأقل'
                            : 'كلمة السر',
                      ),
                      if (register && owner) ...[
                        const SectionTitle('بيانات الجيم'),
                        field('gymName', 'اسم الجيم'),
                        field('governorate', 'المحافظة'),
                        field('city', 'المدينة أو المنطقة'),
                        field('address', 'العنوان بالتفصيل'),
                        field('description', 'نبذة عن الجيم', optional: true),
                        const Text(
                          'طلبك هيوصل للإدارة للمراجعة. تقدر تتابع حالته بعد التسجيل.',
                          style: TextStyle(color: muted, fontSize: 12),
                        ),
                      ],
                      ErrorNote(error),
                      ActionButton(
                        register
                            ? (owner
                                  ? 'إنشاء حساب وإرسال الطلب'
                                  : 'إنشاء حساب متدرب')
                            : 'تسجيل الدخول',
                        busy: busy,
                        onPressed: submit,
                        icon: Icons.arrow_back_rounded,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: busy
                    ? null
                    : () => setState(() {
                        register = !register;
                        error = null;
                      }),
                child: Text(
                  register ? 'عندك حساب؟ سجّل دخولك' : 'جديد معانا؟ أنشئ حساب',
                ),
              ),
              const SizedBox(height: 18),
              TextButton(
                onPressed: busy
                    ? null
                    : () => open(context, AcceptInviteScreen(api: widget.api)),
                child: const Text('عندك دعوة؟ اقبلها من هنا'),
              ),
              const Text(
                'GYM NETWORK · SHO TECH',
                textAlign: TextAlign.center,
                textDirection: TextDirection.ltr,
                style: TextStyle(fontSize: 10, letterSpacing: 2, color: muted),
              ),
            ],
          ),
        ),
      ),
    ),
  );
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
