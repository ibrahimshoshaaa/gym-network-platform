import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/language.dart';

const _background = Color(0xfff7f9f8);
const _brandGreen = Color(0xff006b52);
const _wordmark = 'assets/brand/gymbank-wordmark.png';
const _wordmarkWidth = 280.0;
const _wordmarkHeight = _wordmarkWidth * 267 / 800;

/// Animates only the startup overlay. Session restoration and routing continue
/// independently, so this never navigates or alters the authenticated user.
class StartupSplash extends StatefulWidget {
  const StartupSplash({
    super.key,
    required this.ready,
    required this.onComplete,
  });

  final bool ready;
  final VoidCallback onComplete;

  @override
  State<StartupSplash> createState() => _StartupSplashState();
}

class _StartupSplashState extends State<StartupSplash>
    with TickerProviderStateMixin {
  late final AnimationController _intro;
  late final AnimationController _reveal;
  bool _started = false;
  bool _leaving = false;
  bool _reducedMotion = false;

  @override
  void initState() {
    super.initState();
    _intro = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1150),
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed) _finishWhenReady();
      });
    _reveal = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed && mounted) {
          widget.onComplete();
        }
      });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _reducedMotion = MediaQuery.disableAnimationsOf(context);
    if (_reducedMotion) {
      _intro.value = 1;
      _finishWhenReady();
    } else {
      _intro.forward();
    }
  }

  @override
  void didUpdateWidget(covariant StartupSplash oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.ready && !oldWidget.ready) _finishWhenReady();
  }

  void _finishWhenReady() {
    if (_leaving || !widget.ready || _intro.status != AnimationStatus.completed) {
      return;
    }
    _leaving = true;
    if (_reducedMotion) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) widget.onComplete();
      });
    } else {
      _reveal.forward();
    }
  }

  @override
  void dispose() {
    _intro.dispose();
    _reveal.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    AppLanguage.watch(context);
    return AnimatedBuilder(
      animation: Listenable.merge([_intro, _reveal]),
      builder: (context, child) {
        final collapse = Curves.easeInOutCubic.transform(
          const Interval(.30, 1).transform(_intro.value),
        );
        final fill = Curves.easeInOutCubic.transform(
          const Interval(0, .80).transform(_reveal.value),
        );
        final foregroundOpacity = 1 -
            Curves.easeIn.transform(
              const Interval(.55, .90).transform(_reveal.value),
            );
        final overlayOpacity = 1 -
            Curves.easeOut.transform(
              const Interval(.72, 1).transform(_reveal.value),
            );
        final darkReveal = fill > .90;
        return AbsorbPointer(
          absorbing: true,
          child: AnnotatedRegion<SystemUiOverlayStyle>(
            value: (darkReveal ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
              statusBarColor: Colors.transparent,
              systemNavigationBarColor: darkReveal ? _brandGreen : _background,
              systemNavigationBarIconBrightness: darkReveal ? Brightness.light : Brightness.dark,
            ),
            child: Opacity(
              opacity: overlayOpacity,
              child: Scaffold(
                key: const ValueKey('startup.splash'),
                backgroundColor: _background,
                body: Stack(
                  fit: StackFit.expand,
                  children: [
                    CustomPaint(painter: _RevealPainter(fill)),
                    Center(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Opacity(
                          opacity: foregroundOpacity,
                          child: Semantics(
                            label: 'GymBank',
                            child: Directionality(
                              textDirection: TextDirection.ltr,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Opacity(
                                    opacity: 1 - collapse,
                                    child: _LogoPiece(
                                      key: const ValueKey('startup.logo.left'),
                                      start: 0,
                                      end: .45,
                                      shift: _wordmarkWidth * .45 * collapse,
                                    ),
                                  ),
                                  Transform.scale(
                                    scale: 1 + 8 * fill,
                                    child: ClipPath(
                                      clipper: _BClipper(isolate: _reveal.value > 0),
                                      child: const _LogoPiece(
                                        key: ValueKey('startup.logo.center'),
                                        start: .45,
                                        end: .5825,
                                      ),
                                    ),
                                  ),
                                  Opacity(
                                    opacity: 1 - collapse,
                                    child: _LogoPiece(
                                      key: const ValueKey('startup.logo.right'),
                                      start: .5825,
                                      end: 1,
                                      shift: -_wordmarkWidth * .4175 * collapse,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (!widget.ready && _intro.isCompleted)
                      Positioned(
                        bottom: 64,
                        left: 24,
                        right: 24,
                        child: Text(
                          appText('s695'),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xff71837e),
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Three clipped views of the real wordmark preserve the exact GymBank logo.
class _LogoPiece extends StatelessWidget {
  const _LogoPiece({
    super.key,
    required this.start,
    required this.end,
    this.shift = 0,
  });

  final double start;
  final double end;
  final double shift;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: _wordmarkWidth * (end - start),
        height: _wordmarkHeight,
        child: ClipRect(
          child: OverflowBox(
            alignment: Alignment.centerLeft,
            minWidth: _wordmarkWidth,
            maxWidth: _wordmarkWidth,
            minHeight: _wordmarkHeight,
            maxHeight: _wordmarkHeight,
            child: Transform.translate(
              offset: Offset(-start * _wordmarkWidth + shift, 0),
              child: Image.asset(
                _wordmark,
                width: _wordmarkWidth,
                height: _wordmarkHeight,
                fit: BoxFit.fill,
                excludeFromSemantics: true,
              ),
            ),
          ),
        ),
      );
}

class _RevealPainter extends CustomPainter {
  const _RevealPainter(this.progress);
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;
    final radius = math.sqrt(size.width * size.width + size.height * size.height) / 2;
    canvas.drawCircle(size.center(Offset.zero), radius * progress, Paint()..color = _brandGreen);
  }

  @override
  bool shouldRepaint(covariant _RevealPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

/// The adjacent A slightly overlaps the B in the original wordmark. During the
/// zoom, mask that small corner so only the B grows; the full logo stays intact.
class _BClipper extends CustomClipper<Path> {
  const _BClipper({required this.isolate});
  final bool isolate;

  @override
  Path getClip(Size size) {
    if (!isolate) return Path()..addRect(Offset.zero & size);
    return Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width, size.height * 163 / 267)
      ..lineTo(size.width * 102 / 106, size.height * 174 / 267)
      ..lineTo(size.width * 102 / 106, size.height)
      ..lineTo(0, size.height)
      ..close();
  }

  @override
  bool shouldReclip(covariant _BClipper oldClipper) => oldClipper.isolate != isolate;
}
