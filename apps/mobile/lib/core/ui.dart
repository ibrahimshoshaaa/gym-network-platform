import '../l10n/language.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';

const ink = Color(0xff101719),
    green = Color(0xff006b52),
    lime = Color(0xff00e6a8),
    canvas = Color(0xfff2f4f7),
    muted = Color(0xff71837e);
ThemeData appTheme() => ThemeData(
  useMaterial3: true,
  scaffoldBackgroundColor: canvas,
  colorScheme: ColorScheme.fromSeed(
    brightness: Brightness.light,
    seedColor: green,
    primary: green,
    surface: Colors.white,
  ),
  textTheme: const TextTheme(
    headlineLarge: TextStyle(
      fontSize: 32,
      fontWeight: FontWeight.w900,
      color: ink,
    ),
    headlineMedium: TextStyle(
      fontSize: 25,
      fontWeight: FontWeight.w800,
      color: ink,
    ),
    titleLarge: TextStyle(
      fontSize: 20,
      fontWeight: FontWeight.w800,
      color: ink,
    ),
    bodyLarge: TextStyle(fontSize: 16, height: 1.6, color: ink),
    bodyMedium: TextStyle(fontSize: 14, height: 1.6, color: ink),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: canvas,
    surfaceTintColor: Colors.transparent,
    foregroundColor: ink,
    centerTitle: false,
  ),
  inputDecorationTheme: InputDecorationTheme(
    filled: true,
    fillColor: const Color(0xfff3f6f3),
    contentPadding: const EdgeInsets.all(17),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: BorderSide.none,
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: const BorderSide(color: Color(0xffe0e8df)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(17),
      borderSide: const BorderSide(color: green, width: 1.5),
    ),
  ),
  filledButtonTheme: FilledButtonThemeData(
    style: FilledButton.styleFrom(
      minimumSize: const Size(double.infinity, 54),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
    ),
  ),
  navigationBarTheme: NavigationBarThemeData(
    backgroundColor: Colors.white,
    indicatorColor: lime,
    labelTextStyle: WidgetStateProperty.all(
      const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
    ),
  ),
  dividerTheme: const DividerThemeData(color: Color(0xffe4eae2), space: 28),
);

class Brand extends StatelessWidget {
  final bool large;
  const Brand({super.key, this.large = false});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Image.asset(
    'assets/brand/gymbank-wordmark.png',
    width: large ? 224 : 152,
    height: large ? 56 : 38,
    fit: BoxFit.contain,
    semanticLabel: 'GymBank',
  ); }
}

class Panel extends StatelessWidget {
  final Widget child;
  final Color? color;
  final EdgeInsetsGeometry padding;
  const Panel({
    super.key,
    required this.child,
    this.color,
    this.padding = const EdgeInsets.all(22),
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  SizedBox(
    width: double.infinity,
    child: Material(
      color: color ?? Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(25),
        side: const BorderSide(color: Color(0xffe4ebe1)),
      ),
      child: Padding(padding: padding, child: child),
    ),
  ); }
}

class ActionButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final IconData? icon;
  const ActionButton(
    this.label, {
    super.key,
    this.onPressed,
    this.busy = false,
    this.icon,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  FilledButton(
    onPressed: busy ? null : onPressed,
    child: busy
        ? const SizedBox(
            height: 22,
            width: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 20),
                const SizedBox(width: 9),
              ],
              Flexible(child: Text(label, textAlign: TextAlign.center)),
            ],
          ),
  ); }
}

class ErrorNote extends StatelessWidget {
  final Object? error;
  final VoidCallback? retry;
  const ErrorNote(this.error, {super.key, this.retry});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  error == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xfffff0ed),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$error',
                  style: const TextStyle(color: Color(0xff954a39)),
                ),
                if (retry != null)
                  TextButton(
                    onPressed: retry,
                    child: Text(appText('s98')),
                  ),
              ],
            ),
          ),
        ); }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title, detail;
  final Widget? action;
  const EmptyState(
    this.title, {
    super.key,
    this.detail = '',
    this.icon = Icons.inbox_outlined,
    this.action,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Panel(
    child: Column(
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: const BoxDecoration(
            color: canvas,
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 34, color: green),
        ),
        const SizedBox(height: 16),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        if (detail.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: const TextStyle(color: muted),
          ),
        ],
        if (action != null) ...[const SizedBox(height: 18), action!],
      ],
    ),
  ); }
}

