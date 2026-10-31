"use client";
import {ReviewNote} from "./review-decision";
import { ArrowDownLeft } from "lucide-react";
import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { api, message, decimal, minorUnits, date, methodName, } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
import { useListTools } from "./list-tools";
import { WithdrawalBalanceCard, type WithdrawalBalances } from "./withdrawal-balances";
import { CalendarPanel, type Calendar } from "./withdrawal-calendar";
function Fact({label,children}:{label:string;children:ReactNode}){return <div className="withdrawal-fact"><span>{label}</span><strong>{children}</strong></div>;}
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
type ChargeSummary = {
    debtPiasters: string;
    scheduledPiasters: string;
    grossAvailablePiasters: string;
    netAvailablePiasters: string;
    items: {
        id: string;
        description: string;
        amountPiasters: string;
        collectedPiasters: string;
        outstandingPiasters: string;
    }[];
};
type Detail = {
    serviceCharges?: ChargeSummary;
    withdrawal: Withdrawal;
    gymName: string;
    balances: WithdrawalBalances;
    feedback: {
        kind: string;
        reason: string;
        createdAt: string;
    } | null;
    actions: {
        id: string;
        kind: string;
        reason: string;
        createdAt: string;
    }[];
};
const stateName = (s: string) => ({
    REQUESTED: "بانتظار المراجعة",
    APPROVED: "مقبول — بانتظار التحويل",
    PAID: "تم التحويل",
    REJECTED: "مرفوض",
    CANCELLED: "ملغى",
    DISPUTED: "اعتراض على التحويل",
})[s] ?? s;
const actionName = (s: string) => ({
    APPROVE: "قبول الطلب",
    REJECT: "رفض الطلب وفك الحجز",
    PAY: "تسجيل التحويل المنفذ",
    CANCEL: "إلغاء الطلب وفك الحجز",
    RECEIVED: "تأكيد استلام المبلغ",
    DISPUTE: "اعتراض على التحويل",
})[s] ?? s;
export function Withdrawals({ admin, initialGymId }: {
    admin: boolean;
    initialGymId?: string;
}) {
    return (<>
      <div className="subtle-box"><strong>طلبات السحب من المراجعة للتحويل</strong><p>راجع الطلب، اقبله لحجز موعد التنفيذ، ثم سجّل التحويل وإثباته بعد تنفيذه فعليًا.</p></div>
      <WithdrawalList admin path="admin/withdrawals"/>
      <CalendarPanel />
    </>);
}
function WithdrawalList({ admin, path, onChanged, }: {
    admin: boolean;
    path: string;
    onChanged?: () => void;
}) {
    const list = usePage<Withdrawal>(path), [selected, setSelected] = useState<string | null>(null);
    const filtered = useListTools(list.rows, w => [w.id, w.gymId, w.destinationName, w.destinationAccount, w.transferReference].filter(Boolean).join(" "), w => w.status, { REQUESTED: stateName("REQUESTED"), APPROVED: stateName("APPROVED"), PAID: stateName("PAID"), REJECTED: stateName("REJECTED"), CANCELLED: stateName("CANCELLED"), DISPUTED: stateName("DISPUTED") });
    return (<>
      <div className="section-toolbar">
        {<h2>طلبات السحب</h2>}
        <button className="secondary compact" disabled={list.loading} onClick={() => {
            void list.refresh();
            onChanged?.();
        }}>
          تحديث
        </button>
      </div>
      <Notice text={list.error}/>
      {filtered.controls}
      <section className={"card"}>
        {list.loading && !list.rows.length ? (<Busy />) : !list.rows.length ? (<Empty title="لا توجد طلبات سحب"/>) : (<div className="timeline">
            {(filtered.visible).map((w) => (<article key={w.id}>
                <div className="section-toolbar">
                  <strong>{decimal(w.amountPiasters)} ج.م</strong>
                  <span className={`badge ${w.status === "REQUESTED" ? "pending" : w.status === "PAID" ? "approved" : "neutral"}`}>
                    {stateName(w.status)}
                  </span>
                </div>
                <p>
                  {methodName(w.paymentMethod)} · {w.destinationName}
                </p>
                <small className="muted">{date(w.requestedAt)}</small>
                {w.dueAt && <p>موعد التنفيذ: {date(w.dueAt)}</p>}
                {w.overdue && (<Notice text="انتهت مهلة التنفيذ؛ يلزم توثيق سبب التأخير عند تسجيل التحويل."/>)}
                <button className="secondary compact" onClick={() => setSelected(w.id)}>
                  {w.status === "REQUESTED" ? "مراجعة وقبول الطلب" : w.status === "APPROVED" ? "تسجيل التحويل والإثبات" : w.status === "DISPUTED" ? "مراجعة الاعتراض" : "عرض تفاصيل التحويل"}
                </button>
              </article>))}
          </div>)}
        <More list={list}/>
      </section>
      {selected && (<WithdrawalDetail key={selected} id={selected} admin={admin} onClose={() => {
                setSelected(null);
                void list.refresh();
                onChanged?.();
            }}/>)}
    </>);
}
function WithdrawalDetail({ id, admin, onClose, }: {
    id: string;
    admin: boolean;
    onClose: () => void;
}) {
    const [detail, setDetail] = useState<Detail | null>(null), [calendar, setCalendar] = useState<Calendar | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(""), [action, setAction] = useState(""), [proof, setProof] = useState(""), [fileName, setFileName] = useState(""), [receipt, setReceipt] = useState(""), [refreshing, setRefreshing] = useState(false);
    const { call, uncertain } = useCommand();
    useEffect(() => {
        let active = true;
        Promise.all([
            api<Detail>(`withdrawals/${id}`),
            api<{
                calendar: Calendar | null;
            }>("admin/withdrawal-calendar"),
        ])
            .then(([d, c]) => {
            if (active) {
                setDetail(d);
                setCalendar(c.calendar);
                setAction(d.withdrawal.status === "REQUESTED"
                    ? "APPROVE"
                    : "PAY");
            }
        })
            .catch((e) => {
            if (active)
                setError(message(e));
        })
            .finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [id, admin]);
    async function refreshBalances() {
        if (busy || uploading || uncertain || refreshing)
            return;
        setRefreshing(true);
        setError("");
        try {
            const d = await api<Detail>(`withdrawals/${id}`);
            setDetail(d);
            setAction(d.withdrawal.status === "REQUESTED" ? "APPROVE" : "PAY");
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setRefreshing(false);
        }
    }
    async function upload(file?: File) {
        if (!file || busy || uncertain)
            return;
        setUploading(true);
        setError("");
        setProof("");
        setFileName("");
        try {
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
                file.size > 4194304)
                throw new Error("ارفع صورة JPG أو PNG أو WebP حتى ٤ ميجابايت.");
            const r = await api<{
                id: string;
            }>("receipts", {
                method: "POST",
                headers: { "content-type": file.type },
                body: file,
            });
            setProof(r.id);
            setFileName(file.name);
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setUploading(false);
        }
    }
    async function showProof() {
        const evidence = detail?.withdrawal.proofReceiptId;
        if (!evidence)
            return;
        setBusy(true);
        setError("");
        try {
            const r = await api<{
                url: string;
            }>(`receipts/${evidence}/access`);
            setReceipt(r.url);
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy || uploading || refreshing)
            return;
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const reason = f.get("reason");
            let path = "", body: unknown;
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
            }
            else if (action === "PAY") {
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
            }
            else if (action === "CANCEL") {
                path = `withdrawals/${id}/cancel`;
                body = { reason };
            }
            else {
                path = `withdrawals/${id}/feedback`;
                body = { kind: action, reason };
            }
            await call<Withdrawal>(path, body);
            setDetail(null);
            setLoading(true);
            setSuccess("تم تسجيل الإجراء. راجع الحالة والسجل قبل أي خطوة أخرى.");
            try {
                setDetail(await api<Detail>(`withdrawals/${id}`));
            }
            catch {
                setError("تم تسجيل الإجراء، لكن تحديث السجل تعذر. أغلق التفاصيل وحدّث القائمة.");
            }
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
            setLoading(false);
        }
    }
    const w = detail?.withdrawal;
    const options = w
        ?
            w.status === "REQUESTED"
                ? ["APPROVE", "REJECT"]
                : w.status === "APPROVED"
                    ? ["PAY", "REJECT"]
                    : []
        : [];
    return (<Modal title="تفاصيل طلب السحب" onClose={onClose} locked={busy || uploading || uncertain}>
      <Notice text={error}/>
      <Notice text={success} success/>
      {loading ? (<Busy />) : (detail &&
            w && (<>
            <h3>
              {detail.gymName} · {decimal(w.amountPiasters)} ج.م
            </h3>
            <p>{stateName(w.status)}</p>
            {detail.serviceCharges && <section className="card"><h3>مديونيات الصيانة والإعلانات</h3><Fact label="مديونية مستحقة">{decimal(detail.serviceCharges.debtPiasters)} ج.م</Fact><Fact label="صافي متاح للسحب">{decimal(detail.serviceCharges.netAvailablePiasters)} ج.م</Fact>{detail.serviceCharges.items.map(c => <div key={c.id}><strong>{c.description}</strong><p>التكلفة {decimal(c.amountPiasters)} · المخصوم {decimal(c.collectedPiasters)} · المتبقي {decimal(c.outstandingPiasters)} ج.م</p></div>)}</section>}
            <WithdrawalBalanceCard balances={detail.balances} amount={w.amountPiasters} status={w.status}/>
            <button className="secondary full" disabled={busy || uploading || uncertain || refreshing} onClick={() => void refreshBalances()}>{refreshing ? <Busy>جاري تحديث المستحقات</Busy> : "تحديث المستحقات وحالة الطلب"}</button>
            <div className="subtle-box">
              <p>
                {methodName(w.paymentMethod)} · {w.destinationName}
              </p>
              <p dir="ltr">{w.destinationAccount}</p>
              <p>تاريخ الطلب: {date(w.requestedAt)}</p>
              {w.acceptedAt && <p>تاريخ القبول: {date(w.acceptedAt)}</p>}
              {w.dueAt && <p>نهاية المهلة: {date(w.dueAt)}</p>}
              {w.transferReference && (<p>مرجع التحويل: {w.transferReference}</p>)}
              {w.paidAt && <p>سُجّل التحويل: {date(w.paidAt)}</p>}
            </div>
            {w.overdue && (<Notice text="الطلب تجاوز مهلة التنفيذ. اكتب سبب التأخر عند تسجيل التحويل."/>)}
            {w.proofReceiptId && (<button className="secondary compact" disabled={busy} onClick={() => void showProof()}>
                عرض إثبات التحويل الخاص
              </button>)}
            {receipt && (<img className="receipt-image" src={receipt} alt="إثبات التحويل اليدوي" onError={() => {
                    setReceipt("");
                    setError("تعذر عرض الإثبات. أعد طلبه.");
                }}/>)}
            {detail.feedback && (<p className="subtle-box">
                {detail.feedback.kind === "RECEIVED"
                    ? "أكد صاحب الجيم الاستلام"
                    : "اعترض صاحب الجيم على التحويل"}
                : {detail.feedback.reason} · {date(detail.feedback.createdAt)}
              </p>)}
            {w.status === "DISPUTED" && (<p className="subtle-box">
                الاعتراض مسجل للمراجعة البشرية. لا ينشئ دفعة أخرى ولا يخصم
                مستحقات أخرى تلقائيًا.
              </p>)}
            {!success && options.length > 0 && (<form onSubmit={submit}>
                <fieldset disabled={busy || uploading || refreshing}>
                  <label className="field">
                    الإجراء
                    <select value={options.includes(action) ? action : options[0]} onChange={(e) => setAction(e.target.value)} disabled={uncertain}>
                      {options.map((a) => (<option key={a} value={a}>
                          {actionName(a)}
                        </option>))}
                    </select>
                  </label>
                  {action === "APPROVE" && (<>
                      <p className="subtle-box">
                        {calendar
                        ? `سيبدأ حساب ٣ أيام عمل من القبول حسب نسخة التقويم ${calendar.version}. راجع أيام العمل والعطلات قبل التأكيد.`
                        : "اضبط سياسة أيام العمل أولًا، ثم أعد فتح الطلب."}
                      </p>
                      <label className="check">
                        <input type="checkbox" name="destination" required disabled={uncertain}/>
                        تحققت من طريقة الاستقبال وبيانات الحساب
                      </label>
                    </>)}
                  {action === "PAY" && (<>
                      <p className="subtle-box">
                        نفّذ التحويل خارج المنصة بعد مطابقة الحساب، ثم سجل مرجعه
                        وإثباته هنا. هذا الزر يسجل التحويل ولا يرسل أموالًا.
                      </p>
                      <Field label="المبلغ المحوّل بالجنيه" name="amount" required inputMode="decimal" defaultValue={decimal(w.amountPiasters)} readOnly={uncertain}/>
                      <Field label="مرجع التحويل" name="reference" required minLength={3} maxLength={150} readOnly={uncertain}/>
                      <Field label="صورة إثبات التحويل" type="file" accept="image/jpeg,image/png,image/webp" disabled={uncertain} onChange={(e) => void upload(e.target.files?.[0])}/>
                      {uploading && <Busy>جاري رفع الإثبات</Busy>}
                      {fileName && <p>{fileName}</p>}
                      <Field label="سبب التأخير (إلزامي عند تجاوز المهلة)" name="delay" required={w.overdue} minLength={5} maxLength={1000} readOnly={uncertain}/>
                      <label className="check">
                        <input type="checkbox" name="transferred" required disabled={uncertain}/>
                        تأكدت من تنفيذ التحويل كاملًا إلى الحساب المحفوظ
                      </label>
                      <label className="check">
                        <input type="checkbox" name="proof" required disabled={uncertain}/>
                        راجعت مرجع التحويل وصورة إثباته
                      </label>
                    </>)}
                  <ReviewNote key={action} preset={action==='APPROVE'?'تمت مراجعة المستحقات وبيانات الاستلام والموافقة على طلب السحب.':action==='PAY'?'تم تنفيذ التحويل ومطابقة المرجع وإثبات الدفع.':'تم رفض طلب السحب بعد مراجعة بياناته.'} choices={action==='REJECT'?['بيانات حساب الاستلام تحتاج تصحيحًا.','المستحقات تحتاج تسوية قبل التحويل.']:[]} disabled={uncertain}/>
                  <label className="check">
                    <input type="checkbox" required disabled={uncertain}/>
                    راجعت تفاصيل الطلب وتأثير الإجراء
                  </label>
                  <button className="primary full" disabled={(action === "PAY" && !proof) ||
                    (action === "APPROVE" && !calendar) ||
                    (["APPROVE", "PAY"].includes(action) && !detail.balances.consistent)}>
                    {busy ? (<Busy />) : uncertain ? ("إعادة نفس الإجراء") : ("تأكيد الإجراء")}
                  </button>
                </fieldset>
              </form>)}
            <h3>سجل الإجراءات</h3>
            {detail.actions.length ? (<div className="timeline">
                {detail.actions.map((a) => (<article key={a.id}>
                    <strong>{actionName(a.kind)}</strong>
                    <p>{a.reason}</p>
                    <small>{date(a.createdAt)}</small>
                  </article>))}
              </div>) : (<p className="muted">لم تسجل إجراءات بعد.</p>)}
          </>))}
    </Modal>);
}
