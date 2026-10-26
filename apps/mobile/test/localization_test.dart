import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gym_network/core/api.dart';
import 'package:gym_network/core/ui.dart';
import 'package:gym_network/l10n/language.dart';
import 'package:gym_network/l10n/catalog.g.dart';
import 'package:gym_network/screens/account.dart';
import 'package:gym_network/screens/auth.dart';
import 'operations_test.dart' show client, reply;

void main() {
  setUp(() => AppLanguage.instance.use('ar'));
  tearDown(() => AppLanguage.instance.use('ar'));
  test('both catalogs cover every key and preserve placeholder contracts', () {
    expect(arCatalog.keys.toSet(), enCatalog.keys.toSet());
    expect(arCatalog.length, greaterThan(1000));
    for (final key in arCatalog.keys) {
      final placeholders = RegExp(r'\{p\d+\}');
      expect(placeholders.allMatches(arCatalog[key]!).map((m) => m[0]).toList(),
          placeholders.allMatches(enCatalog[key]!).map((m) => m[0]).toList(), reason:key);
    }
  });
  test('user values are never translated or interpreted as placeholders', () {
    AppLanguage.instance.use('en');
    expect(appText('s964', ['محمد {p1}']), 'Hi, محمد {p1}');
    expect(appText('s193', [20, 45]), '20 points · 45 minutes');
    expect(statusName('PENDING'), 'Under review');
    expect(const ApiFailure('INVALID_INPUT').toString(), 'Check the required fields and values.');
    expect(piasters('١٢٣.٤٥'), '12345');
    expect(money('12345'), '123.45');
  });
  test('language preference survives restore and migrates the login preference', () async {
    final storage=<String,String>{'auth.language':'en'};
    await AppLanguage.instance.restore((key) async => storage[key], (k,v) async {storage[k]=v;});
    expect(AppLanguage.instance.english,true);
    await AppLanguage.instance.select('ar');
    expect(storage['app.language'],'ar'); expect(storage['auth.language'],'ar');
    await AppLanguage.instance.select('en');
    AppLanguage.instance.use('ar');
    await AppLanguage.instance.restore((key) async => storage[key], (k,v) async {storage[k]=v;});
    expect(AppLanguage.instance.code,'en');
  });
  testWidgets('account switches language and direction without replacing user data', (t) async {
    final api=client('TRAINEE', (_) async => reply({'items':[]}));
    api.user={...api.user!, 'displayName':'محمد شوشه', 'phone':'+201012345678'};
    await t.pumpWidget(AnimatedBuilder(animation:AppLanguage.instance,builder:(context,_) =>
      LanguageScope(language:AppLanguage.instance,child:MaterialApp(locale:AppLanguage.instance.locale,
        supportedLocales:const [Locale('ar'),Locale('en')],localizationsDelegates:GlobalMaterialLocalizations.delegates,theme:appTheme(),
        home:Scaffold(body:AccountScreen(api:api))))));
    await t.pumpAndSettle();
    await t.scrollUntilVisible(find.byKey(const ValueKey('language.choice')),200);
    await t.tap(find.byKey(const ValueKey('language.choice')));await t.pumpAndSettle();
    await t.tap(find.text('English').last);await t.pumpAndSettle();
    expect(Directionality.of(t.element(find.byKey(const ValueKey('language.choice')))),TextDirection.ltr);
    await t.scrollUntilVisible(find.text('Your details and security'),-400);
    expect(find.text('Your details and security'),findsOneWidget);
    expect(api.user!['displayName'],'محمد شوشه');
    expect(find.byType(AccountScreen),findsOneWidget);
  });
  testWidgets('login language changes retain typed form values on a narrow screen', (t) async {
    t.view.physicalSize=const Size(375,812);t.view.devicePixelRatio=1;
    addTearDown(t.view.resetPhysicalSize);addTearDown(t.view.resetDevicePixelRatio);
    final api=client('TRAINEE', (_) async => reply({}));
    await t.pumpWidget(MaterialApp(home:AuthScreen(api:api)));await t.pumpAndSettle();
    final field=find.byKey(const ValueKey('auth.identifier'));
    if(field.evaluate().isNotEmpty) await t.enterText(field,'01012345678');
    await t.ensureVisible(find.byKey(const ValueKey('auth.language')));
    await t.tap(find.byKey(const ValueKey('auth.language')));await t.pumpAndSettle();
    expect(find.text('Welcome back'),findsOneWidget);
    expect(t.takeException(),isNull);
  });
}
