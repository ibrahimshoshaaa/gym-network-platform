"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, CreditCard, History } from "lucide-react";
import { api, message, decimal, date, type Page } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { normalizeDigits } from "../lib/topup-estimate";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { Fact, PortalNote } from "./portal-ui";
import { More, usePage, type Gym } from "./gyms/shared";
import { RecordReference } from "./record-reference";
type StockBranch = {
    id: string;
    name: string;
    stock: string | number;
    status: string;
};
type Inventory = {
    central: string;
    branchesTotal: string;
    total: string;
    status: string;
    branches: StockBranch[];
};
export function OwnerInventory({ gym, onPurchase, fromBranchId, transferInitially = false }: {
    gym: Gym;
    onPurchase: () => void;
    fromBranchId?: string;
    transferInitially?: boolean;
}) {
    const [data, setData] = useState<Inventory | null>(null), [error, setError] = useState(""), [version, setVersion] = useState(0), [transfer, setTransfer] = useState(transferInitially), [history, setHistory] = useState(false);
    useEffect(() => { let live = true; api<Inventory>(`gyms/${gym.id}/inventory`).then(r => { if (live) {
        setData(r);
        setError("");
    } }).catch(e => { if (live)
        setError(message(e)); }); return () => { live = false; }; }, [gym.id, version]);
    return <><p>{gym.name}</p><Notice text={error}/>{!data ? !error && <Busy /> : <><section className="card wallet-signature"><p>رصيد صاحب الجيم</p><h2 className="wallet-balance">{data.central} نقطة</h2><p>رصيد مستقل، تقدر توزّعه على الفروع أو تبيع منه للمتدربين.</p></section><section className="card"><Fact label="موزّع على الفروع">{data.branchesTotal} نقطة</Fact><Fact label="إجمالي نقاطك" strong>{data.total} نقطة</Fact></section><button className="primary full" disabled={data.status !== "ACTIVE" || !data.branches.some(b => b.status === "ACTIVE")} onClick={() => setTransfer(true)}><ArrowLeftRight size={20}/>تحويل نقاط</button><button className="text-button" disabled={data.status !== "ACTIVE"} onClick={onPurchase}><CreditCard size={18}/>شراء نقاط لرصيد صاحب الجيم</button>{data.status !== "ACTIVE" && <PortalNote>الجيم غير نشط. الأرصدة محفوظة والتحويل متاح بعد التفعيل.</PortalNote>}<h2>أرصدة الفروع</h2>{data.branches.length ? data.branches.map(b => <section key={b.id} className="card"><h3>{b.name}</h3><Fact label="رصيد الفرع" strong>{b.stock} نقطة</Fact>{b.status !== "ACTIVE" && <p className="muted">الفرع غير نشط؛ رصيده محفوظ.</p>}</section>) : <Empty title="لسه مفيش فروع">تقدر تشحن رصيدك المركزي وتوزّعه بعد إضافة الفروع وتفعيلها.</Empty>}<button className="text-button" onClick={() => setHistory(true)}><History size={18}/>سجل تحويلات النقاط</button>{transfer && <StockTransfer gym={gym} data={data} initialFrom={fromBranchId} onClose={() => { setTransfer(false); setVersion(v => v + 1); }}/>}{history && <Modal title="سجل تحويلات النقاط" onClose={() => setHistory(false)}><StockHistory gymId={gym.id}/></Modal>}</>}</>;
}
function StockTransfer({ gym, data, initialFrom, onClose }: {
    gym: Gym;
    data: Inventory;
    initialFrom?: string;
    onClose: () => void;
}) {
    const [from, setFrom] = useState(initialFrom ?? "central"), [to, setTo] = useState(""), [points, setPoints] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [review, setReview] = useState<{
        from: StockBranch;
        to: StockBranch;
        points: number;
    } | null>(null), [result, setResult] = useState<{
        id: string;
    } | null>(null), { call, uncertain } = useCommand(), running = useRef(false);
    const accounts = [{ id: "central", name: "رصيد صاحب الجيم", stock: data.central, status: "ACTIVE" }, ...data.branches];
    async function advance(e: FormEvent) { e.preventDefault(); if (running.current)
        return; running.current = true; setBusy(true); setError(""); try {
        if (!review) {
            const text = normalizeDigits(points), n = Number(text);
            if (!/^\d+$/.test(text) || !Number.isSafeInteger(n) || n < 1 || n > 2147483647 || !to || to === from)
                throw Error("راجع الأرصدة وعدد النقاط.");
            const current = await api<Inventory>(`gyms/${gym.id}/inventory`), all = [{ id: "central", name: "رصيد صاحب الجيم", stock: current.central, status: "ACTIVE" }, ...current.branches], a = all.find(x => x.id === from), b = all.find(x => x.id === to);
            if (current.status !== "ACTIVE" || !a || !b || a.status !== "ACTIVE" || b.status !== "ACTIVE")
                throw Error("التحويل يتطلب أرصدة نشطة.");
            if (BigInt(a.stock) < BigInt(n))
                throw Error("رصيد المصدر غير كافٍ.");
            if (BigInt(b.stock) + BigInt(n) > 2147483647n)
                throw Error("الكمية تتجاوز الحد المسموح.");
            setReview({ from: a, to: b, points: n });
        }
        else
            setResult(await call(`gyms/${gym.id}/stock-transfers`, { fromBranchId: from === "central" ? null : from, toBranchId: to === "central" ? null : to, points: review.points }));
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        running.current = false;
        setBusy(false);
    } }
    return <Modal title="تحويل نقاط" onClose={onClose} locked={busy || uncertain}><p>{gym.name}</p>{result ? <><Empty title="تم تحويل النقاط"/><Fact label="من">{review?.from.name}</Fact><Fact label="إلى">{review?.to.name}</Fact><Fact label="النقاط المحوّلة" strong>{review?.points} نقطة</Fact><RecordReference value={result.id}/><button className="primary full" onClick={onClose}>تم</button></> : <><PortalNote>انقل من رصيدك لفرع، من فرع لفرع، أو رجّع نقاط لرصيدك. إجمالي نقاطك لا يتغير.</PortalNote><form onSubmit={advance}><fieldset disabled={busy || uncertain}>{!review ? <>{([[from, setFrom, "من رصيد"], [to, setTo, "إلى رصيد"]] as const).map(([value, set, label], i) => <label className="field" key={label}>{label}<select value={value} required onChange={e => { set(e.target.value); if (i === 0 && to === e.target.value)
        setTo(""); }}><option value="">اختار الرصيد</option>{accounts.filter(a => i === 0 || a.id !== from).map(a => <option key={a.id} value={a.id} disabled={a.status !== "ACTIVE"}>{a.name} · {a.stock} نقطة</option>)}</select></label>)}<Field label="عدد النقاط" value={points} inputMode="numeric" required onChange={e => setPoints(e.target.value)}/></> : <section className="card"><Fact label="من">{review.from.name}</Fact><Fact label="إلى">{review.to.name}</Fact><Fact label="النقاط" strong>{review.points} نقطة</Fact><hr /><Fact label="رصيد المصدر قبل التحويل">{review.from.stock} نقطة</Fact><Fact label="رصيد المصدر بعد التحويل">{(BigInt(review.from.stock) - BigInt(review.points)).toString()} نقطة</Fact><Fact label="رصيد المستلم قبل التحويل">{review.to.stock} نقطة</Fact><Fact label="رصيد المستلم بعد التحويل">{(BigInt(review.to.stock) + BigInt(review.points)).toString()} نقطة</Fact></section>}</fieldset><Notice text={error}/>{uncertain && <Notice text="نتيجة التحويل غير مؤكدة. أعد نفس العملية بأمان."/>}<button className="primary full" disabled={busy}>{busy ? <Busy /> : review ? uncertain ? "إعادة نفس التحويل" : "تأكيد التحويل" : "مراجعة التحويل"}</button>{review && <button type="button" className="text-button" disabled={busy || uncertain} onClick={() => setReview(null)}>تعديل التحويل</button>}</form></>}</Modal>;
}
type Transfer = {
    id: string;
    fromName: string;
    toName: string;
    points: number;
    createdAt: string;
};
function StockHistory({ gymId }: {
    gymId: string;
}) { const list = usePage<Transfer>(`gyms/${gymId}/stock-transfers`); return <><Notice text={list.error}/>{list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="لسه مفيش تحويلات"/> : list.rows.map(r => <article className="card" key={r.id}><Fact label="من">{r.fromName}</Fact><Fact label="إلى">{r.toName}</Fact><Fact label="النقاط" strong>{r.points} نقطة</Fact><small className="muted">{date(r.createdAt)}</small><RecordReference value={r.id}/></article>)}<More list={list}/></>; }
export function reportRange() { const now = new Date(), from = new Date(now.getTime() - 29 * 86400000), format = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); return `from=${format(from)}&to=${format(now)}`; }
type ReportRow = {
    id?: string;
    referenceId: string;
    branchName: string | null;
    points: number;
    amountPiasters: string;
    eventAt: string;
    status: string;
};
export function NativeReport({ gymId, branchId }: {
    gymId: string;
    branchId?: string;
}) { const [kind, setKind] = useState("VISITS"); return <><div className="native-tabs">{[["VISITS", "الزيارات"], ["SALES", "سجل المبيعات السابق"]].map(([id, label]) => <button key={id} className={id === kind ? "active" : ""} onClick={() => setKind(id!)}>{label}</button>)}</div><ReportRows key={kind} gymId={gymId} branchId={branchId} kind={kind}/></>; }
function ReportRows({ gymId, branchId, kind }: {
    gymId: string;
    branchId?: string;
    kind: string;
}) { const [rows, setRows] = useState<ReportRow[]>([]), [cursor, setCursor] = useState<string | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), generation = useRef(0); async function load(next?: string) { const n = ++generation.current; setLoading(true); try {
    const r = await api<Page<ReportRow>>(`reports/rows?gymId=${gymId}&${reportRange()}&kind=${kind}${branchId ? `&branchId=${branchId}` : ""}${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
    if (n === generation.current) {
        setRows(old => next ? [...old, ...r.items] : r.items);
        setCursor(r.nextCursor);
        setError("");
    }
}
catch (e) {
    if (n === generation.current)
        setError(message(e));
}
finally {
    if (n === generation.current)
        setLoading(false);
} } useEffect(() => { void load(); return () => { generation.current++; }; }, [gymId, branchId, kind]); return <><Notice text={error}/>{loading && !rows.length ? <Busy /> : !rows.length && !error ? <Empty title="لا توجد حركة خلال الفترة"/> : rows.map((r, i) => <article key={`${r.referenceId}:${i}`} className="card"><Fact label={r.branchName ?? "محفظة الجيم"} strong>{r.points} نقطة</Fact><Fact label="القيمة">{decimal(r.amountPiasters)} ج.م</Fact><span className="badge">{({ ACTIVE: "نشط", EXPIRED: "منتهية", CANCELLED: "ملغاة", APPROVED: "معتمد", COMPLETED: "تمت" } as Record<string, string>)[r.status] ?? r.status}</span><p className="muted">{date(r.eventAt)}</p><RecordReference value={r.referenceId}/></article>)}{cursor && <button className="secondary full" disabled={loading} onClick={() => void load(cursor)}>تحميل المزيد</button>}</>; }
