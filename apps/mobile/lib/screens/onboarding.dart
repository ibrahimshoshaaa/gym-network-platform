import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../core/ui.dart';
import '../l10n/language.dart';

/// This preference belongs to the device, not an individual account.
const onboardingStorageKey = 'app.onboarding.complete';

const _background = Color(0xfff9fcfa);
const _headline = Color(0xff10332b);
const _accent = Color(0xff007d5b);
const _secondary = Color(0xff6a7e77);

class _OnboardingPage {
  const _OnboardingPage({
    required this.image,
    required this.eyebrow,
    required this.title,
    required this.description,
    required this.badge,
    required this.icon,
    required this.alignment,
  });

  final String image;
  final String eyebrow;
  final String title;
  final String description;
  final String badge;
  final IconData icon;
  final Alignment alignment;
}

const _pages = [
  _OnboardingPage(
    image: 'assets/onboarding/discover.jpg',
    eyebrow: 's1071',
    title: 's1072',
    description: 's1073',
    badge: 's1074',
    icon: Icons.near_me_outlined,
    alignment: Alignment(0, -0.25),
  ),
  _OnboardingPage(
    image: 'assets/onboarding/balance.jpg',
    eyebrow: 's1075',
    title: 's1076',
    description: 's1077',
    badge: 's1078',
    icon: Icons.account_balance_wallet_outlined,
    alignment: Alignment(0, -0.35),
  ),
  _OnboardingPage(
    image: 'assets/onboarding/entry.jpg',
    eyebrow: 's1079',
    title: 's1080',
    description: 's1081',
    badge: 's1082',
    icon: Icons.qr_code_scanner_rounded,
    alignment: Alignment(0, -0.25),
  ),
];

class OnboardingScreen extends StatefulWidget {
  /// True opens account creation; false opens the existing sign-in screen.
  final ValueChanged<bool> onFinish;
  const OnboardingScreen({super.key, required this.onFinish});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page == _pages.length - 1) {
      widget.onFinish(true);
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOutCubic,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    final language = AppLanguage.instance;

    return Scaffold(
      backgroundColor: _background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 15),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    key: const ValueKey('onboarding.skip'),
                    onPressed: () => widget.onFinish(false),
                    child: Text(appText('s1066')),
                  ),
                  TextButton.icon(
                    key: const ValueKey('onboarding.language'),
                    onPressed: () => language.select(language.english ? 'ar' : 'en'),
                    icon: const Icon(Icons.language_rounded, size: 19),
                    label: Text(language.english ? 'العربية' : 'English'),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.only(top: 4, bottom: 4),
              child: Brand(large: true),
            ),
            Expanded(
              child: PageView.builder(
                key: const ValueKey('onboarding.pages'),
                controller: _controller,
                itemCount: _pages.length,
                onPageChanged: (value) => setState(() => _page = value),
                itemBuilder: (context, index) => _PageBody(page: _pages[index]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(28, 4, 28, 14),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Semantics(
                    label: appText('s1083', [_page + 1, _pages.length]),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(
                        _pages.length,
                        (index) => AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: index == _page ? 24 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: index == _page ? _accent : const Color(0xffc9e6dc),
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  FilledButton(
                    key: const ValueKey('onboarding.next'),
                    style: FilledButton.styleFrom(
                      backgroundColor: _accent,
                      foregroundColor: Colors.white,
                      minimumSize: const Size(double.infinity, 52),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                    ),
                    onPressed: _next,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(appText(_page == _pages.length - 1 ? 's1068' : 's1067')),
                        const SizedBox(width: 10),
                        const Icon(Icons.arrow_forward_rounded, size: 19),
                      ],
                    ),
                  ),
                  const SizedBox(height: 2),
                  Wrap(
                    alignment: WrapAlignment.center,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(appText('s1069'), style: const TextStyle(color: _secondary, fontSize: 13)),
                      TextButton(
                        key: const ValueKey('onboarding.login'),
                        onPressed: () => widget.onFinish(false),
                        child: Text(appText('s1070')),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PageBody extends StatelessWidget {
  final _OnboardingPage page;
  const _PageBody({required this.page});

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Keep the text scrollable on short screens and with large system text.
        final imageHeight = math.max(180.0, constraints.maxHeight - 160);
        return SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(30, 18, 30, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(appText(page.eyebrow), style: const TextStyle(color: _accent, fontSize: 13, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 8),
                    Text(
                      appText(page.title),
                      key: ValueKey('onboarding.title.${page.title}'),
                      style: const TextStyle(color: _headline, fontSize: 29, height: 1.25, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 10),
                    Text(appText(page.description), style: const TextStyle(color: _secondary, fontSize: 15, height: 1.65)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                height: imageHeight,
                child: ClipRect(
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.asset(
                        page.image,
                        key: ValueKey('onboarding.image.${page.title}'),
                        fit: BoxFit.cover,
                        alignment: page.alignment,
                        excludeFromSemantics: true,
                      ),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [_background, Colors.transparent, Colors.transparent, _background],
                            stops: [0, .14, .72, 1],
                          ),
                        ),
                      ),
                      PositionedDirectional(
                        top: 28,
                        end: 24,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: const [BoxShadow(color: Color(0x220a3522), blurRadius: 20, offset: Offset(0, 5))],
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(page.icon, size: 16, color: _accent),
                                const SizedBox(width: 5),
                                Text(appText(page.badge), style: const TextStyle(color: _accent, fontSize: 12, fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
