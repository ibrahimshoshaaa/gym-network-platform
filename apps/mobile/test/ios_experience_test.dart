import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/account.dart';
import 'package:gym_network/screens/phone_otp.dart';
import 'native_flows_test.dart' show fake, response;
import 'operations_test.dart' show client, page, reply;

void main() {
  testWidgets('iPhone safe areas and keyboard keep phone login reachable', (t) async {
    t.view.physicalSize = const Size(375, 812);
    t.view.devicePixelRatio = 1;
    t.view.padding = const FakeViewPadding(top: 44, bottom: 34);
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    addTearDown(t.view.resetPadding);
    addTearDown(t.view.resetViewInsets);
    final api = fake((_) async => response('{}', 200));
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const ValueKey('auth.identifier')), '01055550915');
    t.view.viewInsets = const FakeViewPadding(bottom: 336);
    await t.pumpAndSettle();
    await t.ensureVisible(find.byKey(const ValueKey('auth.password')));
    await t.enterText(find.byKey(const ValueKey('auth.password')), 'A memorable password');
    await t.pumpAndSettle();
    expect(t.takeException(), isNull);
    FocusManager.instance.primaryFocus?.unfocus();
    t.view.viewInsets = const FakeViewPadding();
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.byKey(const ValueKey('auth.language')), -250,
        scrollable: find.byType(Scrollable).first);
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('auth.language')));
    await t.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    expect(find.text('Forgot password?'), findsOneWidget);
    await t.ensureVisible(find.text('Forgot password?'));
    await t.pumpAndSettle();
    await t.tap(find.text('Forgot password?'));
    await t.pumpAndSettle();
    expect(find.text('Reset password'), findsOneWidget);
    expect(Directionality.of(t.element(find.byKey(const ValueKey('phone.reset.phone')))), TextDirection.ltr);
    expect(t.takeException(), isNull);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('English OTP remains open and disables back during confirmation', (t) async {
    final done = Completer<void>();
    final api = client('TRAINEE', (_) async => reply({'challengeId': 'challenge', 'testMode': true}));
    await t.pumpWidget(page(Builder(builder: (context) => TextButton(
      onPressed: () async {
        await requestPhoneCode(context, api, '01055550915', 'REGISTER', english: true,
            onConfirm: (_) => done.future);
      }, child: const Text('start'),
    ))));
    await t.tap(find.text('start'));
    await t.pumpAndSettle();
    expect(find.text('Verify mobile number'), findsOneWidget);
    expect(Directionality.of(t.element(find.byKey(const ValueKey('phone.otp.code')))), TextDirection.ltr);
    await t.ensureVisible(find.text('Continue')); await t.tap(find.text('Continue'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(t.widget<TextButton>(find.widgetWithText(TextButton, 'Change number')).onPressed, isNull);
    await t.binding.handlePopRoute();
    await t.pump();
    expect(find.byKey(const ValueKey('phone.otp.code')), findsOneWidget);
    done.complete();
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('phone.otp.code')), findsNothing);
    expect(t.takeException(), isNull);
  });

  testWidgets('phone-only account does not display a null email', (t) async {
    final api = client('TRAINEE', (_) async => reply({'items': []}));
    api.user = {...api.user!, 'phone': '+201055550915', 'email': null};
    await t.pumpWidget(page(AccountScreen(api: api)));
    await t.pumpAndSettle();
    expect(find.text('null'), findsNothing);
    expect(find.text('+201055550915'), findsOneWidget);
    expect(t.takeException(), isNull);
  });
}
