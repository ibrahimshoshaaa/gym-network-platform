import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/screens/phone_otp.dart';
import 'operations_test.dart' show client, page, reply;

void main() {
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
    await t.tap(find.text('متابعة'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(challenges, 1);
    expect(accepted, isNull);
    await t.enterText(find.byKey(const ValueKey('phone.otp.code')), '123456');
    await t.tap(find.text('متابعة'));
    await t.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(accepted?['code'], '123456');
    expect(confirmations, 2);
    expect(challenges, 1);
    expect(t.takeException(), isNull);
  });
}
