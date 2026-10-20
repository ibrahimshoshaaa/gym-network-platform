"use client";
import {BranchHome,type BranchDestination} from "./branch-home";
import {Fact,FlowSteps,PortalIntro,PortalTask,PortalNote,ScreenBack} from "./portal-ui";
import { RecordReference } from "./record-reference";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, RefreshCw, ScanLine, Coins, CheckCircle2 } from "lucide-react";
import { useCommand } from "../lib/use-financial-command";
import {OperationReviews} from "./operation-reviews";
import { RequestAction, VisitCancelAction } from "./operation-reviews";
import { QRCodeSVG } from "qrcode.react";
import { TraineeWallet } from "./trainee-wallet";
import { api, send, message, decimal, minorUnits, date } from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
type Branch = {
  id: string;
  gymId: string;
  name: string;
  gymName: string;
  canSell: boolean;
  canCancel: boolean;
};
type Sale = {
  id: string;
  traineeLabel: string;
  phoneLast4: string;
  points: number;
  chargePiasters: string;
  createdAt: string;
};
type Visit = {
  id: string;
  pointsCharged: number;
  settlementPiasters: string;
  startedAt: string;
  expiresAt: string;
  status: string;
  cancellationReason: string | null;
};
type Preview = {
  traineeLabel: string;
  phoneLast4: string;
  points: number;
  balance: number | null;
  sessionMinutes: number;
  pricingVersion: number;
  branchPricingVersion: number;
  alreadyActive: boolean;
  visit: Visit | null;
};
type SaleQuote = {
  points: number;
  chargePiasters: string;
  pricingVersion: number;
  stock: number;
  traineeLabel: string;
  phoneLast4: string;
};
export function Cashier({initialTask = "visit",gymId,initialBranchId}: {initialTask?: "visit" | "sale" | "history";gymId?:string;initialBranchId?:string}) {
  const [recordKind,setRecordKind]=useState<"visits"|"sales"|"reviews"|null>(null);
  const [task,setTask]=useState<"visit"|"sale"|"history"|null>(initialBranchId?initialTask:null);
  const [branches, setBranches] = useState<Branch[]>([]),
    [branch, setBranch] = useState(initialBranchId??""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: Branch[] }>("operations/branches");
      const allowed=data.items.filter(b=>!gymId||b.gymId===gymId);
      setBranches(allowed);
      setBranch(old=>allowed.some(b=>b.id===old)?old:allowed[0]?.id??"");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [gymId]);
  const selected=branches.find(b=>b.id===branch);
  if(gymId)return <>{task&&selected?<><ScreenBack title={task==="visit"?"تسجيل زيارة":task==="sale"?"شحن متدرب":selected.name} onBack={()=>{if(recordKind)setRecordKind(null);else setTask(null);void load();}}/><div className="native-operation-context"><strong>{selected.gymName} · {selected.name}</strong></div>{task==="history"?recordKind==="reviews"?<OperationReviews admin={false}/>:recordKind?<OperationHistory key={recordKind} branchId={selected.id} canCancel={selected.canCancel} kind={recordKind}/>:<BranchHome branch={selected} navigate={next=>{if(next==="visits"||next==="sales"||next==="reviews")setRecordKind(next);else if(next==="visit"||next==="sale")setTask(next);}}/>:<BranchOperations key={`${branch}:${task}`} branch={selected} initialTask={task} taskOnly/>}</>:<>
    <PortalIntro title="تشغيل الجيم" eyebrow="صاحب الجيم" detail="اختار مهمتك من الفرع الصحيح. كل عملية بتتسجل باسم حسابك."/>
    <Notice text={error}/>{loading?<Busy/>:!branches.length?<Empty title="مفيش فرع متاح للتشغيل">لازم الفرع يكون نشط وحسابك متعيّن عليه. راجع صاحب الجيم أو الإدارة.</Empty>:<><p className="muted native-small">{branches.length} فرع متاح لحسابك</p>{branches.map(b=><article className="card native-operation-branch" key={b.id}><p className="muted">{b.gymName}</p><h2>{b.name}</h2>{b.canCancel&&<p className="native-green native-small">تقدر تلغي الزيارة خلال أول ١٠ دقائق.</p>}{b.canSell&&<div className="native-task-grid"><PortalTask title="تسجيل زيارة" detail="مسح رمز المتدرب" icon={ScanLine} primary onClick={()=>{setBranch(b.id);setTask("visit");}}/><PortalTask title="شحن متدرب" detail="من رصيد الفرع" icon={Coins} onClick={()=>{setBranch(b.id);setTask("sale");}}/></div>}<button className="primary full" onClick={()=>{setBranch(b.id);setTask("history");}}>فتح الفرع</button></article>)}</>}
  </>}</>;
  return <><Notice text={error}/>{loading?<Busy/>:<><label className="field">الفرع الحالي<select value={branch} onChange={e=>setBranch(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.gymName} · {b.name}</option>)}</select></label>{selected&&<BranchOperations key={branch} branch={selected} initialTask={initialTask}/>}</>}</>;
}

