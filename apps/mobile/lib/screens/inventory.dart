import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/ui.dart';
class InventoryScreen extends StatelessWidget {
 final ApiClient api;final Json gym;
 const InventoryScreen({super.key,required this.api,required this.gym});
 @override Widget build(BuildContext context)=>const Screen(title:'مستحقات الجيم',child:Center(child:Text('شراء ومخزون نقاط الجيم وتحويلات الفروع تم إلغاؤها')));
}
class StockTransfer extends StatelessWidget {
 final ApiClient api;final Json gym;final String? fromBranchId;
 const StockTransfer({super.key,required this.api,required this.gym,this.fromBranchId});
 @override Widget build(BuildContext context)=>const Screen(title:'نقاط المتدرب',child:Center(child:Text('شحن النقاط من صاحب المنصة فقط')));
}
class StockTransferHistory extends StatelessWidget {
 final ApiClient api;final String gymId;
 const StockTransferHistory({super.key,required this.api,required this.gymId});
 @override Widget build(BuildContext context)=>const Screen(title:'نقاط الجيم',child:Center(child:Text('تحويل نقاط الفروع لم يعد متاحًا')));
}
