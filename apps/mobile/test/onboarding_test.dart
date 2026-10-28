import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/auth.dart';
import 'package:gym_network/screens/onboarding.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'api_test.dart' show MemoryStore;

ApiClient _client(MemoryStore store, {Json? user}) => ApiClient(
      storage: store,
      transport: MockClient((_) async => http.Response('{}', 200)),
    )
      ..restored = true
      ..user = user;

void _phoneViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(375, 812);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

class _UnwritablePreferenceStore extends MemoryStore {
  @override
  Future<void> write(String key, String value) async {
    if (key == onboardingStorageKey) throw StateError('storage unavailable');
    await super.write(key, value);
  }
}

void main() {
  testWidgets('the full image treatment fits on a short phone', (t) async {
    t.view.physicalSize = const Size(375, 667);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    final api = _client(MemoryStore());
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    final page = t.getRect(find.byKey(const ValueKey('onboarding.pages')));
    final image = t.getRect(find.byKey(const ValueKey('onboarding.image.s1072')));
    expect(image.bottom, lessThanOrEqualTo(page.bottom + 1));
    expect(t.takeException(), isNull);
  });

  testWidgets('first run can swipe, change language and start registration', (t) async {
    _phoneViewport(t);
    final store = MemoryStore();
    final api = _client(store);
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();

    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(find.text('جيمات أكتر.\nحرية أكبر.'), findsOneWidget);
    expect(t.widget<Image>(find.byKey(const ValueKey('onboarding.image.s1072'))).image,
        isA<AssetImage>());
    await t.drag(find.byKey(const ValueKey('onboarding.pages')), const Offset(300, 0));
    await t.pumpAndSettle();
    expect(find.text('اشحن رصيدك.\nواتمرّن براحتك.'), findsOneWidget);

    await t.tap(find.byKey(const ValueKey('onboarding.language')));
    await t.pumpAndSettle();
    expect(find.text('Top up.\nTrain your way.'), findsOneWidget);
    expect(store.values['app.language'], 'en');
    expect(Directionality.of(t.element(find.byKey(const ValueKey('onboarding.next')))),
        TextDirection.ltr);

    await t.tap(find.byKey(const ValueKey('onboarding.next')));
    await t.pumpAndSettle();
    expect(find.text('Easy entry.\nFocus on your goals.'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('onboarding.next')));
    await t.pumpAndSettle();
    expect(find.byType(OnboardingScreen), findsNothing);
    expect(t.widget<AuthScreen>(find.byType(AuthScreen)).initialRegister, isTrue);
    expect(store.values[onboardingStorageKey], '1');
    expect(t.takeException(), isNull);
  });

  testWidgets('skip opens sign-in and is remembered on a later launch', (t) async {
    _phoneViewport(t);
    final store = MemoryStore();
    final api = _client(store);
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('onboarding.skip')));
    await t.pumpAndSettle();
    expect(t.widget<AuthScreen>(find.byType(AuthScreen)).initialRegister, isFalse);
    expect(store.values[onboardingStorageKey], '1');

    await t.pumpWidget(const SizedBox.shrink());
    await t.pumpWidget(GymNetworkApp(api: _client(store)));
    await t.pumpAndSettle();
    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(AuthScreen), findsOneWidget);
  });

  testWidgets('existing signed-in users bypass the intro even after sign-out', (t) async {
    _phoneViewport(t);
    final store = MemoryStore();
    final api = _client(store, user: {'id': 'existing', 'role': 'OTHER'});
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(SessionGate), findsOneWidget);
    expect(store.values[onboardingStorageKey], '1');

    await api.logout();
    await t.pumpAndSettle();
    expect(find.byType(OnboardingScreen), findsNothing);
    expect(find.byType(AuthScreen), findsOneWidget);
  });

  testWidgets('preference write failure does not block sign-in', (t) async {
    _phoneViewport(t);
    final api = _client(_UnwritablePreferenceStore());
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('onboarding.login')));
    await t.pumpAndSettle();
    expect(find.byType(AuthScreen), findsOneWidget);
    expect(t.takeException(), isNull);
  });

  testWidgets('intro fits an iPhone safe area and large text can scroll', (t) async {
    _phoneViewport(t);
    t.view.padding = const FakeViewPadding(top: 44, bottom: 34);
    addTearDown(t.view.resetPadding);
    final api = _client(MemoryStore());
    await t.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.4)),
        child: GymNetworkApp(api: api),
      ),
    );
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('onboarding.next')), findsOneWidget);
    expect(t.takeException(), isNull);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));
}
