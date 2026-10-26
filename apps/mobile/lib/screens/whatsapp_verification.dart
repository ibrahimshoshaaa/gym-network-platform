import '../l10n/language.dart';
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
    AppLanguage.watch(context);
    String tr(String ar, String en) => english ? en : ar;
    final title = switch (phase) {
      WhatsappPhase.unavailable => tr(appText('s546'), 'WhatsApp is currently unavailable'),
      WhatsappPhase.ready => tr(appText('s547'), 'Verify through WhatsApp'),
      WhatsappPhase.waiting => tr(appText('s548'), 'Waiting for your message'),
      WhatsappPhase.expired => tr(appText('s549'), 'Verification expired'),
      WhatsappPhase.verified => tr(appText('s550'), 'Number verified'),
      WhatsappPhase.error => tr(appText('s551'), 'WhatsApp verification failed'),
    };
    final detail = switch (phase) {
      WhatsappPhase.unavailable => tr(appText('s552'), 'You can continue with SMS verification.'),
      WhatsappPhase.ready => tr(appText('s553'), 'Open the chat, send the prepared message from your registered number, then return here.'),
      WhatsappPhase.waiting => tr(appText('s554'), 'Tap Send inside WhatsApp. Opening the chat alone does not verify your number.'),
      WhatsappPhase.expired => tr(appText('s555'), 'Start a new attempt and send the new message. The old one has expired.'),
      WhatsappPhase.verified => tr(appText('s556'), 'You can continue to the next step.'),
      WhatsappPhase.error => tr(appText('s557'), 'Check your connection and try again, or choose SMS.'),
    };
    return Localizations.override(context: context, locale: Locale(english ? 'en' : 'ar'),
      delegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      child: Directionality(textDirection: english ? TextDirection.ltr : TextDirection.rtl,
        child: Screen(title: tr(appText('s558'), 'WhatsApp verification'),
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
                  Text(tr(appText('s559'), '1. Open WhatsApp\n2. Send the prepared message without editing\n3. Return and wait for confirmation')),
                  const SizedBox(height: 20),
                  FilledButton(onPressed: onOpen, child: Text(phase == WhatsappPhase.waiting ? tr(appText('s560'), 'Reopen WhatsApp') : tr(appText('s561'), 'Open WhatsApp to send'))),
                ],
                if (phase == WhatsappPhase.expired || phase == WhatsappPhase.error)
                  OutlinedButton(onPressed: onRetry, child: Text(tr(appText('s562'), 'Try again'))),
                if (phase != WhatsappPhase.verified && onSms != null)
                  FilledButton(onPressed: onSms, child: Text(tr(appText('s563'), 'Verify with SMS'))),
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
  final bool english, whatsappEnabled, smsEnabled;
  const PhoneVerificationMethodScreen({super.key, required this.phone, this.english = false, this.whatsappEnabled = false, this.smsEnabled = true});
  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    String tr(String ar, String en) => english ? en : ar;
    return Directionality(textDirection: english ? TextDirection.ltr : TextDirection.rtl,
      child: Screen(title: tr(appText('s564'), 'Verification method'),
        child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Center(
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 460), child: Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(tr(appText('s565'), 'Choose how to verify'), style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 12), Text(phone, textDirection: TextDirection.ltr, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton.icon(key: const ValueKey('phone.method.sms'), icon: const Icon(Icons.sms_outlined),
                onPressed: smsEnabled ? () => Navigator.pop(context, 'sms') : null, label: Text(tr(appText('s563'), 'Verify with SMS'))),
              const SizedBox(height: 12),
              OutlinedButton.icon(key: const ValueKey('phone.method.whatsapp'), icon: const Icon(Icons.chat_outlined),
                onPressed: () async {
                  if (whatsappEnabled) { Navigator.pop(context, 'whatsapp'); return; }
                  final useSms = await Navigator.push<bool>(context, MaterialPageRoute(builder: (routeContext) { AppLanguage.watch(routeContext); return
                    WhatsappVerificationScreen(phone: phone, english: english,
                      onSms: smsEnabled ? () => Navigator.pop(routeContext, true) : null); }));
                  if (context.mounted && useSms == true) Navigator.pop(context, 'sms');
                }, label: Text(whatsappEnabled ? tr(appText('s558'), 'Verify with WhatsApp') : tr(appText('s566'), 'WhatsApp · currently unavailable'))),
              const SizedBox(height: 12),
              Text(whatsappEnabled ? tr(appText('s567'), 'Send the verification message from this number, then return here.') : tr(appText('s568'), 'With WhatsApp, you send the verification message from this number. Coming soon.'), style: const TextStyle(color: muted)),
            ]),
          )),
        )),
      ),
    );
  }
}
