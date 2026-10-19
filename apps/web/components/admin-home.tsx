"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Coins, CreditCard, RefreshCw } from "lucide-react";
import { api, date, decimal, message, type Settings } from "../lib/client";
import { Busy, Notice } from "./ui";
export type AdminDestination = "requests" | "finance" | "more" | "gym-applications" | "direct-topup" | "pricing" | "payments" | "gyms" | "reviews" | "reports" | "branch-prices" | "inventory" | "withdrawals" | "operation-reviews" | "packages" | "support" | "users" | "audit" | "disputes";
export type AdminSummary = {asOf:string;cards:{label:string;value:string;destination:string;unit?:string}[]};
const queues = [
 {label:"شحن ينتظر المراجعة",title:"طلبات الشحن",description:"طابق التحويل وأضف النقاط.",destination:"reviews"},
 {label:"طلبات انضمام الجيمات",title:"انضمام الجيمات",description:"راجع بيانات صاحب الجيم وطلب الانضمام.",destination:"gym-applications"},
 {label:"سحب ينتظر المراجعة",title:"طلبات السحب",description:"راجع المبلغ وبيانات استلام الجيم.",destination:"withdrawals"},
 {label:"تحويلات تنتظر التنفيذ",title:"تحويلات جاهزة للتنفيذ",description:"طلبات سحب مقبولة تنتظر تسجيل التحويل وإثباته.",destination:"withdrawals"},
 {label:"طلبات أسعار",title:"أسعار الزيارات",description:"راجع السعر والمدة قبل التطبيق.",destination:"branch-prices"},
 {label:"طلبات تصحيح",title:"الإلغاء والتصحيح",description:"راجع العملية وسبب طلب التصحيح.",destination:"operation-reviews"},
 {label:"جيمات تنتظر التفعيل",title:"تفعيل الجيمات",description:"راجع الجيمات التي استكملت قبول الدعوة.",destination:"gyms"},
 {label:"طلبات دعم مفتوحة",title:"رسائل الدعم",description:"تابع المحادثات المفتوحة والردود.",destination:"support"},
] as const;
export function AdminHome({onNavigate}:{onNavigate:(destination:AdminDestination)=>void}) {
 const [summary,setSummary]=useState<AdminSummary|null>(null),[settings,setSettings]=useState<Settings|null>(null);
 const [error,setError]=useState(""),[setupError,setSetupError]=useState(""),[loading,setLoading]=useState(true);
 const generation=useRef(0);
 async function load(){
  const current=++generation.current;setLoading(true);setError("");setSetupError("");
  await Promise.allSettled([
   api<AdminSummary>("home-summary").then(data=>{if(current===generation.current)setSummary(data);}).catch(e=>{if(current===generation.current)setError(message(e));}),
   api<Settings>("admin/topup-settings").then(data=>{if(current===generation.current)setSettings(data);}).catch(e=>{if(current===generation.current)setSetupError(message(e));})
  ]);
  if(current===generation.current)setLoading(false);
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[]);
 const ready=settings?.policy && settings.paymentMethods.some(method=>method.enabled===true);
 return <div className="admin-home-simple">
  <div className="admin-welcome"><div><span className="eyebrow">إدارة GymBank</span><h1>يومك في المنصة</h1><p>راجع المطلوب منك، وكمّل شغلك.</p></div><button className="secondary compact" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>تحديث</button></div>
  <Notice text={error}/>
  {summary?<AdminOverview data={summary} stale={Boolean(error)} loading={loading} onNavigate={onNavigate}/>:<section className="card admin-inbox"><h2>محتاج تدخلك</h2>{loading?<Busy>بنحمّل الطلبات</Busy>:<p className="muted">تعذر تحميل الطلبات. اضغط تحديث للمحاولة.</p>}</section>}
  <section className="admin-short-actions" aria-label="مهام سريعة">
   <button onClick={()=>onNavigate("direct-topup")}><Coins size={21}/><span><strong>شحن مباشر بالرقم</strong><small>بعد تأكيد تحصيل المبلغ</small></span><ArrowLeft size={18}/></button>
   <button onClick={()=>onNavigate("gyms")}><span><strong>الجيمات والفروع</strong><small>افتح الجيم وتابع بياناته</small></span><ArrowLeft size={18}/></button>
   <button onClick={()=>onNavigate("reviews")}><span><strong>راجع طلبات الشحن</strong><small>الإيصال والقرار في نفس الطلب</small></span><ArrowLeft size={18}/></button>
  </section>
  <Notice text={setupError}/>
  {settings&&!ready?<AdminSetup settings={settings} onNavigate={onNavigate}/>:null}
 </div>;
}
export function AdminOverview({data,stale=false,loading=false,onNavigate}:{data:AdminSummary;stale?:boolean;loading?:boolean;onNavigate:(destination:AdminDestination)=>void}) {
 const count=(label:string)=>data.cards.find(card=>card.label===label)?.value;
 const waiting=queues.map(queue=>({...queue,count:count(queue.label)}));
 const active=waiting.filter(queue=>queue.count!==undefined && Number(queue.count)>0);
 const complete=waiting.every(queue=>queue.count!==undefined);
 const late=count("تحويلات متأخرة");
 return <>
  <section className="card admin-inbox" aria-label="طلبات تحتاج تدخلك">
   <div className="admin-block-title"><div><h2>محتاج تدخلك</h2><p>طلبات تنتظر قرارًا أو متابعة.</p></div><button className="text-button" onClick={()=>onNavigate("requests")}>كل الطلبات<ArrowLeft size={16}/></button></div>
   {loading?<p className="muted" role="status">جاري تحديث الأعداد…</p>:null}
   {stale?<p className="notice">الأعداد من آخر تحميل ناجح؛ تعذر تحديثها الآن.</p>:null}
   {late!==undefined&&Number(late)>0?<button className="admin-overdue" onClick={()=>onNavigate("withdrawals")}><CreditCard size={20}/><span><strong>{late} تحويل متأخر</strong><small>افتح طلبات السحب لمتابعة التنفيذ.</small></span><ArrowLeft size={18}/></button>:null}
   {active.length?<div className="admin-queue-list">{active.map(queue=><button key={queue.label} onClick={()=>onNavigate(queue.destination)}><span className="admin-queue-count">{queue.count}</span><span><strong>{queue.title}</strong><small>{queue.description}</small></span><ArrowLeft size={18}/></button>)}</div>:!stale&&complete?<div className="admin-inbox-clear"><CheckCircle2 size={26}/><strong>مفيش طلبات منتظرة حاليًا</strong><p>أي طلب جديد هيظهر هنا بعد التحديث.</p></div>:<p className="muted">افتح كل الطلبات لمراجعة الحالة؛ الأعداد غير مكتملة.</p>}
   <small className="admin-updated">آخر تحميل: {date(data.asOf)}</small>
  </section>
  <section className="admin-glance" aria-label="ملخص المنصة">{([
   ["جيمات نشطة","الجيمات النشطة","gyms"],["فروع نشطة","الفروع النشطة","gyms"],["متدربون نشطون","المتدربون","users"],
  ] as const).map(([label,title,destination])=><button key={label} onClick={()=>onNavigate(destination as AdminDestination)}><strong>{count(label)??"—"}</strong><span>{title}</span></button>)}</section>
 </>;
}

