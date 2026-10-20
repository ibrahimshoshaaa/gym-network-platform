"use client";
import { QrCode,Plus,Navigation,ArrowLeft,ArrowDownLeft,ArrowUpRight,Wallet } from "lucide-react";
import { RecordReference } from "./record-reference";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, date, message } from "../lib/client";
import { deadlineAt, secondsLeft, duration } from "../lib/server-deadline";
import { Busy, Empty, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
import { RequestAction } from "./operation-reviews";
type Wallet = {
  balance: number;
  spendablePoints: number;
  unavailablePoints: number;
  expiresAt: string | null;
  status: "EMPTY" | "VALID" | "EXPIRED" | "REVIEW_REQUIRED";
  serverTime: string;
};
type Visit = {
  id: string;
  pointsCharged: number;
  status: string;
  startedAt: string;
  expiresAt: string;
  cancellationReason: string | null;
  serverTime: string;
  branch: { id: string; name: string; gym: { id: string; name: string } };
};
type Movement = {
  sourceLabel?:string|null;
  id: string;
  transactionId: string;
  referenceId: string;
  operation: string;
  delta: number;
  eventAt: string;
  branch: { id: string; name: string; gymName: string } | null;
};
const operations: Record<string, string> = {
  TOPUP: "شحن من المنصة",
  SALE: "شراء نقاط من فرع",
  VISIT: "خصم زيارة",
  VISIT_CANCELLATION: "رد نقاط زيارة ملغاة",
  EXPIRY: "تسوية انتهاء مسجلة",
  ADJUSTMENT: "تسوية نقاط معتمدة",
};
function useDeadline(deadline: number | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(secondsLeft(deadline, performance.now()));
    tick();
    if (deadline === null) return;
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return left;
}
export function TraineeWallet({
  revision,
  children,
  view = "all",
  onQr,onTopup,onGyms,onHistory,
}: {
  revision: number;
  children?: ReactNode;
  view?: "all" | "wallet" | "history";
  onQr?:()=>void;onTopup?:()=>void;onGyms?:()=>void;onHistory?:()=>void;
}) {
  const [version, setVersion] = useState(0),
    [historyVersion, setHistoryVersion] = useState(0),
    [operation, setOperation] = useState("");
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    };
    const timer = setInterval(visible, 30000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const refresh = `${revision}:${version}`;
  return (
    <>
      {view!=="wallet"&&<div className="section-toolbar">
        <p className="muted">
          رصيدك وزياراتك بيتحدّثوا تلقائيًا.
        </p>
        <button
          className="secondary compact"
          onClick={() => {
            setVersion((v) => v + 1);
            setHistoryVersion((v) => v + 1);
          }}
        >
          تحديث
        </button>
      </div>}
      {view !== "history" && <div className="settings-grid">
        <WalletCard refresh={refresh} onQr={onQr} onTopup={onTopup}/>
        {children}
      </div>}
      {view === "wallet" && <>
        <button className="card portal-gym-link" onClick={onGyms}><Navigation/><span><strong>اختار جيم قريب</strong><small>شوف المكان ونقاط الزيارة</small></span><ArrowLeft/></button>
        <RecentMovements refresh={refresh} onHistory={onHistory}/>
      </>}
      <ActiveSessions refresh={refresh} compact={view==="wallet"}/>

      {view !== "wallet" && <><section className="card">
        <div className="section-toolbar">
          <h2>حركات نقاطك</h2>
          <label className="field">
            نوع الحركة
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
            >
              <option value="">كل الحركات</option>
              {Object.entries(operations).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          الحركات المنفذة فقط، الأحدث تسجيلًا أولًا. طلبات الشحن المعلقة لا تضيف
          نقاطًا قبل الاعتماد.
        </p>
        <MovementList
          key={`${operation}:${revision}:${historyVersion}`}
          operation={operation}
        />
      </section>
      <VisitHistory key={`${revision}:${historyVersion}`} /></>}
    </>
  );
}
function WalletCard({ refresh,onQr,onTopup }: { refresh: string;onQr?:()=>void;onTopup?:()=>void }) {
  const [wallet, setWallet] = useState<Wallet | null>(null),
    [error, setError] = useState(""),
    [deadline, setDeadline] = useState<number | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const started = performance.now();
    setLoading(true);
    api<Wallet>("trainee/wallet")
      .then((w) => {
        if (active) {
          setWallet(w);
          setDeadline(deadlineAt(w.expiresAt, w.serverTime, started));
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const left = useDeadline(deadline),
    expired =
      wallet?.status === "EXPIRED" ||
      (wallet?.status === "VALID" && left === 0),
    available = wallet && !expired ? wallet.spendablePoints : 0;
  return (
    <section className="card wallet-signature">
      <div className="wallet-signature-top"><h2>رصيدك المتاح</h2><Wallet size={22}/></div>
      <Notice text={error} />
      {!wallet ? (
        loading ? (
          <Busy />
        ) : (
          <Empty title="تعذر تحميل المحفظة" />
        )
      ) : (
        <>

          <h2 className="wallet-balance">{available} <small>نقطة</small></h2>

          {expired ? (
            <Notice
              text={`انتهت الصلاحية. ${wallet.balance} نقطة غير متاحة للاستخدام وتحتاج مراجعة؛ لم تُحذف تلقائيًا.`}
            />
          ) : wallet.status === "REVIEW_REQUIRED" ? (
            <Notice text="الرصيد يحتاج مراجعة صلاحية قبل استخدامه. تواصل مع إدارة المنصة." />
          ) : wallet.status === "EMPTY" ? (
            <p className="subtle-box">لا توجد نقاط متاحة حاليًا.</p>
          ) : (
            <p className="subtle-box">
              صالح حتى {wallet.expiresAt ? new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'numeric',year:'numeric',timeZone:'Africa/Cairo'}).format(new Date(wallet.expiresAt)) : '—'}
            </p>
          )}
          {!expired && wallet.status === "VALID" && left !== null && left > 0 && left <= 15*86400 && <Notice text={`صلاحية نقاطك تنتهي خلال ${Math.max(1,Math.ceil(left/86400))} يوم. راجع تاريخ الصلاحية قبل التمرين أو الشحن.`}/>}
          {(onQr||onTopup)&&<div className="trainee-quick-actions"><button className="primary" onClick={onQr}><QrCode size={20}/>رمز الدخول</button><button className="secondary" onClick={onTopup}><Plus size={20}/>اشحن رصيدك</button></div>}
          <details className="wallet-more wallet-diagnostics"><summary>تفاصيل الرصيد</summary><p>الرصيد المسجل: {wallet.balance} نقطة</p><small>آخر تحديث: {date(wallet.serverTime)}{loading ? " · تحديث…" : ""}</small><p className="muted">المتاح بيتراجع وقت كل عملية، وصلاحية النقاط ظاهرة فوق.</p></details>
        </>
      )}
    </section>
  );
}
function ActiveSessions({ refresh,compact=false }: { refresh: string;compact?:boolean }) {
  const [rows, setRows] = useState<(Visit & { deadline: number | null })[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const version = useRef(0);
  async function load(next?: string) {
    const current = ++version.current,
      started = performance.now();
    setLoading(true);
    setError("");
    try {
      const p = await api<{ items: Visit[]; nextCursor: string | null }>(
        `trainee/active-visits?limit=25${next ? `&cursor=${next}` : ""}`,
      );
      if (current !== version.current) return;
      const items = p.items.map((v) => ({
        ...v,
        deadline: deadlineAt(v.expiresAt, v.serverTime, started),
      }));
      setRows((old) =>
        next
          ? [...old, ...items.filter((v) => !old.some((x) => x.id === v.id))]
          : items,
      );
      setCursor(p.nextCursor);
    } catch (e) {
      if (current === version.current) setError(message(e));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [refresh]);
  if(compact&&!loading&&!error&&!rows.length)return null;
  return (
    <section className="card">
      <h2>زياراتك الحالية</h2>
      <Notice text={error} />
      {loading && !rows.length ? (
        <Busy />
      ) : !rows.length ? (
        <Empty title="لا توجد زيارات جارية" />
      ) : (
        <div className="settings-grid">
          {rows.map((v) => (
            <ActiveVisit key={`${v.id}:${v.serverTime}`} visit={v} />
          ))}
        </div>
      )}
      {cursor && (
        <button
          className="secondary"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          {loading ? <Busy /> : "تحميل زيارات إضافية"}
        </button>
      )}
      <p className="muted">
        العد التنازلي يعتمد على وقت الخادم ويُعرض بشكل تقريبي. انتهاء المدة لا
        يثبت مغادرتك الجيم. الإلغاء أو التعديل يظهر عند التحديث.
      </p>
    </section>
  );
}
function ActiveVisit({
  visit,
}: {
  visit: Visit & { deadline: number | null };
}) {
  const left = useDeadline(visit.deadline);
  return (
    <article className="subtle-box">
      <h3>
        {visit.branch.gym.name} · {visit.branch.name}
      </h3>
      <p>
        {visit.pointsCharged} نقطة · بدأت {date(visit.startedAt)}
      </p>
      <strong dir="ltr">{left === null ? "—" : duration(left)}</strong>
      <p>
        {left === 0
          ? "انتهت المدة — جارٍ انتظار تحديث الحالة"
          : "الوقت المتبقي"}
      </p>
      <RecordReference value={visit.id} label="مرجع الزيارة" />
    </article>
  );
}
function MovementList({ operation }: { operation: string }) {
  const list = usePage<Movement>(
    `trainee/wallet/movements${operation ? `?operation=${operation}` : ""}`,
  );
  return (
    <>
      <Notice text={list.error} />
      {list.loading && !list.rows.length ? (
        <Busy />
      ) : !list.rows.length ? (
        <Empty title="لا توجد حركات نقاط مطابقة" />
      ) : (
        <div className="table-scroll">
          <table className="mobile-records">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الحركة</th>
                <th>النقاط</th>
                <th>المصدر / الفرع</th>
                <th>المرجع</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((m) => (
                <tr key={m.id}>
                  <td data-label="التاريخ">{date(m.eventAt)}</td>
                  <td data-label="الحركة">{operations[m.operation] ?? m.operation}</td>
                  <td dir="ltr" data-label="النقاط">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td data-label="المصدر / الفرع">
                    {m.sourceLabel ?? (m.branch
                      ? `${m.branch.gymName} · ${m.branch.name}`
                      : "المنصة")}
                  </td>
                  <td data-label="المراجع">
                    <RecordReference value={m.referenceId} />
                    <RecordReference value={m.transactionId} label="قيد النقاط" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More list={list} />
    </>
  );
}
function VisitHistory() {
  const list = usePage<Visit>("trainee/visits");
  return (
    <section className="card">
      <h2>سجل زياراتك</h2>
      <Notice text={list.error} />
      {list.loading && !list.rows.length ? (
        <Busy />
      ) : !list.rows.length ? (
        <Empty title="لم تسجل زيارات بعد" />
      ) : (
        <div className="timeline">
          {list.rows.map((v) => (
            <article key={v.id}>
              <strong>
                {v.branch.gym.name} · {v.branch.name}
              </strong>
              <p>
                {v.pointsCharged} نقطة ·{" "}
                {v.status === "ACTIVE"
                  ? "سيشن قائم وقت آخر تحديث"
                  : v.status === "EXPIRED"
                    ? "انتهت المدة"
                    : "ملغاة"}
              </p>
              <p>
                بدأت: {date(v.startedAt)} · تنتهي: {date(v.expiresAt)}
              </p>
              <RecordReference value={v.id} />
              {v.cancellationReason && (
                <p className="subtle-box">
                  سبب الإلغاء: {v.cancellationReason}
                </p>
              )}
              {v.status !== "CANCELLED" && (
                <RequestAction kind="VISIT_CANCEL" targetId={v.id} />
              )}
            </article>
          ))}
        </div>
      )}
      <More list={list} />
    </section>
  );
}

function RecentMovements({refresh,onHistory}:{refresh:string;onHistory?:()=>void}){
 const [items,setItems]=useState<Movement[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;api<{items:Movement[]}>('trainee/wallet/movements?limit=3').then(r=>{if(active){setItems(r.items);setError('');}}).catch(e=>{if(active)setError(message(e));});return()=>{active=false;};},[refresh]);
 return <section className="portal-recent"><div className="section-toolbar"><h2>آخر حركة في رصيدك</h2><button className="text-button" onClick={onHistory}>السجل كامل</button></div><Notice text={error}/><div className="card">{!items&&!error?<Busy/>:items?.length?items.map(m=><article className="portal-movement" key={m.id}>{m.delta>0?<ArrowDownLeft/>:<ArrowUpRight/>}<div><strong>{m.sourceLabel??operations[m.operation]??'حركة نقاط'}</strong><small>{date(m.eventAt)}</small></div><strong dir="ltr" className={m.delta>0?'positive':''}>{m.delta>0?'+':''}{m.delta}</strong></article>):!error?<Empty title="لسه مفيش حركة نقاط"/>:null}</div></section>;
}
