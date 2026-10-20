"use client";
import { NetworkMark } from "./platform-identity";
import { useEffect, useState, type FormEvent } from "react";
import {
  FileCheck2,
  Coins,
  CreditCard,
  Package,
  Menu,
  LogOut,
  ShieldCheck,
  ChevronLeft,
  KeyRound,
  Building2,
  MapPin,
  ClipboardCheck,
  House,
  Send,
  Wallet,
  MoreHorizontal,
} from "lucide-react";
import {
  request,
  api,
  send,
  message,
  type Identity,
  ApiError,
} from "../lib/client";
import { roleTabs, roleQuickTabs, roleName, adminSections, adminSectionFor } from "../lib/navigation";
import { WorkHome, type CashierTask } from "./work-home";
import { invitationToken } from "../lib/invitation-link";
import { AdminFinance } from "./platform-finance";
import { AdminHome } from "./admin-home";
import { OwnerJoinAccess } from "./owner-join-access";
import { Login } from "./login";
import { OwnerPortal } from "./owner-portal";
import { TraineePortal } from "./trainee-portal";
import { SettingsPanel } from "./settings";
import { Cashier, TraineeQr } from "./operations";
import { OperationReviews } from "./operation-reviews";
import { Withdrawals } from "./withdrawals";
import { Reports } from "./reports";
import { Inventory } from "./inventory";
import { BranchDirectory } from "./branch-directory";
import { Reviews } from "./reviews";
import { GymManagement } from "./gyms/management";
import { PriceReviews } from "./gyms/pricing";
import { Purchases } from "./purchases";
import { Busy, Field, Modal, Notice } from "./ui";
import { Disputes } from "./disputes";
import { Support } from "./support";
import { Users, AuditLog } from "./users";
import { AccountTools } from "./updates";
import { AccountRecovery, recoveryToken } from "./account-recovery";
import { PointWallet } from "./point-wallet";
import { GymApplications } from "./gym-applications";
type Tab =
  | "requests" | "finance" | "more"
  | "gym-applications"
  | "direct-topup" | "point-wallet"
  | "support" | "users" | "audit" | "disputes"
  | "home"
  | "directory"
  | "inventory"
  | "reports"
  | "withdrawals"
  | "operation-reviews"
  | "cashier"
  | "trainee"
  | "gyms"
  | "branch-prices"
  | "reviews"
  | "pricing"
  | "payments"
  | "packages"
  | "purchases";
