"use client";
import {ArrowDownLeft} from "lucide-react";
import {Fact,PortalIntro,PortalNote} from "./portal-ui";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  message,
  decimal,
  minorUnits,
  date,
  methodName,
} from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
import { useListTools } from "./list-tools";
import { WithdrawalBalanceCard, type WithdrawalBalances } from "./withdrawal-balances";
import { CalendarPanel, type Calendar } from "./withdrawal-calendar";
type Withdrawal = {
  id: string;
  gymId: string;
  amountPiasters: string;
  status: string;
  paymentMethod: string;
  destinationAccount: string;
  destinationName: string;
  requestedAt: string;
  acceptedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  proofReceiptId: string | null;
  transferReference: string | null;
  reviewReason: string | null;
  rejectionReason: string | null;
  delayReason: string | null;
  overdue: boolean;
};
type Detail = {
  withdrawal: Withdrawal;
  gymName: string;
  balances: WithdrawalBalances;
  feedback: { kind: string; reason: string; createdAt: string } | null;
  actions: { id: string; kind: string; reason: string; createdAt: string }[];
};
const stateName = (s: string) =>
  ({
    REQUESTED: "بانتظار المراجعة",
    APPROVED: "مقبول — بانتظار التحويل",
    PAID: "تم التحويل",
    REJECTED: "مرفوض",
    CANCELLED: "ملغى",
    DISPUTED: "اعتراض على التحويل",
  })[s] ?? s;
const actionName = (s: string) =>
  ({
    APPROVE: "قبول الطلب",
    REJECT: "رفض الطلب وفك الحجز",
    PAY: "تسجيل التحويل المنفذ",
    CANCEL: "إلغاء الطلب وفك الحجز",
    RECEIVED: "تأكيد استلام المبلغ",
    DISPUTE: "اعتراض على التحويل",
  })[s] ?? s;
