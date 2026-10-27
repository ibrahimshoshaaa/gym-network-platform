"use client";
import {useEffect,useState,type FormEvent} from "react";
import {Building2,ClipboardCheck,Coins,CreditCard,FileCheck2,House,KeyRound,LogOut,Menu,MessageCircle,Package,Send,Settings,ShieldCheck,Sparkles,Wallet,Wrench,ChevronLeft,ArrowLeft, type LucideIcon} from "lucide-react";
import {request,api,send,message,type Identity,ApiError} from "../lib/client";
import {adminSections,adminSectionFor,isAdminDestination,roleQuickTabs,type AdminDestination} from "../lib/navigation";
import {AdminSideNav} from "./admin-side-nav";
import {AdminHome} from "./admin-home";
import {AdminFinance} from "./platform-finance";
import {NetworkMark} from "./platform-identity";
import {Login} from "./login";
import {AccountTools} from "./updates";
import {SettingsPanel} from "./settings";
import {SupportSettings} from "./support-settings";
import {BookingAdmin} from "./booking-admin";
import {ServicePriceReview} from "./service-price-review";
import {GymApplications} from "./gym-applications";
import {GymManagement} from "./gyms/management";
import {PriceReviews} from "./gyms/pricing";
import {Reviews} from "./reviews";
import {PointWallet} from "./point-wallet";
import {Withdrawals} from "./withdrawals";
import {Disputes} from "./disputes";
import {Reports} from "./reports";
import {OperationReviews} from "./operation-reviews";
import {PromotionAdmin} from "./promotion-admin";
import {MaintenanceAdmin} from "./maintenance-admin";
import {MarketAdmin} from "./market-admin";
import {Campaigns} from "./campaigns";
import {Support} from "./support";
import {Users,AuditLog,ExpiredWallets} from "./users";
import {AccountDeletions} from "./account-deletion";
import {Busy,Field,Modal,Notice} from "./ui";
type Destination={id:AdminDestination;label:string;description:string;icon:LucideIcon};
const descriptions:Partial<Record<AdminDestination,[string,string,LucideIcon]>>={
 reviews:["طلبات الشحن","مطابقة التحويلات والموافقة على إضافة النقاط",FileCheck2],
 "gym-applications":["طلبات انضمام الجيمات","مراجعة طلبات الانضمام وقبولها أو رفضها",Building2],
 "branch-prices":["أسعار الزيارات","اعتماد أسعار الزيارة ومددها المقترحة",Coins],
 "service-prices":["أسعار الخدمات","مراجعة أسعار الخدمات التي تقدمها الفروع",Coins],
 "booking-reviews":["مراجعة عدم الحضور","البت في الحجوزات المعلقة وتوزيع نقاطها",ClipboardCheck],
 "operation-reviews":["الإلغاء والتصحيح","مراجعة طلبات تصحيح العمليات",ClipboardCheck],
 "direct-topup":["شحن مباشر بالرقم","شحن محفظة المتدرب بعد تأكيد التحصيل",Send],
 withdrawals:["السحب والتسويات","مراجعة السحب وتسجيل التحويل وإثباته",Wallet],
 disputes:["مبالغ محل المراجعة","حجز وفك المبالغ المرتبطة بنزاع",ShieldCheck],
 reports:["التقارير","حركة العمليات والأرصدة وتصدير التقارير",ClipboardCheck],
 maintenance:["طلبات الصيانة","متابعة الأعطال والعروض والتنفيذ",Wrench],
 "promotion-requests":["إعلانات الفروع","مراجعة العروض وتحديد تكلفة الإعلان",FileCheck2],
 market:["إدارة الماركت","مراجعة المعروض والبلاغات",Package],
 support:["الدعم والشكاوى","الرد على رسائل العملاء ومتابعتها",MessageCircle],
 campaigns:["الحملات والإشعارات","إدارة الجمهور ومواعيد الظهور والمحتوى",Send],
 users:["المستخدمون والحسابات","البحث وإدارة إتاحة الحسابات",ShieldCheck],
 "account-deletions":["طلبات حذف الحساب","مراجعة طلبات الحذف وعوائق التسوية",ShieldCheck],
 "wallet-expiry":["أرصدة تحتاج مراجعة","المحافظ المنتهية وحالة النقاط غير المتاحة",Wallet],
 audit:["سجل التغييرات","من نفذ القرار وسببه وتوقيته",ClipboardCheck],
 pricing:["التسعير ومستحقات الجيم","سعر النقطة ونسبة مستحقات الجيم من الزيارة",Coins],
 welcome:["النقاط الترحيبية","هدية التسجيل للحسابات الجديدة",Sparkles],
 payments:["حسابات استقبال التحويل","إنستا باي والمحفظة الإلكترونية",CreditCard],
 packages:["باقات النقاط","الكميات المتاحة للشحن وحالة كل باقة",Package],
 "booking-policy":["سياسة الحجز والحضور","مهلة السماح وطريقة توزيع نقاط عدم الحضور",ClipboardCheck],
 "support-contact":["بيانات التواصل","رقم واتساب الذي يظهر لعملاء المنصة",MessageCircle],
};
const sectionIcons:Record<string,LucideIcon>={home:House,requests:FileCheck2,gyms:Building2,finance:Wallet,services:Wrench,communication:MessageCircle,oversight:ShieldCheck,settings:Settings};
export const adminItems:Destination[]=adminSections.flatMap(section=>[
 {id:section.id,label:section.label,description:section.description,icon:sectionIcons[section.id]!},
 ...section.items.map(id=>({id,label:descriptions[id]![0],description:descriptions[id]![1],icon:descriptions[id]![2]})),
]);
export function Dashboard(){
 const [user,setUser]=useState<Identity|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[tab,setTab]=useState<AdminDestination>("home"),[mobile,setMobile]=useState(false),[loggingOut,setLoggingOut]=useState(false),[password,setPassword]=useState(false),[reviewGym,setReviewGym]=useState<string|null>(null);
 function loggedIn(person:Identity){if(person.role!=="PLATFORM_ADMIN"){setError("الدخول إلى الويب متاح لصاحب المنصة فقط.");return;}setUser(person);setError("");}
 async function check(){setLoading(true);setError("");try{loggedIn((await request<{user:Identity}>("/api/session")).user);}catch(e){if(!(e instanceof ApiError&&[401,403].includes(e.status)))setError(message(e));}finally{setLoading(false);}}
 useEffect(()=>{const restore=()=>{const value=new URL(window.location.href).searchParams.get("section");setTab(isAdminDestination(value)?value:"home");};restore();void check();const expire=()=>{setUser(null);setPassword(false);setError("");};window.addEventListener("popstate",restore);window.addEventListener("session-expired",expire);return()=>{window.removeEventListener("popstate",restore);window.removeEventListener("session-expired",expire);};},[]);
 async function logout(){if(loggingOut)return;setLoggingOut(true);setError("");try{await request("/api/logout",{method:"POST"});setUser(null);setMobile(false);}catch(e){setError(message(e));}finally{setLoggingOut(false);}}
 function navigate(next:AdminDestination){if(next!=="gyms")setReviewGym(null);setTab(next);setMobile(false);const url=new URL(window.location.href);url.searchParams.set("section",next);window.history.pushState(null,"",url.pathname+url.search);window.scrollTo({top:0,behavior:"auto"});}
 if(loading)return <main className="startup"><span className="brand-icon"><NetworkMark/></span><Busy>بنجهز لوحة إدارة المنصة</Busy></main>;
 if(!user)return <><Login onLogin={loggedIn}/>{error&&<div className="admin-access-error"><Notice text={error}/><button className="secondary" onClick={()=>void check()}>إعادة المحاولة</button></div>}</>;
 const current=adminItems.find(item=>item.id===tab)!,section=adminSectionFor(tab);
 function content(){switch(tab){
 case "home":return <AdminHome onNavigate={navigate}/>;
 case "finance":return <AdminFinance/>;
 case "gyms":return <GymManagement admin initialGym={reviewGym}/>;
 case "reviews":return <Reviews/>;
 case "gym-applications":return <GymApplications/>;
 case "branch-prices":return <PriceReviews onOpenGym={id=>{setReviewGym(id);navigate("gyms");}}/>;
 case "service-prices":return <ServicePriceReview/>;
 case "booking-reviews":return <BookingAdmin section="reviews"/>;
 case "booking-policy":return <BookingAdmin section="policy"/>;
 case "direct-topup":return <PointWallet admin/>;
 case "withdrawals":return <Withdrawals admin/>;
 case "disputes":return <Disputes admin/>;
 case "reports":return <Reports admin/>;
 case "operation-reviews":return <OperationReviews admin/>;
 case "maintenance":return <MaintenanceAdmin/>;
 case "promotion-requests":return <PromotionAdmin/>;
 case "market":return <MarketAdmin/>;
 case "campaigns":return <Campaigns/>;
 case "support":return <Support/>;
 case "users":return <Users/>;
 case "account-deletions":return <AccountDeletions/>;
 case "wallet-expiry":return <ExpiredWallets/>;
 case "audit":return <AuditLog/>;
 case "pricing":case "welcome":case "payments":case "packages":return <SettingsPanel key={tab} section={tab}/>;
 case "support-contact":return <SupportSettings/>;
 default:return <section className="admin-destination-grid" aria-label={section.label}>{section.items.map(id=>{const item=adminItems.find(item=>item.id===id)!;return <button className="card admin-destination" key={id} onClick={()=>navigate(id)}><item.icon size={25}/><strong>{item.label}</strong><span>{item.description}</span><ArrowLeft size={18}/></button>;})}</section>;
 }}
 return <div className="app-shell admin-workspace">
 {mobile&&<button className="nav-backdrop" aria-label="إغلاق القائمة" onClick={()=>setMobile(false)}/>}
 <aside className={`sidebar ${mobile?"mobile-open":""}`}><div className="brand"><img src="/brand/gymbank-wordmark.png" width="170" height="42" alt="GymBank"/></div><div className="workspace"><span className="workspace-mark"><ShieldCheck size={22}/></span><div><strong>إدارة المنصة</strong><small>صاحب المنصة فقط</small></div></div>
 <nav aria-label="القائمة الرئيسية"><AdminSideNav items={adminItems} current={tab} onNavigate={id=>{if(isAdminDestination(id))navigate(id);}}/></nav>
 <div className="sidebar-bottom"><button onClick={()=>setPassword(true)}><KeyRound size={18}/>تغيير كلمة المرور</button><button onClick={()=>void logout()} disabled={loggingOut}><LogOut size={18}/>{loggingOut?"جاري تسجيل الخروج":"تسجيل الخروج"}</button><div className="sidebar-credit">ShoTech Solutions</div></div></aside>
 <div className="main-area"><header className="topbar"><div className="topbar-start"><button className="icon-button mobile-menu" aria-label="فتح القائمة" onClick={()=>setMobile(true)}><Menu size={24}/></button><span className="breadcrumb">إدارة المنصة<ChevronLeft size={14}/><strong>{section.label}</strong></span></div><AccountTools user={user} onNavigate={id=>{if(isAdminDestination(id))navigate(id);}}/><div className="profile"><div><strong>{user.displayName}</strong><small>صاحب المنصة</small></div><span className="avatar">{user.displayName.slice(0,1)}</span></div></header>
 <main className="workspace-content">{tab!=="home"&&<div className="page-heading">{section.id!==tab&&<button className="text-button" onClick={()=>navigate(section.id)}>العودة إلى {section.label}</button>}<h1>{current.label}</h1><p>{current.description}</p></div>}<Notice text={error}/>{content()}<footer className="page-footer">GymBank · ShoTech Solutions</footer></main></div>
 <nav className="role-quick-nav" aria-label="وصول سريع">{roleQuickTabs.PLATFORM_ADMIN.map(id=>{const item=adminItems.find(item=>item.id===id)!;return <button key={id} className={section.id===id?"active":""} aria-current={section.id===id?"page":undefined} onClick={()=>navigate(id)}><item.icon size={21}/><span>{id==="requests"?"الطلبات":id==="finance"?"المالية":id==="settings"?"الإعدادات":item.label}</span></button>;})}</nav>
 {password&&<PasswordChange onClose={()=>setPassword(false)}/>}
 </div>;
}
function PasswordChange({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (form.get("new") !== form.get("confirm"))
        throw new Error("تأكيد كلمة المرور لا يطابق الكلمة الجديدة.");
      await api(
        "auth/password/change",
        send({
          currentPassword: form.get("current"),
          newPassword: form.get("new"),
        }),
      );
      setSuccess(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="تغيير كلمة المرور" onClose={onClose} locked={busy}>
      {success ? (
        <>
          <Notice
            text="تم تغيير كلمة المرور وإنهاء الجلسات السابقة. جلستك الحالية جاهزة."
            success
          />
          <button className="primary full" onClick={onClose}>
            تم
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <Field
              label="كلمة المرور الحالية"
              type="password"
              name="current"
              autoComplete="current-password"
              required
              maxLength={256}
            />
            <Field
              label="كلمة المرور الجديدة"
              type="password"
              name="new"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              hint="8 خانات على الأقل."
            />
            <Field
              label="تأكيد الكلمة الجديدة"
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
            <Notice text={error} />
            <button className="primary full">
              {busy ? <Busy>جاري الحفظ</Busy> : "حفظ كلمة المرور"}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}


