import '../l10n/language.dart';
import 'package:flutter/material.dart';

import 'ui.dart';

class PortalIntro extends StatelessWidget {
  final String title, detail, eyebrow;
  final Widget? trailing;
  const PortalIntro(
    this.title, {
    super.key,
    this.detail = '',
    this.eyebrow = '',
    this.trailing,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrow.isNotEmpty) ...[
                Text(
                  eyebrow,
                  style: const TextStyle(
                    color: green,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              Text(title, style: Theme.of(context).textTheme.headlineMedium),
              if (detail.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  detail,
                  style: const TextStyle(color: muted, fontSize: 13),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[const SizedBox(width: 8), trailing!],
      ],
    ),
  ); }
}

/// Wrap instead of fixed-height tiles: Arabic, large text and long values can grow.
class PortalGrid extends StatelessWidget {
  final List<Widget> children;
  const PortalGrid({super.key, required this.children});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  LayoutBuilder(
    builder: (context, box) {
      final largeText = MediaQuery.textScalerOf(context).scale(14) > 19;
      final columns = box.maxWidth < 280 || largeText
          ? 1
          : box.maxWidth >= 700
          ? 3
          : 2;
      final width = (box.maxWidth - (columns - 1) * 12) / columns;
      return Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          for (final child in children) SizedBox(width: width, child: child),
        ],
      );
    },
  ); }
}

class PortalTask extends StatelessWidget {
  final String title, detail;
  final IconData icon;
  final VoidCallback? onTap;
  final bool primary;
  const PortalTask(
    this.title, {
    super.key,
    required this.icon,
    required this.onTap,
    this.detail = '',
    this.primary = false,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Material(
    color: primary ? ink : Colors.white,
    borderRadius: BorderRadius.circular(20),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Opacity(
          opacity: onTap == null ? .5 : 1,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: primary ? lime : const Color(0xffe4f8f1),
                      borderRadius: BorderRadius.circular(13),
                    ),
                    child: Icon(icon, color: primary ? ink : green, size: 23),
                  ),
                  const Spacer(),
                  Icon(
                    Icons.arrow_back_rounded,
                    size: 17,
                    color: primary ? Colors.white70 : muted,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                title,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: primary ? Colors.white : ink,
                ),
              ),
              if (detail.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(
                  detail,
                  style: TextStyle(
                    color: primary ? Colors.white70 : muted,
                    fontSize: 12,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  ); }
}

class PortalMetric extends StatelessWidget {
  final String label, value, detail;
  final IconData icon;
  const PortalMetric(
    this.label,
    this.value, {
    super.key,
    required this.icon,
    this.detail = '',
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Panel(
    padding: const EdgeInsets.all(18),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: green, size: 21),
        const SizedBox(height: 14),
        Tooltip(
          message: value,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 27,
                fontWeight: FontWeight.w900,
                color: ink,
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
        ),
        if (detail.isNotEmpty)
          Text(detail, style: const TextStyle(fontSize: 11, color: muted)),
      ],
    ),
  ); }
}

class PortalNote extends StatelessWidget {
  final String text;
  final IconData icon;
  const PortalNote(
    this.text, {
    super.key,
    this.icon = Icons.info_outline_rounded,
  });
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: const Color(0xffe4f8f1),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: green),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text, style: const TextStyle(color: ink, fontSize: 12)),
        ),
      ],
    ),
  ); }
}

class FlowSteps extends StatelessWidget {
  final List<String> labels;
  final int current;
  const FlowSteps({super.key, required this.labels, required this.current});
  @override
  Widget build(BuildContext context) { AppLanguage.watch(context); return  Semantics(
    label: appText('s97', [current + 1, labels.length, labels[current]]),
    child: ExcludeSemantics(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 24),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < labels.length; i++)
              Expanded(
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 2,
                            color: i == 0
                                ? Colors.transparent
                                : i <= current
                                ? green
                                : const Color(0xffd9e4e0),
                          ),
                        ),
                        Container(
                          width: 30,
                          height: 30,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: i <= current
                                ? green
                                : const Color(0xffe3e9e7),
                          ),
                          child: i < current
                              ? const Icon(
                                  Icons.check_rounded,
                                  color: Colors.white,
                                  size: 17,
                                )
                              : Text(
                                  '${i + 1}',
                                  style: TextStyle(
                                    color: i <= current ? Colors.white : muted,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                        ),
                        Expanded(
                          child: Container(
                            height: 2,
                            color: i == labels.length - 1
                                ? Colors.transparent
                                : i < current
                                ? green
                                : const Color(0xffd9e4e0),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: Text(
                        labels[i],
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: i == current ? green : muted,
                          fontWeight: i == current
                              ? FontWeight.w800
                              : FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
  ); }
}

/// Compact headings for the trainee's five primary destinations.
class TraineeSectionHeader extends StatelessWidget {
 final String title,subtitle;
 final Widget? trailing;
 const TraineeSectionHeader(this.title,{super.key,this.subtitle='',this.trailing});
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return Padding(
  padding:const EdgeInsets.only(bottom:18),
  child:Row(crossAxisAlignment:CrossAxisAlignment.start,children:[
   Expanded(child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
    Text(title,style:const TextStyle(fontSize:24,height:1.5,fontWeight:FontWeight.w800,color:ink)),
    if(subtitle.isNotEmpty)...[
     const SizedBox(height:5),
     Text(subtitle,style:const TextStyle(fontSize:12,height:1.6,color:muted)),
    ],
   ])),
   if(trailing!=null)...[const SizedBox(width:10),trailing!],
  ])); }
}