class Screen extends StatelessWidget {
  final String title;
  final Widget child;
  final List<Widget>? actions;
  const Screen({
    super.key,
    required this.title,
    required this.child,
    this.actions,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Scaffold(
    appBar: AppBar(title: Text(title), actions: actions),
    body: SafeArea(child: child),
  ); }
}

Future<T?> open<T>(BuildContext context, Widget page) =>
    Navigator.of(context).push<T>(MaterialPageRoute(builder: (_) => page));

class DataView extends StatefulWidget {
  final Future<dynamic> Function() load;
  final Widget Function(dynamic, Future<void> Function()) builder;
  const DataView({super.key, required this.load, required this.builder});
  @override
  State<DataView> createState() => _DataViewState();
}

class _DataViewState extends State<DataView> {
  dynamic data;
  Object? error;
  bool loading = true;
  int generation = 0;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load() async {
    final g = ++generation;
    setState(() => loading = true);
    try {
      final d = await widget.load();
      if (mounted && generation == g)
        setState(() {
          data = d;
          error = null;
        });
    } catch (e) {
      if (mounted && generation == g) setState(() => error = e);
    } finally {
      if (mounted && generation == g) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Stack(
    children: [
      RefreshIndicator(
        onRefresh: load,
        child: loading && data == null
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 150),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : error != null
            ? ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: [ErrorNote(error, retry: load)],
              )
            : widget.builder(data, load),
      ),
      if (loading && data != null)
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: LinearProgressIndicator(
            minHeight: 3,
            semanticsLabel: appText('s99'),
          ),
        ),
    ],
  ); }
}

class SectionTitle extends StatelessWidget {
  final String title;
  final Widget? trailing;
  const SectionTitle(this.title, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Padding(
    padding: const EdgeInsets.only(top: 24, bottom: 14),
    child: Row(
      children: [
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleLarge),
        ),
        if (trailing != null) trailing!,
      ],
    ),
  ); }
}

class Fact extends StatelessWidget {
  final String label, value;
  final bool strong;
  const Fact(this.label, this.value, {super.key, this.strong = false});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Padding(
    padding: const EdgeInsets.symmetric(vertical: 9),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: muted)),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: TextStyle(
              fontWeight: strong ? FontWeight.w900 : FontWeight.w600,
              fontSize: strong ? 20 : 14,
            ),
          ),
        ),
      ],
    ),
  ); }
}

class Reference extends StatelessWidget {
  final String value;
  const Reference(this.value, {super.key});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  ExpansionTile(
    tilePadding: EdgeInsets.zero,
    title: Text(
      appText('s100'),
      style: TextStyle(fontSize: 12, color: muted),
    ),
    children: [
      Row(
        children: [
          Expanded(
            child: SelectableText(
              value,
              textDirection: TextDirection.ltr,
              style: const TextStyle(fontSize: 12),
            ),
          ),
          IconButton(
            tooltip: appText('s101'),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value));
              if (context.mounted)
                ScaffoldMessenger.of(
                  context,
                ).showSnackBar(SnackBar(content: Text(appText('s102'))));
            },
            icon: const Icon(Icons.copy_rounded, size: 18),
          ),
        ],
      ),
    ],
  ); }
}

class StatusPill extends StatelessWidget {
  final String status;
  const StatusPill(this.status, {super.key});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Container(
    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
    decoration: BoxDecoration(
      color: ['REJECTED', 'DISPUTED', 'SUSPENDED'].contains(status)
          ? const Color(0xffffede9)
          : ['PENDING', 'REQUESTED'].contains(status)
          ? const Color(0xfffff4d8)
          : const Color(0xffe7f4ec),
      borderRadius: BorderRadius.circular(10),
    ),
    child: Text(
      statusName(status),
      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
    ),
  ); }
}

class PagedRecords extends StatefulWidget {
  final ApiClient api;
  final String path;
  final Widget Function(Json) item;
  final String? empty;
  final String emptyDetail;
  final Widget? header, emptyAction;
  const PagedRecords({
    super.key,
    required this.api,
    required this.path,
    required this.item,
    this.empty,
    this.emptyDetail = '',
    this.header,
    this.emptyAction,
  });
  @override
  State<PagedRecords> createState() => _PagedRecordsState();
}

class _PagedRecordsState extends State<PagedRecords> {
  List<Json> items = [];
  String? cursor;
  bool busy = false;
  Object? error;
  @override
  void initState() {
    super.initState();
    load();
  }

  Future<void> load({bool more = false}) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      final r = await widget.api.request(
        widget.path +
            (widget.path.contains('?') ? '&' : '?') +
            'limit=25${more && cursor != null ? '&cursor=$cursor' : ''}',
      );
      if (!mounted) return;
      setState(() {
        items = more ? [...items, ...rows(r)] : rows(r);
        cursor = r['nextCursor'];
        error = null;
      });
    } catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  RefreshIndicator(
    onRefresh: () => load(),
    child: ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(20),
      children: [
        if (widget.header != null) widget.header!,
        ErrorNote(error, retry: () => load()),
        if (items.isEmpty && !busy && error == null)
          EmptyState(
            widget.empty ?? appText('s103'),
            detail: widget.emptyDetail,
            action: widget.emptyAction,
          ),
        ...items.map(
          (r) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: widget.item(r),
          ),
        ),
        if (busy)
          const Center(
            child: Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(),
            ),
          ),
        if (cursor != null && !busy)
          OutlinedButton(
            onPressed: () => load(more: true),
            child: Text(appText('s104')),
          ),
      ],
    ),
  ); }
}