export function BranchOperations({ branch, initialTask,taskOnly=false }: { branch: Branch; initialTask: "visit" | "sale" | "history";taskOnly?:boolean }) {
  const [tab, setTab] = useState(branch.canSell ? initialTask : "history"),
    [stock, setStock] = useState<number | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ stock: number }>(`operations/branches/${branch.id}/summary`)
      .then((r) => {
        if (active) setStock(r.stock);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [branch.id, revision]);
  return (
    <>
      {!taskOnly&&<div className="management-tabs operation-tabs">
        {branch.canSell && <button
          aria-pressed={tab === "sale"}
          className={tab === "sale" ? "active" : ""}
          onClick={() => setTab("sale")}
        >
          <Coins size={16} />
          شحن متدرب
        </button>}
        {branch.canSell && <button
          aria-pressed={tab === "visit"}
          className={tab === "visit" ? "active" : ""}
          onClick={() => setTab("visit")}
        >
          <ScanLine size={16} />
          تسجيل زيارة
        </button>}
        <button
          aria-pressed={tab === "history"}
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          سجل الفرع
        </button>
      </div>}
      <Notice text={error} />
      {!taskOnly&&<p className="muted stock-line">
        مخزون الفرع: <strong>{stock ?? "—"} نقطة</strong>
      </p>}
      {!branch.canSell && tab !== "history" ? (
        <section className="card">
          <Empty title="حسابك لا يملك صلاحية تنفيذ العمليات في الفرع">
            يمكنك عرض سجل الفرع من تبويب السجل.
          </Empty>
        </section>
      ) : tab === "sale" ? (
        <SaleForm
          branchId={branch.id}
          onDone={() => setRevision((n) => n + 1)}
        />
      ) : tab === "visit" ? (
        <VisitForm branchId={branch.id} />
      ) : (
        <OperationHistory branchId={branch.id} canCancel={branch.canCancel} />
      )}
    </>
  );
}
function SaleForm({
  branchId,
  onDone,
}: {
  branchId: string;
  onDone: () => void;
}) {
  const [result,setResult]=useState<Sale|null>(null);
  const [person, setPerson] = useState<{
      id: string;
      label: string;
      phoneLast4: string;
    } | null>(null),
    [quote, setQuote] = useState<SaleQuote | null>(null),
    [points, setPoints] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const { call, uncertain } = useCommand();
  async function lookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uncertain) return;
    setBusy(true);
    setError("");
    setPerson(null);
    setQuote(null);
    const form = e.currentTarget;
    try {
      setPerson(
        await api(
          `cashier/branches/${branchId}/trainee-lookup`,
          send({ phone: new FormData(form).get("phone") }),
        ),
      );
      form.reset();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function calculate(e: FormEvent) {
    e.preventDefault();
    if (busy || uncertain || !person) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      setQuote(
        await api(
          `cashier/branches/${branchId}/sale-quotes`,
          send({ traineeId: person.id, points: Number(points) }),
        ),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !person || !quote) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const body = {
        traineeId: person.id,
        points: quote.points,
        pricingVersion: quote.pricingVersion,
        receivedAmountPiasters: minorUnits(String(form.get("amount"))),
        fundsReceived: form.get("received") === "on",
      };
      const result = await call<Sale>(
        `cashier/branches/${branchId}/sales`,
        body,
      );
      setSuccess(`تم تحويل ${result.points} نقطة. مرجع البيع: ${result.id}`);
      setResult(result);
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if(result)return <><Empty title="تم شحن المتدرب"/><section className="card"><Fact label="المتدرب">{result.traineeLabel}</Fact><Fact label="النقاط" strong>{result.points} نقطة</Fact><Fact label="المبلغ المحصّل">{decimal(result.chargePiasters)} ج.م</Fact><RecordReference value={result.id}/></section><button className="primary full" onClick={()=>{setResult(null);setPerson(null);setQuote(null);setPoints("");setSuccess("");}}>عملية جديدة</button></>;
  return <div className="native-sale"><FlowSteps labels={["المتدرب","النقاط","التأكيد"]} current={quote?2:person?1:0}/><PortalIntro title={!person?"هتشحن لمين؟":!quote?"اتأكد من الاسم وحدد النقاط":"راجع وأكّد الشحن"} detail="البيع من رصيد الفرع، بعد استلام المبلغ من المتدرب."/><Notice text={error}/><Notice text={success} success/>
  {!person?<form onSubmit={lookup}><fieldset disabled={busy||uncertain}><Field label="رقم موبايل المتدرب" name="phone" type="tel" required maxLength={40} dir="ltr" placeholder="01xxxxxxxxx"/><button className="primary full">{busy?<Busy/>:"بحث عن المتدرب"}</button></fieldset></form>:<>
   <section className="card native-recipient"><strong>{person.label}</strong><p className="muted">آخر أربعة أرقام: {person.phoneLast4}</p></section>
   {!quote?<form onSubmit={calculate}><fieldset disabled={busy||uncertain}><Field label="عدد النقاط" value={points} inputMode="numeric" required onChange={e=>setPoints(e.target.value)}/><button className="primary full">{busy?<Busy/>:"مراجعة قيمة الشحن"}</button></fieldset></form>:<><section className="card"><Fact label="النقاط" strong>{quote.points} نقطة</Fact><Fact label="المبلغ المطلوب تحصيله" strong>{decimal(quote.chargePiasters)} ج.م</Fact><Fact label="مخزون الفرع">{quote.stock} نقطة</Fact></section><form onSubmit={confirm}><fieldset disabled={busy||uncertain}><Field label="المبلغ المستلم بالجنيه" name="amount" defaultValue={decimal(quote.chargePiasters)} inputMode="decimal" required dir="ltr"/><label className="check"><input type="checkbox" name="received" required/>طابقت المتدرب وتأكدت من استلام المبلغ كاملًا</label></fieldset><Notice text={uncertain?"نتيجة الشحن غير مؤكدة. أعد نفس الطلب بأمان.":""}/><button className="primary full" disabled={busy||quote.points>quote.stock}>{busy?<Busy/>:uncertain?"إعادة نفس الطلب":"تأكيد التحصيل وشحن المتدرب"}</button></form></>}
   <button className="text-button" disabled={busy||uncertain} onClick={()=>{if(quote)setQuote(null);else setPerson(null);setError("");}}>تعديل البيانات</button>
  </>}</div>;
}

function VisitForm({ branchId }: { branchId: string }) {
  const [token, setToken] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      visit: Visit;
      alreadyActive: boolean;
    } | null>(null),
    [camera, setCamera] = useState(false);
  const { call, uncertain } = useCommand();
  function scanned(value: string) {
    setToken(value.startsWith("gymqr:") ? value.slice(6) : value);
    setPreview(null);
    setResult(null);
    setCamera(false);
  }
  async function scan(e: FormEvent) {
    e.preventDefault();
    if (busy || uncertain) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setPreview(
        await api(
          `cashier/branches/${branchId}/visit-previews`,
          send({ token }),
        ),
      );
    } catch (e) {
      setError(message(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !preview) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        token,
        pricingVersion: preview.pricingVersion,
        branchPricingVersion: preview.branchPricingVersion,
        presenceConfirmed:
          new FormData(e.currentTarget).get("present") === "on",
      };
      setResult(
        await call<{ visit: Visit; alreadyActive: boolean }>(
          `cashier/branches/${branchId}/visits`,
          body,
        ),
      );
      setPreview(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card visit-card">
      <PortalIntro title={preview?"راجع الزيارة":result?"نتيجة الزيارة":"مسح رمز دخول المتدرب"} detail="الرمز صالح لدقيقة. التأكيد بعد التحقق من حضور المتدرب."/>
      <p className="muted">
        الرمز صالح لدقيقة. التأكيد يتم بعد التحقق من حضور المتدرب فعليًا.
      </p>
      <Notice text={error} />
      {result && (
        <div className="subtle-box" role="status">
          <CheckCircle2 size={24} />
          <h3>
            {result.alreadyActive
              ? "السيشن قائم بالفعل — لم تُخصم نقاط أخرى"
              : "تم تسجيل الزيارة بنجاح"}
          </h3>
          <p>تنتهي الجلسة: {date(result.visit.expiresAt)}</p>
          <RecordReference value={result.visit.id} label="مرجع الزيارة" />
        </div>
      )}
      {!preview&&!result&&<><button
        className="primary full"
        disabled={busy || uncertain}
        onClick={() => setCamera((old) => !old)}
      >
        <Camera size={18} />
        {camera ? "إغلاق الكاميرا" : "فتح كاميرا QR"}
      </button>
      {camera && <Scanner onValue={scanned} onError={setError} />}
      <form onSubmit={scan}>
        <fieldset disabled={busy}>
          <Field
            label="رمز الدخول"
            name="token"
            readOnly={uncertain}
            value={token}
            onChange={(e) => {
              scanned(e.target.value);
            }}
            maxLength={49}
            required
            dir="ltr"
            autoComplete="off"
            hint="يمكن لصق الرمز من المتدرب عند تعذر استخدام الكاميرا."
          />
          <button className="primary" disabled={uncertain}>
            {busy ? <Busy /> : "التحقق وعرض الزيارة"}
          </button>
        </fieldset>
      </form>
      </>}
      {result&&<button className="primary full" onClick={()=>{setResult(null);setToken("");setError("");}}>تسجيل زيارة تانية</button>}
      {preview && (
        <form onSubmit={confirm}>
          <fieldset disabled={busy}>
            <div className="quote-total">
              <span>
                {preview.traineeLabel} · آخر الهاتف {preview.phoneLast4}
              </span>
              <strong>
                {preview.alreadyActive
                  ? "بدون خصم جديد"
                  : `${preview.points} نقطة`}
              </strong>
              <p>
                {preview.sessionMinutes} دقيقة
                {preview.balance !== null
                  ? ` · الرصيد ${preview.balance} نقطة`
                  : ""}
              </p>
            </div>
            <label className="check">
              <input
                name="present"
                disabled={uncertain}
                type="checkbox"
                required
              />
              المتدرب حاضر أمامي وقد طابقت بياناته
            </label>
            <button
              className="primary full"
              disabled={
                !preview.alreadyActive &&
                (preview.balance ?? 0) < preview.points
              }
            >
              {busy ? (
                <Busy>جاري تأكيد الدخول</Busy>
              ) : preview.alreadyActive ? (
                "عرض السيشن القائم"
              ) : (
                "تأكيد الدخول وخصم الزيارة"
              )}
            </button>
          </fieldset>
        </form>
      )}
      {preview&&<button className="text-button" disabled={busy||uncertain} onClick={()=>{setPreview(null);setToken("");}}>تعديل الرمز</button>}
    </section>
  );
}
function Scanner({
  onValue,
  onError,
}: {
  onValue: (value: string) => void;
  onError: (value: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onValue);
  callback.current = onValue;
  useEffect(() => {
    let cancelled = false,
      controls: { stop: () => void } | undefined;
    const stop = () => {
      controls?.stop();
      const stream = video.current?.srcObject;
      if (typeof MediaStream !== "undefined" && stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
    };
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (cancelled) return;
        try {
          const reader = new BrowserQRCodeReader();
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" }, audio: false },
            video.current!,
            (result) => {
              if (result && !cancelled) {
                callback.current(result.getText());
                stop();
              }
            },
          );
          if (cancelled) stop();
        } catch {
          if (!cancelled)
            onError(
              "تعذر فتح الكاميرا. استخدم HTTPS واسمح بالوصول للكاميرا، أو الصق الرمز.",
            );
        }
      })
      .catch(() => {
        if (!cancelled)
          onError("تعذر تحميل قارئ الكاميرا. الصق رمز المتدرب وحاول مرة أخرى.");
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [onError]);
  return (
    <video
      className="scanner-video"
      ref={video}
      muted
      playsInline
      aria-label="كاميرا قراءة رمز الدخول"
    />
  );
}
export function OperationHistory({
  branchId,
  canCancel,
  kind,
}: {
  branchId: string;
  canCancel: boolean;
  kind?: "visits" | "sales";
}) {
  const sales = usePage<Sale>(kind==="visits"?null:`operations/branches/${branchId}/sales`),
    visits = usePage<Visit>(kind==="sales"?null:`operations/branches/${branchId}/visits`);
  return (
    <div className="two-columns">
      {kind!=='visits'&&<section className="card">
        <h2>مبيعات النقاط</h2>
        <Notice text={sales.error} />
        {sales.loading && !sales.rows.length ? (
          <Busy />
        ) : !sales.rows.length ? (
          <Empty title="لا توجد مبيعات" />
        ) : (
          <div className="timeline">
            {sales.rows.map((s) => (
              <article key={s.id}>
                <Fact label="المتدرب">{s.traineeLabel}</Fact><Fact label="النقاط" strong>{s.points} نقطة</Fact><Fact label="المبلغ المحصّل">{decimal(s.chargePiasters)} ج.م</Fact><Fact label="التاريخ">{date(s.createdAt)}</Fact>
                <RecordReference value={s.id} />
                <RequestAction kind="SALE_CORRECTION" targetId={s.id} />
              </article>
            ))}
          </div>
        )}
        <More list={sales} />
      </section>}
      {kind!=='sales'&&<section className="card">
        <h2>الزيارات المسجلة</h2>
        <Notice text={visits.error} />
        {visits.loading && !visits.rows.length ? (
          <Busy />
        ) : !visits.rows.length ? (
          <Empty title="لا توجد زيارات" />
        ) : (
          <div className="timeline">
            {visits.rows.map((v) => (
              <article key={v.id}>
                <strong>
                  {v.pointsCharged} نقطة ·{" "}
                  {v.status === "ACTIVE"
                    ? "سيشن قائم"
                    : v.status === "EXPIRED"
                      ? "انتهت المدة"
                      : "ملغاة"}
                </strong>
                <Fact label="التاريخ">{date(v.startedAt)}</Fact><Fact label="نهاية الجلسة">{date(v.expiresAt)}</Fact>
                <RecordReference value={v.id} />
                {v.cancellationReason && (
                  <p className="subtle-box">
                    سبب الإلغاء: {v.cancellationReason}
                  </p>
                )}
                {v.status !== "CANCELLED" && (
                  <div className="section-toolbar">
                    {canCancel && (
                      <VisitCancelAction
                        branchId={branchId}
                        visitId={v.id}
                        impact={v}
                        onDone={() => void visits.refresh()}
                      />
                    )}
                    <RequestAction kind="VISIT_CANCEL" targetId={v.id} />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <More list={visits} />
      </section>}
    </div>
  );
}
export function TraineeQr({ standalone = false }: { standalone?: boolean }) {
  const [qr, setQr] = useState<{
      token: string;
      expiresAt: string;
      serverTime: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(0),
    [revision, setRevision] = useState(0);
  const until = useRef(0),
    generation = useRef(0);
  async function renew() {
    if (busy) return;
    const current = ++generation.current,
      started = performance.now();
    setBusy(true);
    setError("");
    try {
      const code = await api<{
        token: string;
        expiresAt: string;
        serverTime: string;
      }>("trainee/qr", send({}));
      if (current !== generation.current) return;
      until.current =
        started +
        Math.max(0, Date.parse(code.expiresAt) - Date.parse(code.serverTime));
      setQr(code);
      setLeft(
        Math.max(0, Math.ceil((until.current - performance.now()) / 1000)),
      );
      setRevision((v) => v + 1);
    } catch (e) {
      if (current === generation.current) {
        setError(message(e));
        setQr(null);
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void renew();
    const visible=()=>{setQr(null);setLeft(0);generation.current++;if(document.visibilityState==='visible')void renew();};
    document.addEventListener('visibilitychange',visible);
    const timer=setInterval(()=>setLeft(Math.max(0,Math.ceil((until.current-performance.now())/1000))),1000);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);generation.current++;};
  }, []);
  const content=<><section className="card trainee-code native-qr"><p className="native-green">رمزك الشخصي</p><Notice text={error}/><div className="native-qr-image">{busy?<Busy/>:qr&&left>0?<QRCodeSVG value={qr.token} size={250} level="M" title="رمز دخول مؤقت؛ اعرضه للكاشير فقط"/>:<><ScanLine size={100}/><p>الرمز غير متاح أو انتهت صلاحيته</p></>}</div><p className="native-green">{qr&&left>0?`صالح لمدة ${left} ثانية`:"افتح رمزًا جديدًا وقت الدخول"}</p><progress max={60} value={qr?left:0}/><button className="primary full" disabled={busy} onClick={()=>void renew()}><RefreshCw size={20}/>تحديث رمز الدخول</button></section><PortalNote>الرمز مؤقت وبيستخدم مرة واحدة. متشاركوش مع حد خارج الجيم.</PortalNote><p className="muted native-qr-footnote">نقاط الزيارة بتتراجع عند الكاشير قبل تأكيد حضورك.</p></>;
  return standalone?content:<TraineeWallet revision={revision}>{content}</TraineeWallet>;
}
