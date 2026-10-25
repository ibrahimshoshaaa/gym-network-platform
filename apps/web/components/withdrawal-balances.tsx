"use client";
import { RecordReference } from "./record-reference";
import { decimal, date } from "../lib/client";
import { Notice } from "./ui";
export type WithdrawalBalances = {
 visitCount:number; visitEarningsPiasters:string; otherAdjustmentsPiasters:string;
 latestVisits:{id:string;startedAt:string;branchName:string;points:number;settlementPiasters:string}[];
 asOf:string; consistent:boolean; netEntitlementsPiasters:string;
 outstandingPiasters:string; availablePiasters:string; reservedPiasters:string;
 currentReservedPiasters:string; otherReservedPiasters:string|null;
 disputedPiasters:string; paidPiasters:string; availableAfterPaymentPiasters:string|null;
};
export function WithdrawalBalanceCard({balances:b, amount, status}:{balances:WithdrawalBalances;amount:string;status:string}) {
 const held=["REQUESTED","APPROVED"].includes(status);
 const values=[
  ["صافي المستحقات المتراكمة",b.netEntitlementsPiasters],
  ["مستحقات لم تُدفع بعد",b.outstandingPiasters],
  ["متاح لطلبات سحب جديدة",b.availablePiasters],
  ["محجوز لهذا الطلب",b.currentReservedPiasters],
  ["محجوز لطلبات أخرى",b.otherReservedPiasters],
  ["محجوز للنزاعات",b.disputedPiasters],
  ["مدفوع سابقًا (يشمل هذا الطلب إن تم تحويله)",b.paidPiasters],
 ];
 return <section className="withdrawal-balance-card" aria-label="كشف مستحقات الجيم">
  <div className="section-toolbar"><h3>هل مبلغ الطلب ضمن مستحقاته؟</h3><span className={`badge ${b.consistent?"approved":"rejected"}`}>{b.consistent?"الأرصدة مطابقة للسجل":"يحتاج مراجعة"}</span></div>
  <p className="muted">المطلوب في هذا الطلب: <strong>{decimal(amount)} ج.م</strong></p>
  <dl className="withdrawal-balance-grid">{values.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===null?"غير متاح":decimal(value!)+ " ج.م"}</dd></div>)}</dl>
  {!b.consistent?<Notice text="بيانات الحجز أو الأرصدة غير متطابقة. لا تعتمد صرف الطلب قبل مراجعة السجل."/>:held?<div className="subtle-box"><strong>مبلغ الطلب محجوز بالفعل من مستحقات الجيم.</strong><p>قبول الطلب يبدأ مهلة التنفيذ ولا يخصم المبلغ مرة أخرى. بعد تسجيل التحويل يظل المتاح {decimal(b.availableAfterPaymentPiasters!)} ج.م، ويتحول حجز هذا الطلب إلى مدفوع. الرفض يعيد حجز هذا الطلب فقط إلى المتاح.</p></div>:<p className="muted">{["PAID","DISPUTED"].includes(status)?"مبلغ هذا الطلب مسجل ضمن المدفوع، وليس محجوزًا حاليًا.":"هذا الطلب مغلق ومبلغه غير محجوز حاليًا."}</p>}
  <p className="muted">الصافي يجمع المتاح والمحجوز والمدفوع بعد التسويات المسجلة؛ وفق حركات المستحقات المسجلة.</p>
  <details className="withdrawal-earnings"><summary>مصدر المستحقات وآخر الزيارات</summary>
   <p>{b.visitCount} زيارة غير ملغاة · مستحقاتها {decimal(b.visitEarningsPiasters)} ج.م</p>
   <p>صافي التسويات الأخرى المسجلة: {decimal(b.otherAdjustmentsPiasters)} ج.م</p>
   {b.latestVisits.length>0?<div className="timeline">{b.latestVisits.map(v=><article key={v.id}><strong>{v.branchName} · {decimal(v.settlementPiasters)} ج.م</strong><p>{v.points} نقطة · {date(v.startedAt)}</p><RecordReference value={v.id} label="مرجع الزيارة" /></article>)}</div>:<p className="muted">لا توجد زيارات غير ملغاة لهذا الجيم.</p>}
   <small className="muted">آخر ٥ زيارات كحد أقصى. مستحق الزيارة محفوظ بسعر وقت تنفيذها؛ لا نوزّع المدفوعات على زيارات بعينها في هذا العرض.</small>
  </details>
  <small className="muted">لقطة الرصيد: {date(b.asOf)} · قد تتغير الأرصدة مع العمليات الجديدة.</small>
 </section>;
}
