import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/screens/phone_otp.dart';
import 'package:gym_network/screens/whatsapp_phone_flow.dart';
import 'package:gym_network/screens/whatsapp_verification.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
  testWidgets('WhatsApp details do not request a code; SMS fallback requests it once', (t) async {
    var requests = 0;
    final api = client('TRAINEE', (r) async { if (r.url.path.endsWith('/status')) return reply({'smsEnabled':true,'whatsappEnabled':false}); requests++; return reply({'challengeId': 'sms', 'testMode': true}); });
    await t.pumpWidget(page(Builder(builder: (context) => TextButton(
      onPressed: () => choosePhoneVerification(context, api, '+201055550123', 'REGISTER'), child: const Text('start'),
    ))));
    await t.tap(find.text('start')); await t.pumpAndSettle();
    expect(requests, 0);
    await t.tap(find.byKey(const ValueKey('phone.method.whatsapp'))); await t.pumpAndSettle();
    expect(find.text('واتساب غير متاح حاليًا'), findsOneWidget);
    expect(requests, 0);
    await t.tap(find.text('التحقق برسالة SMS')); await t.pumpAndSettle();
    expect(requests, 1);
    expect(find.byKey(const ValueKey('phone.otp.code')), findsOneWidget);
    await t.pumpWidget(const SizedBox()); await t.pump();
  });
  testWidgets('WhatsApp proof completes only after a server verified response', (t) async {
    var verified = false, confirmations = 0;
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/challenge')) return reply({'challengeId':'wa-proof','whatsappToken':'secret','phone':'+201055549901',
        'expiresAt':DateTime.now().add(const Duration(minutes:5)).toIso8601String(),'whatsappUrl':'https://wa.me/201214829716?text=test'});
      return reply({'status':verified?'verified':'pending'});
    });
    await t.pumpWidget(page(Builder(builder:(context)=>TextButton(onPressed:()=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>
      WhatsappPhoneFlow(api:api,phone:'+201055549901',purpose:'REGISTER',onConfirm:(proof)async{expect(proof['whatsappToken'],'secret');confirmations++;}))),child:const Text('start')))));
    await t.tap(find.text('start'));await t.pumpAndSettle();
    await t.pump(const Duration(seconds:5));await t.pumpAndSettle();expect(confirmations,0);
    verified=true;await t.pump(const Duration(seconds:5));await t.pumpAndSettle();expect(confirmations,1);
    expect(t.takeException(),isNull);
  });
  for (final phase in WhatsappPhase.values) {
    testWidgets('WhatsApp $phase renders on a narrow screen without automatic completion', (t) async {
      t.view.physicalSize = const Size(320, 640); t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize); addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(page(WhatsappVerificationScreen(phone: '+201055550123', phase: phase)));
      await t.pumpAndSettle();
      expect(find.text('تم تأكيد رقمك'), phase == WhatsappPhase.verified ? findsOneWidget : findsNothing);
      expect(t.takeException(), isNull);
    });
  }
}
