import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import '../core/ui.dart';

enum WhatsappPhase { unavailable, ready, waiting, expired, verified, error }

/// Presentation only. The host must obtain a server proof before completing
/// registration/recovery; launching WhatsApp is never evidence of ownership.
class WhatsappVerificationScreen extends StatelessWidget {
  final String phone;
  final bool english;
  final WhatsappPhase phase;
  final VoidCallback? onOpen, onRetry, onSms;
  const WhatsappVerificationScreen({super.key, required this.phone,
    this.english = false, this.phase = WhatsappPhase.unavailable,
    this.onOpen, this.onRetry, this.onSms});

  @override
  Widget build(BuildContext context) {
    String tr(String ar, String en) => english ? en : ar;
    final title = switch (phase) {
      WhatsappPhase.unavailable => tr('واتساب غير متاح حاليًا', 'WhatsApp is currently unavailable'),
      WhatsappPhase.ready => tr('أكّد رقمك عبر واتساب', 'Verify through WhatsApp'),
      WhatsappPhase.waiting => tr('مستنيين رسالتك', 'Waiting for your message'),
      WhatsappPhase.expired => tr('انتهت مهلة التحقق', 'Verification expired'),
      WhatsappPhase.verified => tr('تم تأكيد رقمك', 'Number verified'),
      WhatsappPhase.error => tr('تعذر التحقق عبر واتساب', 'WhatsApp verification failed'),
    };
    final detail = switch (phase) {
      WhatsappPhase.unavailable => tr('تقدر تكمّل التحقق برسالة SMS.', 'You can continue with SMS verification.'),
      WhatsappPhase.ready => tr('هنفتح محادثة برسالة جاهزة. ابعتها من نفس الرقم اللي سجّلت بيه، وبعدها ارجع هنا.', 'Open the chat, send the prepared message from your registered number, then return here.'),
      WhatsappPhase.waiting => tr('اضغط إرسال داخل واتساب. فتح المحادثة لوحده مش بيأكد الرقم.', 'Tap Send inside WhatsApp. Opening the chat alone does not verify your number.'),
      WhatsappPhase.expired => tr('اطلب محاولة جديدة وابعت الرسالة الجديدة؛ الرسالة القديمة مش هتشتغل.', 'Start a new attempt and send the new message. The old one has expired.'),
      WhatsappPhase.verified => tr('تقدر تكمّل الخطوة التالية.', 'You can continue to the next step.'),
      WhatsappPhase.error => tr('راجع اتصالك وحاول تاني، أو اختار SMS.', 'Check your connection and try again, or choose SMS.'),
    };
    return Localizations.override(context: context, locale: Locale(english ? 'en' : 'ar'),
      delegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      child: Directionality(textDirection: english ? TextDirection.ltr : TextDirection.rtl,
        child: Screen(title: tr('التحقق عبر واتساب', 'WhatsApp verification'),
          child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Center(
            child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Icon(phase == WhatsappPhase.verified ? Icons.check_circle_outline : Icons.chat_outlined, color: green, size: 48),
                const SizedBox(height: 20), Text(title, style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 12), Semantics(liveRegion: true, child: Text(detail)),
                const SizedBox(height: 20), Text(phone, textDirection: TextDirection.ltr, textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                const SizedBox(height: 24),
                if (phase == WhatsappPhase.ready || phase == WhatsappPhase.waiting) ...[
                  Text(tr('١. افتح واتساب\n٢. ابعت الرسالة الجاهزة بدون تعديل\n٣. ارجع هنا وانتظر التأكيد', '1. Open WhatsApp\n2. Send the prepared message without editing\n3. Return and wait for confirmation')),
                  const SizedBox(height: 20),
                  FilledButton(onPressed: onOpen, child: Text(phase == WhatsappPhase.waiting ? tr('فتح واتساب مرة تانية', 'Reopen WhatsApp') : tr('فتح واتساب وإرسال الرسالة', 'Open WhatsApp to send'))),
                ],
                if (phase == WhatsappPhase.expired || phase == WhatsappPhase.error)
                  OutlinedButton(onPressed: onRetry, child: Text(tr('محاولة جديدة', 'Try again'))),
                if (phase != WhatsappPhase.verified && onSms != null)
                  FilledButton(onPressed: onSms, child: Text(tr('التحقق برسالة SMS', 'Verify with SMS'))),
              ]),
            )),
          )),
        ),
      ),
    );
  }
}

/// WhatsApp is intentionally unavailable until durable server proofs are wired.
/// The details screen remains reachable for reviewing the new flow.
class PhoneVerificationMethodScreen extends StatelessWidget {
  final String phone;
  final bool english;
  const PhoneVerificationMethodScreen({super.key, required this.phone, this.english = false});
  @override
  Widget build(BuildContext context) {
    String tr(String ar, String en) => english ? en : ar;
    return Directionality(textDirection: english ? TextDirection.ltr : TextDirection.rtl,
      child: Screen(title: tr('طريقة تأكيد الرقم', 'Verification method'),
        child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Center(
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(tr('اختار طريقة التحقق', 'Choose how to verify'), style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 12), Text(phone, textDirection: TextDirection.ltr, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton.icon(key: const ValueKey('phone.method.sms'), icon: const Icon(Icons.sms_outlined),
                onPressed: () => Navigator.pop(context, true), label: Text(tr('التحقق برسالة SMS', 'Verify with SMS'))),
              const SizedBox(height: 12),
              OutlinedButton.icon(key: const ValueKey('phone.method.whatsapp'), icon: const Icon(Icons.chat_outlined),
                onPressed: () async {
                  final useSms = await Navigator.push<bool>(context, MaterialPageRoute(builder: (routeContext) =>
                    WhatsappVerificationScreen(phone: phone, english: english,
                      onSms: () => Navigator.pop(routeContext, true))));
                  if (context.mounted && useSms == true) Navigator.pop(context, true);
                }, label: Text(tr('واتساب · غير متاح حاليًا', 'WhatsApp · currently unavailable'))),
              const SizedBox(height: 12),
              Text(tr('في واتساب هتبعت إنت رسالة التحقق من نفس الرقم. الطريقة دي هتتوفر قريبًا.', 'With WhatsApp, you send the verification message from this number. Coming soon.'), style: const TextStyle(color: muted)),
            ]),
          )),
        )),
      ),
    );
  }
}