const tabs = [
  {id:"requests" as const,label:"الطلبات",icon:FileCheck2,description:"طلبات الشحن والانضمام والأسعار والإلغاء والسحب"},
  {id:"finance" as const,label:"المالية",icon:Wallet,description:"التحصيلات والمستحقات وحركة النقاط"},
  {id:"more" as const,label:"المزيد",icon:MoreHorizontal,description:"الدعم والمستخدمون وإعدادات المنصة"},
  {id:"gym-applications" as const,label:"طلبات الانضمام",icon:Building2,description:"مراجعة بيانات أصحاب الجيمات المسجلين من التطبيق وقبول أو رفض انضمامهم"},
  {id:"direct-topup" as const,label:"شحن مباشر بالرقم",icon:Send,description:"شحن المتدرب أو الجيم برقم الموبايل بعد تأكيد التحصيل"},
  {id:"point-wallet" as const,label:"محفظة الجيم والإرسال",icon:Wallet,description:"رصيد جيمك وإرسال النقاط للمتدربين برقم الموبايل"},
  {id:"disputes" as const,label:"حجوزات النزاعات",icon:ShieldCheck,description:"حجز المبلغ محل المراجعة وفكّه مع الحفاظ على باقي المستحقات"},
  {id:"support" as const,label:"الدعم والشكاوى",icon:FileCheck2,description:"طلبات المساعدة والاعتراضات والردود ومرفقاتها"},
  {id:"users" as const,label:"المستخدمون والحسابات",icon:ShieldCheck,description:"البحث وتعطيل الوصول واستعادة الحسابات"},
  {id:"audit" as const,label:"سجل التغييرات",icon:ClipboardCheck,description:"القرارات ومن نفذها وتوقيتها ومرجعها"},
  { id: "home" as const, label: "الرئيسية", icon: House, description: "اختار مهمتك وابدأ من هنا" },
  {
    id: "directory" as const,
    label: "دليل الجيمات",
    icon: MapPin,
    description: "الفروع المشاركة والأسعار والمواقع ومواعيد العمل",
  },
  {
    id: "inventory" as const,
    label: "مخزون الفروع",
    icon: Package,
    description: "الأرصدة وحركة النقاط والنقل بين الفروع",
  },
  {
    id: "reports" as const,
    label: "التقارير والمتابعة",
    icon: ClipboardCheck,
    description: "حركة الفترة والأرصدة الحالية وتنبيهات الطلبات",
  },
  {
    id: "withdrawals" as const,
    label: "السحب والتسويات",
    icon: CreditCard,
    description: "طلبات السحب اليدوي والإثبات وتأكيد الاستلام والاعتراض",
  },
  {
    id: "operation-reviews" as const,
    label: "طلبات الإلغاء والتصحيح",
    icon: ClipboardCheck,
    description: "طلبات مراجعة الزيارات وتصحيح مبيعات النقاط",
  },
  {
    id: "cashier" as const,
    label: "الكاشير والزيارات",
    icon: Building2,
    description: "بيع نقاط الفرع وتأكيد حضور المتدربين بالـQR",
  },
  {
    id: "trainee" as const,
    label: "محفظتي ورمز الدخول",
    icon: ShieldCheck,
    description: "رصيد المحفظة ورمز QR قصير الصلاحية وسجل الزيارات",
  },
  {
    id: "gyms" as const,
    label: "الجيمات والفروع",
    icon: MapPin,
    description: "إدارة الجيمات والفروع والدعوات والموظفين",
  },
  {
    id: "branch-prices" as const,
    label: "اعتماد أسعار الزيارات",
    icon: ClipboardCheck,
    description: "مراجعة أسعار الزيارة ومدد الجلسات المقترحة",
  },
  {
    id: "reviews" as const,
    label: "طلبات الشحن",
    icon: FileCheck2,
    description: "طلبات التحويل التي تحتاج قرارك",
  },
  {
    id: "pricing" as const,
    label: "الأسعار والنسب",
    icon: Coins,
    description: "إدارة سعر النقطة وخصم الجيم ونسبة إعادة البيع",
  },
  {
    id: "payments" as const,
    label: "حسابات استقبال التحويل",
    icon: CreditCard,
    description: "إدارة بيانات إنستا باي والمحفظة الإلكترونية",
  },
  {
    id: "packages" as const,
    label: "باقات النقاط",
    icon: Package,
    description: "كميات نقاط مناسبة للمتدربين والجيمات",
  },
  {
    id: "purchases" as const,
    label: "شراء نقاط الفروع",
    icon: Building2,
    description: "طلبات شراء النقاط ومتابعة مراجعتها",
  },
];
export function Dashboard() {
  const [user, setUser] = useState<Identity | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState<Tab>("home"),
    [mobile, setMobile] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [password, setPassword] = useState(false),
    [reviewGym,setReviewGym]=useState<string|null>(null),
    [cashierTask, setCashierTask] = useState<CashierTask>("visit"),
    [recovery, setRecovery] = useState<string|null>(null);
  const [delegatedFull,setDelegatedFull]=useState(false);
  useEffect(()=>{let live=true;setDelegatedFull(false);if(user&&user.role!=='GYM_OWNER'&&user.role!=='PLATFORM_ADMIN')api<{items:unknown[]}>('gyms?limit=1').then(r=>{if(live)setDelegatedFull(r.items.length>0);}).catch(()=>{});return()=>{live=false;};},[user?.id,user?.role]);
  function loggedIn(person: Identity) {
    setReviewGym(null);
    setUser(person);
    setTab(person.role === "TRAINEE" ? "trainee" : "home");
    setCashierTask("visit");
    setError("");
  }
  async function check() {
    setLoading(true);
    setError("");
    const restore=recoveryToken(window.location.hash);
    if(restore){setRecovery(restore);window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);setLoading(false);return;}
    if (invitationToken(window.location.hash)) { setUser(null); setLoading(false); return; }
    try {
      const result = await request<{ user: Identity }>("/api/session");
      loggedIn(result.user);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void check();
    const expire = () => {
      setUser(null);
      setPassword(false);
      setError("");
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");
    try {
      await request("/api/logout", { method: "POST" });
      setUser(null);
      setMobile(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoggingOut(false);
    }
  }
  if (loading)
    return (
      <main className="startup">
        <span className="brand-icon">
          <NetworkMark />
        </span>
        <Busy>بنجهز حسابك</Busy>
      </main>
    );
  if(recovery)return <AccountRecovery token={recovery} onBack={()=>{setRecovery(null);setUser(null);}}/>;
  if (!user)
    return error ? (
      <main className="startup">
        <Notice text={error} />
        <button className="primary" onClick={() => void check()}>
          إعادة المحاولة
        </button>
      </main>
    ) : (
      <Login onLogin={loggedIn} />
    );
  if (user.role === "TRAINEE") return <>
    <TraineePortal user={user} logout={logout} loggingOut={loggingOut} onPassword={() => setPassword(true)} error={error} />
    {password && <PasswordChange onClose={() => setPassword(false)} />}
  </>;
  if(user.role === "GYM_OWNER"||delegatedFull)return <OwnerJoinAccess key={user.id} enabled={user.role==="GYM_OWNER"} onLogout={logout} loggingOut={loggingOut}><OwnerPortal user={user} logout={logout} loggingOut={loggingOut} onPassword={()=>setPassword(true)} error={error}/>{password&&<PasswordChange onClose={()=>setPassword(false)}/>}</OwnerJoinAccess>;
  const admin = user.role === "PLATFORM_ADMIN",
    available = tabs.filter(t => roleTabs[user.role]?.includes(t.id)),
    current = available.find((t) => t.id === tab) ?? available[0]!;
  function navigate(next: Tab, task?: CashierTask) { if(next!=="gyms")setReviewGym(null); if (task) setCashierTask(task); setTab(next); setMobile(false); window.scrollTo({ top: 0, behavior: "auto" }); }
  const adminSection = adminSectionFor(current.id);
  const contentTab = current.id === "requests" ? "reviews" : current.id === "more" ? "support" : current.id;
  const quick = (roleQuickTabs[user.role] ?? []).map(id => available.find(t => t.id === id)).filter((item): item is typeof available[number] => Boolean(item));
  return (
    <OwnerJoinAccess key={user.id} enabled={user.role === "GYM_OWNER"} onLogout={logout} loggingOut={loggingOut}><div className={`app-shell ${admin ? "admin-workspace" : ""}`}>
      {mobile && (
        <button
          className="nav-backdrop"
          aria-label="إغلاق القائمة"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="brand">
          <span className="brand-icon">
            <NetworkMark />
          </span>
          <span>
            GYM<span className="brand-light">BANK</span>
          </span>
        </div>
        <div className="workspace">
          <span className="workspace-mark">
            <ShieldCheck size={22} />
          </span>
          <div>
            <strong>{admin ? "إدارة المنصة" : "مساحة الجيم"}</strong>
            <small>لوحة التحكم</small>
          </div>
          <span className="online-dot" />
        </div>
        <span className="nav-label">مساحة العمل</span>
        <nav aria-label="القائمة الرئيسية">
          {admin ? adminSections.map(section=>{const item=available.find(t=>t.id===section.id)!;return <button key={section.id} aria-current={adminSection.id===section.id?"page":undefined} className={adminSection.id===section.id?"active":""} onClick={()=>navigate(section.id)}><item.icon size={20}/><span>{section.label}</span>{adminSection.id===section.id?<ChevronLeft size={16}/>:null}</button>;}) : [{label:"التشغيل",ids:["home","point-wallet","cashier","reviews","branch-prices","gyms"]},{label:"الأرصدة والمتابعة",ids:["purchases","inventory","withdrawals","reports","operation-reviews","support"]},{label:"إعدادات المنصة",ids:["pricing","payments","packages","users","audit"]}].map(group => ({...group,items:available.filter(item=>group.ids.includes(item.id))})).filter(group=>group.items.length>0).map(group=><div className="navigation-group" key={group.label}><span className="nav-label">{group.label}</span>
          {group.items.map((item) => (
            <button
              key={item.id}
              aria-current={current.id === item.id ? "page" : undefined}
              className={current.id === item.id ? "active" : ""}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {current.id === item.id && <ChevronLeft size={16} />}
            </button>
          ))}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setPassword(true)}>
            <KeyRound size={18} />
            تغيير كلمة المرور
          </button>
          <button onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? (
              <Busy>جاري تسجيل الخروج</Busy>
            ) : (
              <>
                <LogOut size={18} />
                تسجيل الخروج
              </>
            )}
          </button>
          <div className="sidebar-credit">
            Powered by <strong>ShoTech</strong>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="فتح القائمة"
              onClick={() => setMobile(true)}
            >
              <Menu size={24} />
            </button>
            <span className="breadcrumb">
              لوحة التحكم <ChevronLeft size={14} />
              <strong>{admin ? adminSection.label : current.label}</strong>
            </span>
          </div>
          <AccountTools user={user} onNavigate={next=>{const item=available.find(t=>t.id===next);if(item)navigate(item.id);}}/>
          <div className="profile">
            <div>
              <strong>{user.displayName}</strong>
              <small>{roleName(user.role)}</small>
            </div>
            <span className="avatar">{user.displayName.slice(0, 1)}</span>
          </div>
        </header>
        <main className="workspace-content">
          {current.id !== "home" && <div className="page-heading">
            <h1>{admin ? adminSection.label : current.label}</h1>
            <p>{admin ? adminSection.description : current.description}</p>
          </div>}
          {admin && adminSection.items.length>0 ? <nav className="admin-section-tabs" aria-label={`أقسام ${adminSection.label}`}>
            {adminSection.id==="finance"?<button aria-current={current.id==="finance"?"page":undefined} className={current.id==="finance"?"active":""} onClick={()=>navigate("finance")}>نظرة عامة</button>:null}
            {adminSection.items.map(id=>{const item=available.find(t=>t.id===id)!;return <button key={id} aria-current={contentTab===id?"page":undefined} className={contentTab===id?"active":""} onClick={()=>navigate(id)}>{item.label}</button>;})}
          </nav>:null}
          <Notice text={error} />
          {contentTab === "finance" ? <AdminFinance/> : contentTab === "gym-applications" ? <GymApplications/> : contentTab === "direct-topup" || contentTab === "point-wallet" ? <PointWallet admin={admin}/> : contentTab === "disputes" ? <Disputes admin={admin}/> : contentTab === "support" ? <Support admin={admin}/> : contentTab === "users" ? <Users/> : contentTab === "audit" ? <AuditLog/> : contentTab === "home" ? (
            admin ? <AdminHome onNavigate={navigate} /> : <WorkHome role={user.role} name={user.displayName} onNavigate={navigate} />
          ) : contentTab === "directory" ? (
            <BranchDirectory />
          ) : contentTab === "inventory" ? (
            <Inventory admin={admin} />
          ) : contentTab === "reports" ? (
            <Reports admin={admin} />
          ) : contentTab === "withdrawals" ? (
            <Withdrawals admin={admin} />
          ) : contentTab === "operation-reviews" ? (
            <OperationReviews admin={admin} />
          ) : contentTab === "cashier" ? (
            <Cashier initialTask={cashierTask} />
          ) : contentTab === "trainee" ? (
            <TraineeQr />
          ) : contentTab === "gyms" ? (
            <GymManagement admin={admin} initialGym={reviewGym} />
          ) : contentTab === "branch-prices" ? (
            <PriceReviews onOpenGym={gymId=>{setReviewGym(gymId);navigate("gyms");}} />
          ) : contentTab === "reviews" ? (
            <Reviews />
          ) : contentTab === "purchases" ? (
            <Purchases />
          ) : (
            <SettingsPanel key={contentTab} section={contentTab} />
          )}
          <footer className="page-footer">
            GymBank <span>•</span> ShoTech Solutions
          </footer>
        </main>
      </div>
      <nav className="role-quick-nav" aria-label="وصول سريع">{quick.map(item => <button key={item.id} aria-current={(admin?adminSection.id===item.id:current.id===item.id)?"page":undefined} className={(admin?adminSection.id===item.id:current.id===item.id)?"active":""} onClick={() => navigate(item.id)}><item.icon size={21}/><span>{admin?(adminSections.find(section=>section.id===item.id)?.label??item.label):item.label}</span></button>)}<button className={admin&&adminSection.id==="more"?"active":""} aria-current={admin&&adminSection.id==="more"?"page":undefined} onClick={() => admin?navigate("more"):setMobile(true)} aria-label={admin?"المزيد":"كل الأقسام"}>{admin?<MoreHorizontal size={21}/>:<Menu size={21}/>}<span>المزيد</span></button></nav>
      {password && <PasswordChange onClose={() => setPassword(false)} />}
    </div></OwnerJoinAccess>
  );
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
              minLength={15}
              maxLength={128}
              hint="15 حرفًا على الأقل."
            />
            <Field
              label="تأكيد الكلمة الجديدة"
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              minLength={15}
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

