"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Circle, Coins, CreditCard, FileCheck2, RefreshCw } from "lucide-react";
import { api, decimal, message, type Settings } from "../lib/client";
import { Busy, Notice } from "./ui";

export type AdminDestination = "pricing" | "payments" | "gyms" | "reviews" | "reports";
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
  return <>
    <div className="section-toolbar">
      <p className="muted">ابدأ بتجهيز الشحن، ثم أضف الجيمات وتابع التشغيل من هنا.</p>
      <button className="secondary compact" disabled={loading} onClick={() => void load()}><RefreshCw size={16} />تحديث الحالة</button>
    </div>
    <Notice text={error} />
    {loading ? <section className="card"><Busy>جاري فحص إعدادات الشحن</Busy></section> : settings && !error ? <AdminSetup settings={settings} onNavigate={onNavigate} /> : null}
    <section className="card admin-next">
      <span className="eyebrow">بعد تجهيز الشحن</span>
      <h2>ابدأ بأول جيم</h2>
      <p className="muted">أضف الجيم وبيانات صاحبه، وشاركه دعوة التفعيل. بعد قبول الدعوة، جهّز الفرع وموقعه وسعر الزيارة ومدتها، ثم فعّل الجيم والفرع.</p>
      <button className="primary" onClick={() => onNavigate("gyms")}><Building2 size={18} />إدارة الجيمات والفروع<ArrowLeft size={17} /></button>
      <p className="subtle-box">إنشاء الجيم وحده لا يتيح الزيارات؛ الفرع يحتاج بيانات مكتملة وسعرًا معتمدًا وحالة نشطة.</p>
    </section>
    <div className="admin-shortcuts">
      <button className="card" onClick={() => onNavigate("reviews")}><FileCheck2 size={24} /><strong>مراجعة طلبات الشحن</strong><span>راجع الإيصال والتحويل قبل اعتماد إضافة النقاط.</span><ArrowLeft size={18} /></button>
      <button className="card" onClick={() => onNavigate("reports")}><Coins size={24} /><strong>التقارير والمتابعة</strong><span>تابع الأرصدة والزيارات والطلبات التي تحتاج إجراء.</span><ArrowLeft size={18} /></button>
    </div>
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
