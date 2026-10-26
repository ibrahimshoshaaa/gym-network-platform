import '../l10n/language.dart';
import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
import 'account.dart';
import 'account_balance_hero.dart';
export 'account_balance_hero.dart' show BalanceHeroAction;

class WorkBalanceHero extends StatelessWidget {
 final ApiClient api;final String scope,label,unit;final String? points;final bool loading;
 final BalanceHeroAction? primary,secondary,footer;
 const WorkBalanceHero({super.key,required this.api,required this.scope,required this.label,required this.points,required this.loading,this.primary,this.secondary,this.footer,this.unit='نقطة'});
 @override Widget build(BuildContext context){ AppLanguage.watch(context); return AccountBalanceHero(api:api,subtitle:scope,label:label,status:unit==appText('s106')?appText('s107'):appText('s108'),unit:unit,points:points,loading:loading,notifications:()=>open(context,NotificationsScreen(api:api)),primary:primary??BalanceHeroAction(appText('s109'),Icons.qr_code_scanner_rounded,null),secondary:secondary??BalanceHeroAction(appText('s110'),Icons.history_rounded,null),footer:footer??BalanceHeroAction(appText('s111'),Icons.qr_code_2_rounded,null)); }
}
