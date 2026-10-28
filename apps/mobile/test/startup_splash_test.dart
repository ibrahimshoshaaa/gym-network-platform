import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/main.dart';
import 'package:gym_network/screens/onboarding.dart';
import 'package:gym_network/screens/startup_splash.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'api_test.dart' show MemoryStore;

void main() {
  testWidgets('a slow session restore keeps the splash until the app is ready', (t) async {
    final response = Completer<http.Response>();
    final store = MemoryStore()..values['session'] = 'saved-session';
    final api = ApiClient(storage: store, transport: MockClient((request) {
      return response.future;
    }));

    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('startup.splash')), findsOneWidget);
    expect(find.text('جارٍ التحميل…'), findsOneWidget);
    expect(api.user, isNull);

    response.complete(http.Response('{"id":"existing","role":"OTHER"}', 200));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('startup.splash')), findsNothing);
    expect(find.byType(SessionGate), findsOneWidget);
    expect(api.user?['id'], 'existing');
    expect(t.takeException(), isNull);
  });

  testWidgets('startup animation reaches onboarding without changing the session', (t) async {
    final store = MemoryStore();
    final api = ApiClient(
      storage: store,
      transport: MockClient((_) async => http.Response('{}', 200)),
    )..restored = true;
    await t.pumpWidget(GymNetworkApp(api: api));
    await t.pump();
    expect(find.byKey(const ValueKey('startup.splash')), findsOneWidget);
    expect(find.byKey(const ValueKey('startup.logo.center')), findsOneWidget);
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('startup.splash')), findsNothing);
    expect(find.byType(OnboardingScreen), findsOneWidget);
    expect(api.user, isNull);
    expect(store.values.containsKey('session'), isFalse);
    expect(t.takeException(), isNull);
  });

  testWidgets('reduced motion proceeds as soon as restoration is ready', (t) async {
    var completed = 0;
    Widget host(bool ready) => MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(disableAnimations: true),
            child: StartupSplash(ready: ready, onComplete: () => completed++),
          ),
        );
    await t.pumpWidget(host(false));
    await t.pump();
    expect(completed, 0);
    await t.pumpWidget(host(true));
    await t.pump();
    expect(completed, 1);
  });

  testWidgets('retain startup animation frames for visual review', (t) async {
    t.view.physicalSize = const Size(393, 851);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetPhysicalSize);
    addTearDown(t.view.resetDevicePixelRatio);
    const key = ValueKey('startup.review');
    await t.pumpWidget(
      RepaintBoundary(
        key: key,
        child: MaterialApp(
          home: StartupSplash(ready: true, onComplete: () {}),
        ),
      ),
    );
    await t.pump();
    await t.pump(const Duration(milliseconds: 250));
    await _capture(t, key, 'startup-wordmark');
    await t.pump(const Duration(milliseconds: 650));
    await _capture(t, key, 'startup-collapse');
    await t.pump(const Duration(milliseconds: 300));
    await t.pump(const Duration(milliseconds: 350));
    await _capture(t, key, 'startup-reveal');
    await t.pumpWidget(const SizedBox.shrink());
  });
}

Future<void> _capture(WidgetTester tester, Key key, String name) async {
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(key));
    final image = await boundary.toImage(pixelRatio: 1);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final directory = Directory('build/verification');
    await directory.create(recursive: true);
    await File('${directory.path}/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}