export function Withdrawals({ admin,initialGymId }: { admin: boolean;initialGymId?:string }) {
  return admin ? (
    <>
      <div className="subtle-box"><strong>طلبات السحب من المراجعة للتحويل</strong><p>راجع الطلب، اقبله لحجز موعد التنفيذ، ثم سجّل التحويل وإثباته بعد تنفيذه فعليًا.</p></div>
      <WithdrawalList admin path="admin/withdrawals" />
      <CalendarPanel />
    </>
  ) : (
    <OwnerWithdrawals initialGymId={initialGymId}/>
  );
}
function OwnerWithdrawals({initialGymId}:{initialGymId?:string}) {
  const gyms=usePage<{id:string;name:string;status:string}>("gyms"),[gymId,setGymId]=useState(initialGymId??""),[revision,setRevision]=useState(0),[open,setOpen]=useState(false),[balances,setBalances]=useState<{type:string;balancePiasters:string}[]|null>(null),[error,setError]=useState("");
  const gym=gyms.rows.find(g=>g.id===gymId)??gyms.rows[0],id=gym?.id;
  useEffect(()=>{if(!id)return;let live=true;setBalances(null);api<{accounts:{type:string;balancePiasters:string}[]}>(`gyms/${id}/receivables`).then(r=>{if(live){setBalances(r.accounts);setError("");}}).catch(e=>{if(live)setError(message(e));});return()=>{live=false;};},[id,revision]);
  const value=(type:string)=>balances?.find(b=>b.type===type)?.balancePiasters??"0",available=value("GYM_AVAILABLE");
  return <><Notice text={gyms.error||error}/>{gyms.loading&&!gym?<Busy/>:!gym?<Empty title="مفيش جيم مرتبط بحسابك"/>:<>
  <PortalIntro title="مستحقاتك واضحة" eyebrow={gym.name} detail="تابع فلوس زيارات الجيم وحالة كل طلب سحب."/>
  {gyms.rows.length>1&&<label className="field">الجيم<select value={id} onChange={e=>setGymId(e.target.value)}>{gyms.rows.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}<More list={gyms}/>
  <section className="card wallet-signature native-money-balance"><p>متاح للسحب</p>{balances?<h2 className="wallet-balance">{decimal(available)} ج.م</h2>:!error?<Busy/>:null}<button className="primary full" disabled={!balances||gym.status!=="ACTIVE"||BigInt(available)<=0n} onClick={()=>setOpen(true)}><ArrowDownLeft size={20}/>طلب سحب مستحقات</button></section>
  <PortalNote>التحويل خلال ٣ أيام عمل من قبول طلب السحب. مخزون النقاط منفصل عن المستحقات دي.</PortalNote>
  <section className="card native-money-facts">{[["GYM_RESERVED","محجوز للسحب"],["GYM_DISPUTED","محجوز لمراجعة نزاع"],["GYM_PAID","إجمالي مدفوع للجيم"]].map(([type,label])=><Fact key={type} label={label!}>{balances?decimal(value(type!)):"—"} ج.م</Fact>)}</section>
  <h2>طلبات السحب</h2><WithdrawalList key={`${id}:${revision}`} admin={false} path={`gyms/${id}/withdrawals`} onChanged={()=>setRevision(n=>n+1)}/>
  {open&&<RequestForm gymId={id!} available={available} onClose={()=>setOpen(false)} onDone={()=>setRevision(n=>n+1)}/>}
  </>}</>;
}
function RequestForm({gymId,available,onClose,onDone}:{gymId:string;available:string;onClose:()=>void;onDone:()=>void}){
 const [amount,setAmount]=useState(""),[name,setName]=useState(""),[account,setAccount]=useState(""),[method,setMethod]=useState("INSTAPAY"),[review,setReview]=useState(false),[verified,setVerified]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false),{call,uncertain}=useCommand();
 async function submit(e:FormEvent){e.preventDefault();if(busy)return;setError("");try{const n=minorUnits(amount);if(BigInt(n)<=0n||BigInt(n)>BigInt(available)||name.trim().length<2||account.trim().length<3)throw Error("راجع المبلغ وبيانات الاستلام.");if(!review){setReview(true);return;}if(!verified)return;setBusy(true);await call(`gyms/${gymId}/withdrawals`,{paymentMethod:method,destinationAccount:account,destinationName:name,amountPiasters:n});setDone(true);onDone();}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <Modal title="طلب سحب" onClose={onClose} locked={busy||uncertain}>{done?<><Notice success text="تم إرسال طلب السحب"/><button className="primary full" onClick={onClose}>تم</button></>:<><section className="card"><Fact label="رصيدك المتاح" strong>{decimal(available)} ج.م</Fact></section><form onSubmit={submit}><fieldset disabled={busy||uncertain}>{!review?<><Field label="المبلغ بالجنيه" value={amount} inputMode="decimal" required onChange={e=>setAmount(e.target.value)}/><Field label="اسم صاحب الحساب" value={name} required minLength={2} onChange={e=>setName(e.target.value)}/><Field label="حساب إنستا باي أو رقم المحفظة" value={account} required minLength={3} onChange={e=>setAccount(e.target.value)}/><label className="field">طريقة الاستلام<select value={method} onChange={e=>setMethod(e.target.value)}><option value="INSTAPAY">إنستا باي</option><option value="WALLET">محفظة إلكترونية</option></select></label></>:<><section className="card"><Fact label="المبلغ" strong>{decimal(minorUnits(amount))} ج.م</Fact><Fact label="المستلم">{name}</Fact><Fact label="حساب الاستلام">{account}</Fact></section><p className="muted">المبلغ يتحجز من رصيدك المتاح عند إرسال الطلب، والتحويل يتم يدويًا بعد مراجعة الإدارة. موعد التنفيذ يظهر بعد القبول.</p><label className="check"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>راجعت بيانات حساب الاستلام والمبلغ.</label></>}</fieldset><Notice text={error}/>{uncertain&&<Notice text="نتيجة الطلب غير مؤكدة. أعد نفس الطلب بأمان."/>}<button className="primary full" disabled={busy||(review&&!verified)}>{busy?<Busy/>:review?uncertain?"إعادة نفس الطلب":"تأكيد طلب السحب":"مراجعة الطلب"}</button>{review&&<button type="button" className="text-button" disabled={busy||uncertain} onClick={()=>{setReview(false);setVerified(false);}}>تعديل الطلب</button>}</form></>}</Modal>;
}
function WithdrawalList({
  admin,
  path,
  onChanged,
}: {
  admin: boolean;
  path: string;
  onChanged?: () => void;
}) {
  const list = usePage<Withdrawal>(path),
    [selected, setSelected] = useState<string | null>(null);
  const filtered=useListTools(list.rows,w=>[w.id,w.gymId,w.destinationName,w.destinationAccount,w.transferReference].filter(Boolean).join(" "),w=>w.status,{REQUESTED:stateName("REQUESTED"),APPROVED:stateName("APPROVED"),PAID:stateName("PAID"),REJECTED:stateName("REJECTED"),CANCELLED:stateName("CANCELLED"),DISPUTED:stateName("DISPUTED")});
  return (
    <>
      <div className="section-toolbar">
        {admin&&<h2>طلبات السحب</h2>}
        <button
          className="secondary compact"
          disabled={list.loading}
          onClick={() => {
            void list.refresh();
            onChanged?.();
          }}
        >
          تحديث
        </button>
      </div>
      <Notice text={list.error} />
      {admin&&filtered.controls}
      <section className={admin?"card":"native-withdrawal-list"}>
        {list.loading && !list.rows.length ? (
          <Busy />
        ) : !list.rows.length ? (
          <Empty title="لا توجد طلبات سحب" />
        ) : (
          <div className="timeline">
            {(admin?filtered.visible:list.rows).map((w) => (
              <article key={w.id}>
                <div className="section-toolbar">
                  <strong>{decimal(w.amountPiasters)} ج.م</strong>
                  <span
                    className={`badge ${w.status === "REQUESTED" ? "pending" : w.status === "PAID" ? "approved" : "neutral"}`}
                  >
                    {stateName(w.status)}
                  </span>
                </div>
                <p>
                  {methodName(w.paymentMethod)} · {w.destinationName}
                </p>
                <small className="muted">{date(w.requestedAt)}</small>
                {w.dueAt && <p>موعد التنفيذ: {date(w.dueAt)}</p>}
                {w.overdue && (
                  <Notice text="انتهت مهلة التنفيذ؛ يلزم توثيق سبب التأخير عند تسجيل التحويل." />
                )}
                <button
                  className="secondary compact"
                  onClick={() => setSelected(w.id)}
                >
                  {admin ? w.status === "REQUESTED" ? "مراجعة وقبول الطلب" : w.status === "APPROVED" ? "تسجيل التحويل والإثبات" : w.status === "DISPUTED" ? "مراجعة الاعتراض" : "عرض تفاصيل التحويل" : "التفاصيل والمتابعة"}
                </button>
              </article>
            ))}
          </div>
        )}
        <More list={list} />
      </section>
      {selected && (
        <WithdrawalDetail
          key={selected}
          id={selected}
          admin={admin}
          onClose={() => {
            setSelected(null);
            void list.refresh();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
function WithdrawalDetail({
  id,
  admin,
  onClose,
}: {
  id: string;
  admin: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [calendar, setCalendar] = useState<Calendar | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [action, setAction] = useState(""),
    [proof, setProof] = useState(""),
    [fileName, setFileName] = useState(""),
    [receipt, setReceipt] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const { call, uncertain } = useCommand();
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Detail>(`withdrawals/${id}`),
      admin
        ? api<{ calendar: Calendar | null }>("admin/withdrawal-calendar")
        : Promise.resolve({ calendar: null }),
    ])
      .then(([d, c]) => {
        if (active) {
          setDetail(d);
          setCalendar(c.calendar);
          setAction(
            admin
              ? d.withdrawal.status === "REQUESTED"
                ? "APPROVE"
                : "PAY"
              : d.withdrawal.status === "REQUESTED"
                ? "CANCEL"
                : "RECEIVED",
          );
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
  }, [id, admin]);
  async function refreshBalances() {
    if (busy || uploading || uncertain || refreshing) return;
    setRefreshing(true); setError("");
    try { const d=await api<Detail>(`withdrawals/${id}`); setDetail(d); setAction(admin ? d.withdrawal.status==="REQUESTED"?"APPROVE":"PAY" : d.withdrawal.status==="REQUESTED"?"CANCEL":"RECEIVED"); }
    catch(e) { setError(message(e)); }
    finally { setRefreshing(false); }
  }
  async function upload(file?: File) {
    if (!file || busy || uncertain) return;
    setUploading(true);
    setError("");
    setProof("");
    setFileName("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 4194304
      )
        throw new Error("ارفع صورة JPG أو PNG أو WebP حتى ٤ ميجابايت.");
      const r = await api<{ id: string }>("receipts", {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      setProof(r.id);
      setFileName(file.name);
    } catch (e) {
      setError(message(e));
    } finally {
      setUploading(false);
    }
  }
  async function showProof() {
    const evidence = detail?.withdrawal.proofReceiptId;
    if (!evidence) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(`receipts/${evidence}/access`);
      setReceipt(r.url);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading || refreshing) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const reason = f.get("reason");
      let path = "",
        body: unknown;
      if (action === "APPROVE" || action === "REJECT") {
        path = `admin/withdrawals/${id}/review`;
        body =
          action === "APPROVE"
            ? {
                decision: action,
                reason,
                calendarVersion: calendar?.version,
                destinationVerified: f.get("destination") === "on",
              }
            : { decision: action, reason };
      } else if (action === "PAY") {
        path = `admin/withdrawals/${id}/payment`;
        body = {
          reason,
          proofReceiptId: proof,
          transferReference: f.get("reference"),
          transferredAmountPiasters: minorUnits(String(f.get("amount"))),
          fundsTransferred: f.get("transferred") === "on",
          proofReviewed: f.get("proof") === "on",
          ...(String(f.get("delay") ?? "").trim()
            ? { delayReason: f.get("delay") }
            : {}),
        };
      } else if (action === "CANCEL") {
        path = `withdrawals/${id}/cancel`;
        body = { reason };
      } else {
        path = `withdrawals/${id}/feedback`;
        body = { kind: action, reason };
      }
      await call<Withdrawal>(path, body);
      setDetail(null);
      setLoading(true);
      setSuccess("تم تسجيل الإجراء. راجع الحالة والسجل قبل أي خطوة أخرى.");
      try {
        setDetail(await api<Detail>(`withdrawals/${id}`));
      } catch {
        setError(
          "تم تسجيل الإجراء، لكن تحديث السجل تعذر. أغلق التفاصيل وحدّث القائمة.",
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }
  const w = detail?.withdrawal;
  const options = w
    ? admin
      ? w.status === "REQUESTED"
        ? ["APPROVE", "REJECT"]
        : w.status === "APPROVED"
          ? ["PAY", "REJECT"]
          : []
      : w.status === "REQUESTED"
        ? ["CANCEL"]
        : w.status === "PAID" && !detail?.feedback
          ? ["RECEIVED", "DISPUTE"]
          : []
    : [];
  return (
    <Modal
      title="تفاصيل طلب السحب"
      onClose={onClose}
      locked={busy || uploading || uncertain}
    >
      <Notice text={error} />
      <Notice text={success} success />
      {loading ? (
        <Busy />
      ) : (
        detail &&
        w && (
          <>
            <h3>
              {detail.gymName} · {decimal(w.amountPiasters)} ج.م
            </h3>
            <p>{stateName(w.status)}</p>
            <WithdrawalBalanceCard balances={detail.balances} amount={w.amountPiasters} status={w.status}/>
            <button className="secondary full" disabled={busy || uploading || uncertain || refreshing} onClick={()=>void refreshBalances()}>{refreshing?<Busy>جاري تحديث المستحقات</Busy>:"تحديث المستحقات وحالة الطلب"}</button>
            <div className="subtle-box">
              <p>
                {methodName(w.paymentMethod)} · {w.destinationName}
              </p>
              <p dir="ltr">{w.destinationAccount}</p>
              <p>تاريخ الطلب: {date(w.requestedAt)}</p>
              {w.acceptedAt && <p>تاريخ القبول: {date(w.acceptedAt)}</p>}
              {w.dueAt && <p>نهاية المهلة: {date(w.dueAt)}</p>}
              {w.transferReference && (
                <p>مرجع التحويل: {w.transferReference}</p>
              )}
              {w.paidAt && <p>سُجّل التحويل: {date(w.paidAt)}</p>}
            </div>
            {w.overdue && (
              <Notice text="الطلب تجاوز مهلة التنفيذ. اكتب سبب التأخر عند تسجيل التحويل." />
            )}
            {w.proofReceiptId && (
              <button
                className="secondary compact"
                disabled={busy}
                onClick={() => void showProof()}
              >
                عرض إثبات التحويل الخاص
              </button>
            )}
            {receipt && (
              <img
                className="receipt-image"
                src={receipt}
                alt="إثبات التحويل اليدوي"
                onError={() => {
                  setReceipt("");
                  setError("تعذر عرض الإثبات. أعد طلبه.");
                }}
              />
            )}
            {detail.feedback && (
              <p className="subtle-box">
                {detail.feedback.kind === "RECEIVED"
                  ? "أكد صاحب الجيم الاستلام"
                  : "اعترض صاحب الجيم على التحويل"}
                : {detail.feedback.reason} · {date(detail.feedback.createdAt)}
              </p>
            )}
            {w.status === "DISPUTED" && (
              <p className="subtle-box">
                الاعتراض مسجل للمراجعة البشرية. لا ينشئ دفعة أخرى ولا يخصم
                مستحقات أخرى تلقائيًا.
              </p>
            )}
            {!success && options.length > 0 && (
              <form onSubmit={submit}>
                <fieldset disabled={busy || uploading || refreshing}>
                  <label className="field">
                    الإجراء
                    <select
                      value={options.includes(action) ? action : options[0]}
                      onChange={(e) => setAction(e.target.value)}
                      disabled={uncertain}
                    >
                      {options.map((a) => (
                        <option key={a} value={a}>
                          {actionName(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {action === "APPROVE" && (
                    <>
                      <p className="subtle-box">
                        {calendar
                          ? `سيبدأ حساب ٣ أيام عمل من القبول حسب نسخة التقويم ${calendar.version}. راجع أيام العمل والعطلات قبل التأكيد.`
                          : "اضبط سياسة أيام العمل أولًا، ثم أعد فتح الطلب."}
                      </p>
                      <label className="check">
                        <input
                          type="checkbox"
                          name="destination"
                          required
                          disabled={uncertain}
                        />
                        تحققت من طريقة الاستقبال وبيانات الحساب
                      </label>
                    </>
                  )}
                  {action === "PAY" && (
                    <>
                      <p className="subtle-box">
                        نفّذ التحويل خارج المنصة بعد مطابقة الحساب، ثم سجل مرجعه
                        وإثباته هنا. هذا الزر يسجل التحويل ولا يرسل أموالًا.
                      </p>
                      <Field
                        label="المبلغ المحوّل بالجنيه"
                        name="amount"
                        required
                        inputMode="decimal"
                        defaultValue={decimal(w.amountPiasters)}
                        readOnly={uncertain}
                      />
                      <Field
                        label="مرجع التحويل"
                        name="reference"
                        required
                        minLength={3}
                        maxLength={150}
                        readOnly={uncertain}
                      />
                      <Field
                        label="صورة إثبات التحويل"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uncertain}
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                      {uploading && <Busy>جاري رفع الإثبات</Busy>}
                      {fileName && <p>{fileName}</p>}
                      <Field
                        label="سبب التأخير (إلزامي عند تجاوز المهلة)"
                        name="delay"
                        required={w.overdue}
                        minLength={5}
                        maxLength={1000}
                        readOnly={uncertain}
                      />
                      <label className="check">
                        <input
                          type="checkbox"
                          name="transferred"
                          required
                          disabled={uncertain}
                        />
                        تأكدت من تنفيذ التحويل كاملًا إلى الحساب المحفوظ
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          name="proof"
                          required
                          disabled={uncertain}
                        />
                        راجعت مرجع التحويل وصورة إثباته
                      </label>
                    </>
                  )}
                  <Field
                    label="سبب الإجراء أو تفاصيل التأكيد/الاعتراض"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    readOnly={uncertain}
                  />
                  <label className="check">
                    <input type="checkbox" required disabled={uncertain} />
                    راجعت تفاصيل الطلب وتأثير الإجراء
                  </label>
                  <button
                    className="primary full"
                    disabled={
                      (action === "PAY" && !proof) ||
                      (action === "APPROVE" && !calendar) ||
                      (["APPROVE","PAY"].includes(action) && !detail.balances.consistent)
                    }
                  >
                    {busy ? (
                      <Busy />
                    ) : uncertain ? (
                      "إعادة نفس الإجراء"
                    ) : (
                      "تأكيد الإجراء"
                    )}
                  </button>
                </fieldset>
              </form>
            )}
            <h3>سجل الإجراءات</h3>
            {detail.actions.length ? (
              <div className="timeline">
                {detail.actions.map((a) => (
                  <article key={a.id}>
                    <strong>{actionName(a.kind)}</strong>
                    <p>{a.reason}</p>
                    <small>{date(a.createdAt)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">لم تسجل إجراءات بعد.</p>
            )}
          </>
        )
      )}
    </Modal>
  );
}

