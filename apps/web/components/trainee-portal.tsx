"use client";
import { NetworkMark, PlatformHero } from "./platform-identity";
import { useState } from "react";
import { Wallet, PlusCircle, MapPin, QrCode, History, LogOut, KeyRound, ArrowLeft } from "lucide-react";
import type { Identity } from "../lib/client";
import { BranchDirectory } from "./branch-directory";
import { Purchases } from "./purchases";
import { TraineeQr } from "./operations";
import { TraineeWallet } from "./trainee-wallet";
import { Busy, Notice } from "./ui";

import { Support } from "./support";
import { AccountTools } from "./updates";
const sections = [
  { id: "wallet", label: "محفظتي", title: "كل اللي تحتاجه لتمرينتك الجاية", icon: Wallet },
  { id: "topup", label: "اشحن رصيدك", title: "اشحن نقاطك في خطوات بسيطة", icon: PlusCircle },
  { id: "gyms", label: "الجيمات", title: "اختار تمرينتك الجاية", icon: MapPin },
  { id: "qr", label: "رمز الدخول", title: "اعرض الرمز عند وصولك للجيم", icon: QrCode },
  { id: "visits", label: "زياراتي", title: "زياراتك وحركة نقاطك", icon: History },
] as const;
type Section = typeof sections[number]["id"] | "support";
export function TraineePortal({ user, logout, loggingOut, onPassword, error }: {
  user: Identity; logout: () => Promise<void>; loggingOut: boolean; onPassword: () => void; error: string;
}) {
  const [section, setSection] = useState<Section>("wallet");
  const current = sections.find(item => item.id === section) ?? {label:"الدعم والمساعدة",title:"طلباتك ورسائلك مع إدارة المنصة"};
  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  return (
    <div className="trainee-portal">
      <header className="trainee-header">
        <div className="brand"><span className="brand-icon"><NetworkMark /></span><span>GYM<span className="brand-light">BANK</span></span></div>
        <AccountTools user={user} onNavigate={next=>{if(next==="support"||sections.some(s=>s.id===next))navigate(next as Section);}}/>
        <div className="trainee-account">
          <span><strong>{user.displayName}</strong><small>حساب متدرب</small></span>
          <button className="icon-button" aria-label="تغيير كلمة المرور" onClick={onPassword}><KeyRound size={20} /></button>
          <button className="icon-button" aria-label="تسجيل الخروج" disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? <Busy /> : <LogOut size={20} />}</button>
        </div>
      </header>
      <main className="trainee-content">
        <PlatformHero eyebrow={section === "wallet" ? "جاهز لتمرينتك؟" : current.label} title={section === "wallet" ? `أهلًا يا ${user.displayName.split(" ")[0]}` : current.label}>{current.title}</PlatformHero>
        <Notice text={error} />
        <nav className="trainee-navigation" aria-label="قائمة المتدرب">
          {sections.map(item => <button key={item.id} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={22} /><span>{item.label}</span></button>)}
        </nav>
        <div key={section}>
          {section === "support" ? <Support/> : section === "wallet" ? <>
            <div className="trainee-quick-actions">
              <button className="primary" onClick={() => navigate("topup")}><PlusCircle size={19} />اشحن محفظتك<ArrowLeft size={17} /></button>
              <button className="secondary" onClick={() => navigate("qr")}><QrCode size={19} />افتح رمز الدخول</button>
            </div>
            <TraineeWallet revision={0} view="wallet">
              <section className="card trainee-start">
                <span className="eyebrow">تمرينتك الجاية</span><h2>هتتمرّن فين النهارده؟</h2><p className="muted">شوف الجيمات القريبة وسعر الزيارة قبل ما تتحرك.</p><button className="primary full" onClick={() => navigate("gyms")}>اختار جيم قريب<MapPin size={18}/></button><details className="getting-started"><summary>أول مرة تستخدم المنصة؟</summary>
                <ol><li><strong>اشحن نقاطك</strong><p>اختار الكمية، حوّل المبلغ وارفع الإيصال. الرصيد يظهر بعد موافقة الإدارة.</p></li><li><strong>اختار جيمك</strong><p>شوف الفروع المشاركة وسعر الزيارة ومكان كل فرع.</p></li><li><strong>اعرض رمز الدخول</strong><p>عند وصولك، الكاشير يؤكد الزيارة ويخصم نقاطها من محفظتك.</p></li></ol>
                </details>
              </section>
            </TraineeWallet>
          </> : section === "topup" ? <Purchases trainee onWallet={() => navigate("wallet")} /> : section === "gyms" ? <BranchDirectory onShowQr={() => navigate("qr")} /> : section === "qr" ? <TraineeQr standalone /> : <TraineeWallet revision={0} view="history" />}
        </div>
        <footer className="page-footer">GymBank · ShoTech Solutions</footer>
      </main>
    </div>
  );
}

