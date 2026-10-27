import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
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
    var verified = false, confirmations = 0, launches = 0;
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/challenge')) return reply({'challengeId':'wa-proof','whatsappToken':'secret','phone':'+201055549901',
        'expiresAt':DateTime.now().add(const Duration(minutes:5)).toIso8601String(),'whatsappUrl':'https://wa.me/201214829716?text=test'});
      return reply({'status':verified?'verified':'pending'});
    });
    await t.pumpWidget(page(Builder(builder:(context)=>TextButton(onPressed:()=>Navigator.push(context,MaterialPageRoute<void>(builder:(_)=>
      WhatsappPhoneFlow(api:api,phone:'+201055549901',purpose:'REGISTER',launchWhatsapp:(_)async{launches++;return true;},onConfirm:(proof)async{expect(proof['whatsappToken'],'secret');confirmations++;}))),child:const Text('start')))));
    await t.tap(find.text('start'));await t.pumpAndSettle();
    expect(launches,1);expect(find.byKey(const ValueKey('whatsapp.waiting')),findsOneWidget);
    await t.pump(const Duration(seconds:5));await t.pumpAndSettle();expect(confirmations,0);
    verified=true;await t.pump(const Duration(seconds:5));await t.pumpAndSettle();expect(confirmations,0);
    expect(find.byKey(const ValueKey('whatsapp.verified')),findsOneWidget);expect(find.byIcon(Icons.check_circle_rounded),findsOneWidget);
    await t.ensureVisible(find.byKey(const Key('whatsapp.continue')));await t.tap(find.byKey(const Key('whatsapp.continue')));await t.pumpAndSettle();expect(confirmations,1);
    expect(t.takeException(),isNull);
  });
  testWidgets('registered number returns an account failure instead of a WhatsApp connection error', (t) async {
    Object? failure;
    var smsRequests = 0;
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/status')) return reply({'smsEnabled':true,'whatsappEnabled':true});
      if (r.url.path.contains('/phone/')) smsRequests++;
      throw const ApiFailure('ACCOUNT_UNAVAILABLE');
    });
    await t.pumpWidget(page(Scaffold(body:Builder(builder:(context)=>TextButton(
      onPressed:() async {
        try { await choosePhoneVerification(context,api,'01055550123','REGISTER'); }
        catch(e) { failure=e; }
      }, child:const Text('start'))))));
    await t.tap(find.text('start')); await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('phone.method.whatsapp'))); await t.pumpAndSettle();
    expect(failure,isA<ApiFailure>().having((e)=>e.code,'code','ACCOUNT_UNAVAILABLE'));
    expect(find.byType(WhatsappPhoneFlow),findsNothing);
    expect(find.text('تعذر التحقق عبر واتساب'),findsNothing);
    expect(smsRequests,0);
    expect(t.takeException(),isNull);
  });
  testWidgets('connection error stays inside Material with readable text and retries without SMS', (t) async {
    t.view.physicalSize=const Size(320,640); t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize); addTearDown(t.view.resetDevicePixelRatio);
    var attempts=0;
    final api=client('TRAINEE',(r) async {
      if(r.url.path.endsWith('/check'))return reply({'status':'pending'});
      attempts++;
      if(attempts==1) throw const ApiFailure('SERVICE_UNAVAILABLE');
      return reply({'challengeId':'retry','whatsappToken':'token','phone':'01055550123',
        'expiresAt':DateTime.now().add(const Duration(minutes:5)).toIso8601String(),'whatsappUrl':'https://wa.me/201214829716?text=test'});
    });
    await t.pumpWidget(page(WhatsappPhoneFlow(api:api,phone:'01055550123',purpose:'REGISTER',launchWhatsapp:(_)async=>true)));
    await t.pumpAndSettle();
    final note=find.byType(ErrorNote);
    expect(note,findsOneWidget);
    expect(find.ancestor(of:note,matching:find.byType(Scaffold)),findsWidgets);
    final text=t.widget<Text>(find.descendant(of:note,matching:find.byType(Text)).first);
    expect(text.style!.fontSize,14);
    expect(text.style!.inherit,false);
    expect(text.style!.decoration,TextDecoration.none);
    await t.ensureVisible(find.text('محاولة جديدة')); await t.tap(find.text('محاولة جديدة')); await t.pumpAndSettle();
    expect(attempts,2); expect(find.byType(ErrorNote).evaluate().where((e)=>(e.widget as ErrorNote).error!=null),isEmpty);
    expect(t.takeException(),isNull);
    await t.pumpWidget(const SizedBox()); await t.pump();
  });
  for (final phase in WhatsappPhase.values) {
    testWidgets('WhatsApp $phase renders on a narrow screen without automatic completion', (t) async {
      t.view.physicalSize = const Size(320, 640); t.view.devicePixelRatio = 1;
      addTearDown(t.view.resetPhysicalSize); addTearDown(t.view.resetDevicePixelRatio);
      await t.pumpWidget(page(WhatsappVerificationScreen(phone: '+201055550123', phase: phase,onOpen:(){},onSms:(){},onContinue:(){})));
      await t.pumpAndSettle();
      expect(find.text('تم تأكيد رقمك'), phase == WhatsappPhase.verified ? findsOneWidget : findsNothing);
      if(phase==WhatsappPhase.ready||phase==WhatsappPhase.waiting){
        final primary=find.byKey(Key(phase==WhatsappPhase.ready?'whatsapp.open':'whatsapp.reopen'));
        expect(t.getTopLeft(find.byKey(const Key('whatsapp.sms'))).dy-t.getBottomLeft(primary).dy,greaterThanOrEqualTo(14));
      }
      expect(t.takeException(), isNull);
    });
  }
  testWidgets('waiting page is rendered before the external launch finishes and launch failure can retry',(t)async{
    final launch=Completer<bool>();var launches=0,checks=0;
    final api=client('TRAINEE',(r)async{
      if(r.url.path.endsWith('/challenge'))return reply({'challengeId':'wa','whatsappToken':'token','expiresAt':DateTime.now().add(const Duration(minutes:5)).toIso8601String(),'whatsappUrl':'https://wa.me/201214829716?text=test'});
      if(r.url.path.endsWith('/check'))checks++;
      return reply({'status':'pending'});
    });
    await t.pumpWidget(page(WhatsappPhoneFlow(api:api,phone:'01055550123',purpose:'REGISTER',launchWhatsapp:(_){launches++;return launches==1?launch.future:Future.value(true);})));await t.pumpAndSettle();
    expect(launches,1);expect(checks,0);expect(find.byKey(const ValueKey('whatsapp.waiting')),findsOneWidget);
    launch.complete(false);await t.pumpAndSettle();expect(find.byKey(const ValueKey('whatsapp.error')),findsOneWidget);
    await t.ensureVisible(find.text('محاولة جديدة'));await t.tap(find.text('محاولة جديدة'));await t.pumpAndSettle();
    expect(launches,2);expect(checks,1);expect(find.byKey(const ValueKey('whatsapp.waiting')),findsOneWidget);
    await t.pumpWidget(const SizedBox());await t.pump();
  });
}