export function AdminSetup({ settings, onNavigate }: { settings: Settings; onNavigate: (destination: AdminDestination) => void }) {
  const priced = settings.policy !== null;
  const payment = settings.paymentMethods.some(method => method.enabled === true);
  const ready = priced && payment;
  const steps = [
    { id: "pricing" as const, title: "حدد سعر النقطة والنسب", done: priced, icon: Coins,
      detail: priced ? `سعر النقطة الحالي ${decimal(settings.policy!.pointPricePiasters)} ج.م. راجع خصم شراء الجيم ونسبة بيعه لصاحب المنصة.` : "حدد سعر النقطة وخصم شراء الجيم ونسبة بيع الجيم لصاحب المنصة." },
    { id: "payments" as const, title: "فعّل حسابًا لاستقبال التحويل", done: payment, icon: CreditCard,
      detail: payment ? "توجد طريقة دفع مفعّلة. راجع رقم الحساب واسم صاحبه قبل استقبال التحويلات." : "أضف حساب إنستا باي أو المحفظة واسم صاحبه، ثم فعّل إتاحته للعملاء." },
  ];
  return <section className="card admin-setup" aria-label="حالة تجهيز الشحن">
    <div className="section-toolbar"><div><span className="eyebrow">خطوتان لتجهيز الشحن</span><h2>{ready ? "إعدادات الشحن مكتملة" : "كمّل تجهيز الشحن"}</h2></div><span className={`badge ${ready ? "approved" : "pending"}`}>{Number(priced) + Number(payment)} من 2</span></div>
    <p className="muted">{ready ? "المتدرب يقدر يطلب شحنًا ويرفع الإيصال، والنقاط تُضاف بعد موافقتك." : "الحسابات والمحافظ متاحة، وطلبات الشحن تحتاج تسعيرًا وطريقة تحويل مفعّلة."}</p>
    <ol className="admin-setup-list">
      {steps.map(step => <li key={step.id}>
        <span className={`setup-status ${step.done ? "complete" : ""}`} aria-label={step.done ? "مكتمل" : "يحتاج إعدادًا"}>{step.done ? <CheckCircle2 size={23} /> : <Circle size={23} />}</span>
        <div><h3>{step.title}</h3><p>{step.detail}</p></div>
        <button className="secondary compact" onClick={() => onNavigate(step.id)}><step.icon size={17} />{step.done ? "مراجعة" : "إعداد"}<ArrowLeft size={16} /></button>
      </li>)}
    </ol>
  </section>;
}

