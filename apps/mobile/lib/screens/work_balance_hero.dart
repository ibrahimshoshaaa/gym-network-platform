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
 @override Widget build(BuildContext context)=>AccountBalanceHero(api:api,subtitle:scope,label:label,status:unit=='ج.م'?'مستحقات الزيارات':'تشغيل الفرع',unit:unit,points:points,loading:loading,notifications:()=>open(context,NotificationsScreen(api:api)),primary:primary??const BalanceHeroAction('تسجيل زيارة',Icons.qr_code_scanner_rounded,null),secondary:secondary??const BalanceHeroAction('سجل الزيارات',Icons.history_rounded,null),footer:footer??const BalanceHeroAction('تأكيد حضور حجز',Icons.qr_code_2_rounded,null));
}
