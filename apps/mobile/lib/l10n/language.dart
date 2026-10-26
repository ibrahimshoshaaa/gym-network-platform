import 'package:flutter/material.dart';
import 'catalog.g.dart';

/// One application preference, independent of the signed-in account.
class AppLanguage extends ChangeNotifier {
  static final instance = AppLanguage();
  String _code = 'ar';
  Future<void> Function(String, String)? _write;
  bool get english => _code == 'en';
  String get code => _code;
  Locale get locale => Locale(_code);
  void use(String code) {
    if (!['ar', 'en'].contains(code) || code == _code) return;
    _code = code;
    notifyListeners();
  }
  Future<void> restore(Future<String?> Function(String) read,
      Future<void> Function(String, String) write) async {
    _write = write;
    String? saved;
    try { saved = await read('app.language') ?? await read('auth.language'); } catch (_) { /* Use device locale when storage is unavailable. */ }
    use(saved == 'ar' || saved == 'en' ? saved! : WidgetsBinding.instance.platformDispatcher.locale.languageCode == 'en' ? 'en' : 'ar');
  }
  Future<void> select(String code) async {
    use(code);
    try {
      await _write?.call('app.language', _code);
      await _write?.call('auth.language', _code);
    } catch (_) { /* The current session still uses the selected language. */ }
  }
  static void watch(BuildContext context) {
    // Every screen subscribes so visible routes and open dialogs rebuild without
    // replacing the navigator, forms, timers, or pending financial requests.
    LanguageScope.maybeOf(context);
  }
}

class LanguageScope extends InheritedNotifier<AppLanguage> {
  const LanguageScope({super.key, required AppLanguage language, required super.child}) : super(notifier: language);
  static AppLanguage? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<LanguageScope>()?.notifier;
}

/// Translate only an explicit source-owned catalog key. Interpolated user data
/// is inserted once and is never translated or parsed as another template.
String appText(String key, [List<Object?> values = const []]) {
  final catalog = AppLanguage.instance.english ? enCatalog : arCatalog;
  final text = catalog[key];
  if (text == null) throw ArgumentError.value(key, 'key', 'Unknown translation');
  return text.replaceAllMapped(RegExp(r'\{p(\d+)\}'), (match) {
    final index = int.parse(match[1]!);
    if (index >= values.length) throw ArgumentError('Missing placeholder for $key');
    return '${values[index]}';
  });
}

class LanguageSelector extends StatelessWidget {
  const LanguageSelector({super.key});
  @override Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final language = AppLanguage.instance;
    return ListTile(
      key: const ValueKey('account.language'),
      leading: const Icon(Icons.language_rounded),
      title: Text(appText('s1012')),
      subtitle: Text(language.english ? 'English' : 'العربية'),
      trailing: DropdownButton<String>(
        key: const ValueKey('language.choice'), value: language.code,
        items: const [DropdownMenuItem(value: 'ar', child: Text('العربية')), DropdownMenuItem(value: 'en', child: Text('English'))],
        onChanged: (value) async { if (value != null) await language.select(value); },
      ),
    );
  }
}
