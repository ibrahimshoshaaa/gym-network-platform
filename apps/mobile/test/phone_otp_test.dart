import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/screens/phone_otp.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
  testWidgets('SMS recovery returns a missing account failure to the phone form',(t)async{
    Object? failure;
    final api=client('TRAINEE',(_)async=>reply({'challengeId':'sms-reset','retryAfterSeconds':60,'testMode':true}));
    await t.pumpWidget(page(Builder(builder:(context)=>TextButton(onPressed:()async{
      try{await requestPhoneCode(context,api,'01055550123','RESET',onConfirm:(_)async=>throw const ApiFailure('PHONE_ACCOUNT_NOT_FOUND'));}catch(e){failure=e;}
    },child:const Text('recover')))));
    await t.tap(find.text('recover'));await t.pumpAndSettle();
    await t.ensureVisible(find.text('متابعة'));await t.tap(find.text('متابعة'));await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('phone.otp.code')),findsNothing);
    expect(failure,isA<ApiFailure>().having((e)=>e.code,'code','PHONE_ACCOUNT_NOT_FOUND'));
    expect('$failure',contains('لا يوجد حساب'));expect(t.takeException(),isNull);
  });
  for (final input in ['٠١٢٣٤٥', '۰۱۲۳۴۵']) {
    testWidgets('live code input $input submits ASCII and preserves its leading zero', (t) async {
      Json? proof;
      final api = client('TRAINEE', (_) async => reply({'challengeId': 'live-localized', 'retryAfterSeconds': 60, 'testMode': false}));
      await t.pumpWidget(page(Builder(builder: (context) => TextButton(
        onPressed: () => requestPhoneCode(context, api, '+201055550123', 'REGISTER', onConfirm: (value) async { proof = value; }),
        child: const Text('start localized'),
      ))));
      await t.tap(find.text('start localized')); await t.pumpAndSettle();
      expect(find.textContaining('مكتوب بالكلمات'), findsOneWidget);
      await t.enterText(find.byKey(const ValueKey('phone.otp.code')), input);
      await t.ensureVisible(find.text('متابعة')); await t.tap(find.text('متابعة')); await t.pumpAndSettle();
      expect(proof?['code'], '012345'); expect(t.takeException(), isNull);
    });
  }
  testWidgets('live SMS code is blank and does not show the fixed test code', (t) async {
    final api = client('TRAINEE', (_) async => reply({'challengeId': 'live-challenge', 'retryAfterSeconds': 60, 'testMode': false}));
    await t.pumpWidget(page(Builder(builder: (context) => TextButton(
      onPressed: () => requestPhoneCode(context, api, '+201055550123', 'REGISTER'),
      child: const Text('start live'),
    ))));
    await t.tap(find.text('start live')); await t.pumpAndSettle();
    expect(t.widget<TextField>(find.byKey(const ValueKey('phone.otp.code'))).controller!.text, isEmpty);
    expect(find.textContaining('123456'), findsNothing);
    expect(t.takeException(), isNull);
    await t.pumpWidget(const SizedBox()); await t.pump();
  });
  testWidgets('a rejected code stays open and can be corrected without another challenge', (t) async {
    var challenges = 0, confirmations = 0;
    final api = client('TRAINEE', (r) async {
      challenges++;
      return reply({'challengeId': 'test-challenge', 'retryAfterSeconds': 60, 'testMode': true});
    });
    Json? accepted;
    await t.pumpWidget(page(Builder(builder: (context) => TextButton(
      onPressed: () async {
        accepted = await requestPhoneCode(context, api, '+201055550123', 'REGISTER', onConfirm: (proof) async {
          confirmations++;
          if (proof['code'] != '123456') throw const ApiFailure('PHONE_OTP_INVALID');
        });
      }, child: const Text('start'),
    ))));
    await t.tap(find.text('start'));
    await t.pumpAndSettle();
    expect(t.widget<TextField>(find.byKey(const ValueKey('phone.otp.code'))).controller!.text, '123456');
    expect(confirmations, 0);
    await t.enterText(find.byKey(const ValueKey('phone.otp.code')), '000000');
    await t.ensureVisible(find.text('متابعة')); await t.tap(find.text('متابعة'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('phone.otp.code')), findsOneWidget);
    expect(challenges, 1);
    expect(accepted, isNull);
    await t.enterText(find.byKey(const ValueKey('phone.otp.code')), '123456');
    await t.ensureVisible(find.text('متابعة')); await t.tap(find.text('متابعة'));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('phone.otp.code')), findsNothing);
    expect(accepted?['code'], '123456');
    expect(confirmations, 2);
    expect(challenges, 1);
    expect(t.takeException(), isNull);
  });
  testWidgets('reset verifies code before showing passwords and preserves the proof until save', (t) async {
    t.view.physicalSize = const Size(375, 812);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize); addTearDown(t.view.resetDevicePixelRatio);
    final calls = <String>[];
    final api = client('TRAINEE', (r) async {
      if (r.url.path.endsWith('/status')) return reply({'smsEnabled':true,'whatsappEnabled':false});
      calls.add(r.url.path);
      if (r.url.path.endsWith('/challenge')) return reply({'challengeId': 'reset-proof', 'testMode': true});
      final body = jsonDecode(r.body);
      expect(body['challengeId'], 'reset-proof'); expect(body['code'], '123456');
      if (r.url.path.endsWith('/verify')) { expect(body.containsKey('newPassword'), false); return reply({'ok': true}); }
      expect(body['newPassword'], '87654321'); return reply({'ok': true});
    });
    await t.pumpWidget(page(PhonePasswordReset(api: api)));
    expect(find.byKey(const ValueKey('phone.reset.password')), findsNothing);
    await t.enterText(find.byKey(const ValueKey('phone.reset.phone')), '01055550123');
    await t.tap(find.text('متابعة للكود')); await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('phone.method.sms'))); await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('phone.otp.code')), findsOneWidget);
    expect(find.byKey(const ValueKey('phone.reset.password')), findsNothing);
    await t.ensureVisible(find.text('متابعة')); await t.tap(find.text('متابعة')); await t.pumpAndSettle();
    expect(calls.last, endsWith('/auth/phone/reset/verify'));
    await t.enterText(find.byKey(const ValueKey('phone.reset.password')), '87654321');
    await t.enterText(find.byKey(const ValueKey('phone.reset.confirmation')), 'wrong');
    await t.ensureVisible(find.text('حفظ كلمة السر')); await t.tap(find.text('حفظ كلمة السر')); await t.pumpAndSettle();
    expect(calls.where((p) => p.endsWith('/reset')), isEmpty);
    await t.enterText(find.byKey(const ValueKey('phone.reset.confirmation')), '87654321');
    FocusManager.instance.primaryFocus?.unfocus(); await t.pumpAndSettle();
    await t.ensureVisible(find.text('حفظ كلمة السر')); await t.tap(find.text('حفظ كلمة السر')); await t.pumpAndSettle();
    expect(calls.last, endsWith('/auth/phone/reset'));
    expect(find.text('كلمة السر اتغيّرت'), findsOneWidget); expect(t.takeException(), isNull);
  }, variant: TargetPlatformVariant({TargetPlatform.iOS, TargetPlatform.android}));

}
