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
        filled: true,
        fillColor: Colors.white,
        prefixIcon: Icon(
          k == 'password'
              ? Icons.lock_outline_rounded
              : k == 'identifier' || k == 'email'
              ? Icons.alternate_email_rounded
              : k == 'phone'
              ? Icons.phone_iphone_rounded
              : k == 'displayName'
              ? Icons.person_outline_rounded
              : Icons.location_on_outlined,
          size: 20,
          color: muted,
        ),
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
            padding: const EdgeInsets.fromLTRB(24, 18, 24, 24),
            children: [
              const _AuthIdentity(),
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
              const SizedBox(height: 2),
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

class _AuthIdentity extends StatelessWidget {
  const _AuthIdentity();
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      const Row(
        children: [
          Brand(),
          SizedBox(width: 12),
          Expanded(
            child: Text(
              'MOVE. CONNECT.',
              textDirection: TextDirection.ltr,
              textAlign: TextAlign.left,
              maxLines: 1,
              style: TextStyle(
                fontSize: 8,
                letterSpacing: .6,
                fontWeight: FontWeight.w800,
                color: muted,
              ),
            ),
          ),
        ],
      ),
      const SizedBox(height: 24),
      ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: SizedBox(
          height: 190,
          child: Stack(
            children: [
              const Positioned.fill(
                child: CustomPaint(painter: _TrackPainter()),
              ),
              Positioned(
                left: 20,
                top: 21,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 5,
                  ),
                  decoration: BoxDecoration(
                    color: lime,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'YOUR NEXT LEVEL',
                    textDirection: TextDirection.ltr,
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                      color: ink,
                    ),
                  ),
                ),
              ),
              const Positioned(
                right: 23,
                bottom: 24,
                left: 55,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'كل تمرينة.\nبداية أقوى.',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 31,
                        height: 1.2,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 10),
                    Text(
                      'جيمات أكتر. حرية أكبر.',
                      style: TextStyle(color: Color(0xffc9d9d5), fontSize: 12),
                    ),
                  ],
                ),
              ),
              const Positioned(
                left: 22,
                bottom: 23,
                child: Icon(Icons.north_west_rounded, color: lime, size: 34),
              ),
            ],
          ),
        ),
      ),
    ],
  );
}

class _TrackPainter extends CustomPainter {
  const _TrackPainter();
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = ink);
    for (var i = 0; i < 5; i++) {
      final path = Path()
        ..moveTo(size.width * .12 + i * 19, -30)
        ..cubicTo(
          size.width * .72 + i * 19,
          35,
          -85 + i * 19,
          size.height * .85,
          size.width * .62 + i * 19,
          size.height + 65,
        );
      canvas.drawPath(
        path,
        Paint()
          ..color = const Color(0xff557a72).withValues(alpha: .32)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.3,
      );
    }
    canvas.drawCircle(
      Offset(size.width - 15, -25),
      85,
      Paint()..color = const Color(0xff244b49),
    );
  }

  @override
  bool shouldRepaint(covariant _TrackPainter oldDelegate) => false;
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
