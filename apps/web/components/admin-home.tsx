"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Circle, Coins, CreditCard, FileCheck2, RefreshCw } from "lucide-react";
import { api, decimal, message, type Settings } from "../lib/client";
import { RoleSummary } from "./updates";
import { Busy, Notice } from "./ui";

export type AdminDestination = "pricing" | "payments" | "gyms" | "reviews" | "reports" | "branch-prices" | "inventory" | "withdrawals" | "operation-reviews" | "packages" | "support" | "users" | "audit" | "disputes";
export function AdminHome({ onNavigate }: { onNavigate: (destination: AdminDestination) => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  async function load() {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<Settings>("admin/topup-settings");
      if (generation.current === current) setSettings(data);
    } catch (error) {
      if (generation.current === current) setError(message(error));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, []);
  const ready = settings?.policy && settings.paymentMethods.some(method => method.enabled === true);
  return <>
    <div className="work-welcome"><span className="eyebrow">إدارة المنصة</span><h1>مهامك اليومية</h1><p>اختار المهمة اللي محتاجة قرارك.</p></div>
    <RoleSummary onNavigate={destination=>onNavigate(destination as AdminDestination)}/>
    <div className="work-task-grid admin-daily">
      <button className="work-task featured" onClick={() => onNavigate("reviews")}><span className="work-task-icon"><FileCheck2 size={25}/></span><strong>راجع طلبات الشحن</strong><span>افتح الإيصال وأكد وصول التحويل لإضافة النقاط.</span><ArrowLeft size={18}/></button>
      <button className="work-task" onClick={() => onNavigate("gyms")}><span className="work-task-icon"><Building2 size={25}/></span><strong>الجيمات والفروع</strong><span>فعّل جيمًا أو تابع الفروع والدعوات.</span><ArrowLeft size={18}/></button>
      <button className="work-task" onClick={() => onNavigate("reports")}><span className="work-task-icon"><Coins size={25}/></span><strong>التقارير والمتابعة</strong><span>تابع الأرصدة والزيارات وحركة التشغيل.</span><ArrowLeft size={18}/></button>
    </div>
    <section className="admin-section-index" aria-label="كل أقسام الإدارة">
      <h2>باقي مهام الإدارة</h2>
      <p className="muted">كل قسم له مهمة واضحة، اختار اللي محتاجه.</p>
      <div className="admin-shortcuts">
      {([
       ["branch-prices","اعتماد أسعار الزيارات","راجع سعر الزيارة ومدتها قبل تفعيل الفرع."],
       ["withdrawals","طلبات سحب الجيمات","قبول الطلبات ومتابعة موعد التحويل والإثبات."],
       ["operation-reviews","طلبات الإلغاء والتصحيح","راجع الأدلة وتأثير القرار على الرصيد."],
       ["inventory","أرصدة الفروع","اختار جيمًا وفرعًا لمتابعة النقاط وحركتها."],
       ["pricing","تسعير النقاط والنسب","حدد سعر النقطة وخصم الجيم ونسبته."],
       ["payments","حسابات استقبال التحويل","حدّث الحسابات وفعّل وسائل التحويل."],
       ["packages","باقات الشحن","أضف وعدّل الباقات المتاحة للمتدربين والجيمات."],
       ["support","الدعم والشكاوى","راجع الطلبات والرسائل واضبط رقم واتساب."],
       ["users","المستخدمون والحسابات","إدارة الإتاحة واستعادة الحسابات."],
       ["audit","سجل التغييرات","راجع القرارات والعمليات المنفذة."],
       ["disputes","حجوزات النزاعات","راجع المبالغ المحجوزة وفك الحجز عند انتهاء المراجعة."]
      ] as const).map(([id,title,description])=><button className="card" key={id} onClick={()=>onNavigate(id)}><ArrowLeft size={19}/><strong>{title}</strong><span>{description}</span></button>)}
      </div>
    </section>
    <Notice text={error}/>
    {loading ? <p className="muted"><Busy>بنفحص إعدادات الشحن</Busy></p> : settings && !error ? ready ? <details className="card setup-disclosure"><summary>إعدادات الشحن جاهزة · عرض الإعدادات</summary><AdminSetup settings={settings} onNavigate={onNavigate}/></details> : <AdminSetup settings={settings} onNavigate={onNavigate}/> : null}
    <button className="text-button" disabled={loading} onClick={() => void load()}><RefreshCw size={16}/>تحديث حالة الإعدادات</button>
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
