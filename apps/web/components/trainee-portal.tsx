"use client";
import {CampaignBanner} from "./campaign-banner";
import {PortalHeader} from "./portal-header";
import { useState } from "react";
import { Home, UserRound, Navigation, QrCode, History, MoreHorizontal } from "lucide-react";
import type { Identity } from "../lib/client";
import { BranchDirectory } from "./branch-directory";
import {ScreenBack,PortalIntro} from "./portal-ui";
import { Purchases,TopupHistory } from "./purchases";
import { Bookings } from "./bookings";
import {TraineeQr} from "./operations";
import { TraineeWallet } from "./trainee-wallet";
import { Notice } from "./ui";

import { Support } from "./support";

import { PortalAccount } from "./portal-account";
const sections = [
  { id: "wallet", label: "الرئيسية", icon: Home },
  { id: "gyms", label: "الجيمات", icon: Navigation },
  { id: "qr", label: "رمز الدخول", icon: QrCode },
  { id: "visits", label: "زياراتي", icon: History },
  { id: "account", label: "حسابي", icon: UserRound },
] as const;
type Section = typeof sections[number]["id"] | "support" | "topup" | "movements" | "topup-history" | "bookings";
export function TraineePortal({ user, logout, loggingOut, onPassword, error }: {
  user: Identity; logout: () => Promise<void>; loggingOut: boolean; onPassword: () => void; error: string;
}) {
  const [section, setSection] = useState<Section>("wallet");
  function navigate(next: Section) {
    setSection(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }
  return <div className="trainee-portal mobile-mirror">
    <PortalHeader intro={section==="wallet"} user={user} onNavigate={next=>{if(next==="support"||next==="topup"||sections.some(s=>s.id===next))navigate(next as Section);}}/>
    <main className="trainee-content"><Notice text={error}/>{section!=="wallet"&&["wallet","gyms","topup"].includes(section)&&<CampaignBanner placement={section==="gyms"?"GYMS":section==="topup"?"WALLET":"HOME"} onNavigate={next=>{if(["wallet","gyms","topup","qr","support"].includes(next))navigate(next as Section);}}/>}<div key={section}>
      {section === "wallet" ? <><div className="portal-welcome"><h1>أهلًا {user.displayName.split(" ")[0]}</h1><p className="muted">جاهز لتمرينتك؟</p></div><CampaignBanner placement="HOME" onNavigate={next=>{if(["wallet","gyms","topup","qr","support"].includes(next))navigate(next as Section);}}/><TraineeWallet revision={0} view="wallet" onQr={()=>navigate("qr")} onTopup={()=>navigate("topup")} onGyms={()=>navigate("gyms")} onHistory={()=>navigate("movements")}/></>
      : section === "account" ? <PortalAccount user={user} onPassword={onPassword} onPurchases={()=>navigate("topup-history")} onSupport={()=>navigate("support")} logout={logout} loggingOut={loggingOut}/>
      : section === "movements" ? <><ScreenBack title="حركة نقاطك" onBack={()=>navigate("wallet")}/><TraineeWallet revision={0} view="history"/></>
      : section === "topup-history" ? <><ScreenBack title="طلبات الشحن" onBack={()=>navigate("account")}/><TopupHistory/></>
      : section === "support" ? <Support/>
      : section === "topup" ? <Purchases trainee onWallet={()=>navigate("wallet")}/>
      : section === "gyms" ? <><h1>اكتشف جيمك</h1><p className="muted">اختار المكان المناسب وشوف نقاط الزيارة.</p><BranchDirectory onShowQr={()=>navigate("bookings")}/></>
      : section === "bookings" ? <><ScreenBack title="حجوزاتي" onBack={()=>navigate("qr")}/><Bookings onGyms={()=>navigate("gyms")}/></>
      : section === "qr" ? <><PortalIntro title="رمز الدخول" detail="داخل من غير حجز؟ اعرض الرمز ده لموظف الجيم."/><button className="secondary full" onClick={()=>navigate("bookings")}>حجوزاتي · اعرض QR الحجز</button><TraineeQr standalone/></>
      : <><h1>زياراتك</h1><p className="muted">كل تمرينة ونقاطها، في سجل واحد.</p><TraineeWallet revision={0} view="visits"/></>}
    </div><footer className="page-footer">GymBank · ShoTech Solutions</footer></main>
    <nav className="trainee-navigation" aria-label="قائمة المتدرب">{sections.map(item=><button key={item.id} aria-current={(section===item.id||(section==="bookings"&&item.id==="qr"))?"page":undefined} className={(section===item.id||(section==="bookings"&&item.id==="qr"))?"active":""} onClick={()=>navigate(item.id)}><item.icon size={22}/><span>{item.label}</span></button>)}</nav>
  </div>;
}

