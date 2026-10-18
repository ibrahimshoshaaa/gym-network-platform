"use client";
import { useState } from "react";
import { Dumbbell, Wallet, PlusCircle, MapPin, QrCode, History, LogOut, KeyRound, ArrowLeft } from "lucide-react";
import type { Identity } from "../lib/client";
import { BranchDirectory } from "./branch-directory";
import { Purchases } from "./purchases";
import { TraineeQr } from "./operations";
import { TraineeWallet } from "./trainee-wallet";
import { Busy, Notice } from "./ui";

const sections = [
  { id: "wallet", label: "محفظتي", title: "كل اللي تحتاجه لتمرينتك الجاية", icon: Wallet },
  { id: "topup", label: "اشحن رصيدك", title: "اشحن نقاطك في خطوات بسيطة", icon: PlusCircle },
  { id: "gyms", label: "الجيمات", title: "اختار تمرينتك الجاية", icon: MapPin },
  { id: "qr", label: "رمز الدخول", title: "اعرض الرمز عند وصولك للجيم", icon: QrCode },
  { id: "visits", label: "زياراتي", title: "زياراتك وحركة نقاطك", icon: History },
] as const;
type Section = typeof sections[number]["id"];
export function TraineePortal({ user, logout, loggingOut, onPassword, error }: {
  user: Identity; logout: () => Promise<void>; loggingOut: boolean; onPassword: () => void; error: string;
}) {
  const [section, setSection] = useState<Section>("wallet");
  const current = sections.find(item => item.id === section)!;
  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  return (
    <div className="trainee-portal">
      <header className="trainee-header">
        <div className="brand"><span className="brand-icon"><Dumbbell size={23} /></span><span>GYM<span className="brand-light">NETWORK</span></span></div>
        <div className="trainee-account">
          <span><strong>{user.displayName}</strong><small>حساب متدرب</small></span>
          <button className="icon-button" aria-label="تغيير كلمة المرور" onClick={onPassword}><KeyRound size={20} /></button>
          <button className="icon-button" aria-label="تسجيل الخروج" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? <Busy /> : <LogOut size={20} />}</button>
        </div>
      </header>
      <main className="trainee-content">
        <div className="trainee-heading"><span className="eyebrow">{current.label}</span><h1>{section === "wallet" ? `أهلًا يا ${user.displayName.split(" ")[0]}` : current.label}</h1><p>{current.title}</p></div>
        <Notice text={error} />
        <nav className="trainee-navigation" aria-label="قائمة المتدرب">
          {sections.map(item => <button key={item.id} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={22} /><span>{item.label}</span></button>)}
        </nav>
        <div key={section}>
          {section === "wallet" ? <>
            <div className="trainee-quick-actions">
              <button className="primary" onClick={() => navigate("topup")}><PlusCircle size={19} />اشحن محفظتك<ArrowLeft size={17} /></button>
              <button className="secondary" onClick={() => navigate("qr")}><QrCode size={19} />افتح رمز الدخول</button>
            </div>
            <TraineeWallet revision={0} view="wallet">
              <section className="card trainee-start">
                <span className="eyebrow">أول مرة معانا؟</span><h2>تمرينتك الجاية في 3 خطوات</h2>
                <ol><li><strong>اشحن نقاطك</strong><p>اختار الكمية، حوّل المبلغ وارفع الإيصال. الرصيد يظهر بعد موافقة الإدارة.</p></li><li><strong>اختار جيمك</strong><p>شوف الفروع المشاركة وسعر الزيارة ومكان كل فرع.</p></li><li><strong>اعرض رمز الدخول</strong><p>عند وصولك، الكاشير يؤكد الزيارة ويخصم نقاطها من محفظتك.</p></li></ol>
                <button className="secondary full" onClick={() => navigate("gyms")}>اكتشف الجيمات<MapPin size={18} /></button>
              </section>
            </TraineeWallet>
          </> : section === "topup" ? <Purchases trainee /> : section === "gyms" ? <BranchDirectory onShowQr={() => navigate("qr")} /> : section === "qr" ? <TraineeQr standalone /> : <TraineeWallet revision={0} view="history" />}
        </div>
        <footer className="page-footer">Gym Network · ShoTech Solutions</footer>
      </main>
    </div>
  );
}
