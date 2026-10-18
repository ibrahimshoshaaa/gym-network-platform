"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Dumbbell,
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
} from "lucide-react";
import {
  request,
  api,
  send,
  message,
  type Identity,
  ApiError,
} from "../lib/client";
import { roleTabs, roleQuickTabs, roleName } from "../lib/navigation";
import { AdminHome } from "./admin-home";
import { Login } from "./login";
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
type Tab =
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
  { id: "home" as const, label: "الرئيسية", icon: House, description: "خطوات تجهيز المنصة والوصول السريع لمهام التشغيل" },
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
    label: "الإلغاء والتصحيح",
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
    label: "أسعار الزيارات",
    icon: ClipboardCheck,
    description: "مراجعة أسعار الزيارة ومدد الجلسات المقترحة",
  },
  {
    id: "reviews" as const,
    label: "مراجعة الشحن",
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
    label: "حسابات التحويل",
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
    [password, setPassword] = useState(false);
  function loggedIn(person: Identity) {
    setUser(person);
    setTab(
      person.role === "PLATFORM_ADMIN"
        ? "home"
        : person.role === "TRAINEE"
          ? "trainee"
          : ["CASHIER", "BRANCH_MANAGER"].includes(person.role)
            ? "cashier"
            : "gyms",
    );
    setError("");
  }
  async function check() {
    setLoading(true);
    setError("");
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
          <Dumbbell size={28} />
        </span>
        <Busy>جاري فتح لوحة التحكم</Busy>
      </main>
    );
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
  const admin = user.role === "PLATFORM_ADMIN",
    available = tabs.filter(t => roleTabs[user.role]?.includes(t.id)),
    current = available.find((t) => t.id === tab) ?? available[0]!;
  function navigate(next: Tab) { setTab(next); setMobile(false); window.scrollTo({ top: 0, behavior: "auto" }); }
  const quick = (roleQuickTabs[user.role] ?? []).map(id => available.find(t => t.id === id)).filter((item): item is typeof available[number] => Boolean(item));
  return (
    <div className="app-shell">
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
            <Dumbbell size={24} />
          </span>
          <span>
            GYM<span className="brand-light">NETWORK</span>
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
          {[{label:"التشغيل",ids:["home","cashier","reviews","branch-prices","gyms"]},{label:"الأرصدة والمتابعة",ids:["purchases","inventory","withdrawals","reports","operation-reviews"]},{label:"إعدادات المنصة",ids:["pricing","payments","packages"]}].map(group => ({...group,items:available.filter(item=>group.ids.includes(item.id))})).filter(group=>group.items.length>0).map(group=><div className="navigation-group" key={group.label}><span className="nav-label">{group.label}</span>
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
              <strong>{current.label}</strong>
            </span>
          </div>
          <div className="profile">
            <div>
              <strong>{user.displayName}</strong>
              <small>{roleName(user.role)}</small>
            </div>
            <span className="avatar">{user.displayName.slice(0, 1)}</span>
          </div>
        </header>
        <main className="workspace-content">
          <div className="page-heading">
            <span className="eyebrow">
              GYM NETWORK / {admin ? "إدارة المنصة" : "الجيمات"}
            </span>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          <Notice text={error} />
          {current.id === "home" ? (
            <AdminHome onNavigate={navigate} />
          ) : current.id === "directory" ? (
            <BranchDirectory />
          ) : current.id === "inventory" ? (
            <Inventory admin={admin} />
          ) : current.id === "reports" ? (
            <Reports admin={admin} />
          ) : current.id === "withdrawals" ? (
            <Withdrawals admin={admin} />
          ) : current.id === "operation-reviews" ? (
            <OperationReviews admin={admin} />
          ) : current.id === "cashier" ? (
            <Cashier />
          ) : current.id === "trainee" ? (
            <TraineeQr />
          ) : current.id === "gyms" ? (
            <GymManagement admin={admin} />
          ) : current.id === "branch-prices" ? (
            <PriceReviews />
          ) : current.id === "reviews" ? (
            <Reviews />
          ) : current.id === "purchases" ? (
            <Purchases />
          ) : (
            <SettingsPanel key={current.id} section={current.id} />
          )}
          <footer className="page-footer">
            Gym Network <span>•</span> ShoTech Solutions
          </footer>
        </main>
      </div>
      <nav className="role-quick-nav" aria-label="وصول سريع">{quick.map(item => <button key={item.id} aria-current={current.id === item.id ? "page" : undefined} className={current.id === item.id ? "active" : ""} onClick={() => navigate(item.id)}><item.icon size={21}/><span>{item.label}</span></button>)}<button onClick={() => setMobile(true)} aria-label="كل الأقسام"><Menu size={21}/><span>المزيد</span></button></nav>
      {password && <PasswordChange onClose={() => setPassword(false)} />}
    </div>
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
