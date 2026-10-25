"use client";
import {useEffect,useRef,useState} from 'react';
import {api,message,decimal,date,type Page} from '../lib/client';
import {Busy,Empty,Notice} from './ui';
import {Fact} from './portal-ui';
import {RecordReference} from './record-reference';
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
export function NativeReport({gymId,branchId}:{gymId:string;branchId?:string}) {return <ReportRows gymId={gymId} branchId={branchId} kind="VISITS"/>;}
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
} } useEffect(() => { void load(); return () => { generation.current++; }; }, [gymId, branchId, kind]); return <><Notice text={error}/>{loading && !rows.length ? <Busy /> : !rows.length && !error ? <Empty title="لا توجد حركة خلال الفترة"/> : rows.map((r, i) => <article key={`${r.referenceId}:${i}`} className="card"><Fact label={r.branchName ?? "زيارة الجيم"} strong>{r.points} نقطة</Fact><Fact label="القيمة">{decimal(r.amountPiasters)} ج.م</Fact><span className="badge">{({ ACTIVE: "نشط", EXPIRED: "منتهية", CANCELLED: "ملغاة", APPROVED: "معتمد", COMPLETED: "تمت" } as Record<string, string>)[r.status] ?? r.status}</span><p className="muted">{date(r.eventAt)}</p><RecordReference value={r.referenceId}/></article>)}{cursor && <button className="secondary full" disabled={loading} onClick={() => void load(cursor)}>تحميل المزيد</button>}</>; }
