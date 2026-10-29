"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, message, send } from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";

type Request = {
  openMinute: number|null; closeMinute: number|null; id: string; name: string; description: string; points: number; durationMinutes: number; baseVersion: number; reason: string;
  service: { points: number | null; durationMinutes: number | null; version: number; branch: { name: string; gymId: string } };
};
function Review({ request, onDone }: { request: Request; onDone: () => Promise<void> }) {
  const [decision, setDecision] = useState("APPROVED");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      await api(`admin/service-price-requests/${request.id}/review`, send({ decision, reason: reason.trim(), expectedVersion: request.baseVersion }));
      await onDone();
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  return <article className="card">
    <h3>{request.name} · {request.service.branch.name}</h3>
    <p>{request.description}</p>
    <p>المطلوب: {request.points} نقطة · {request.durationMinutes} دقيقة</p>
    {request.service.points !== null && <p>المعتمد حاليًا: {request.service.points} نقطة · {request.service.durationMinutes} دقيقة</p>}
    <p>المواعيد: {request.openMinute==null?'مواعيد الفرع':`${Math.floor(request.openMinute/60).toString().padStart(2,'0')}:${(request.openMinute%60).toString().padStart(2,'0')} – ${Math.floor(request.closeMinute!/60).toString().padStart(2,'0')}:${(request.closeMinute!%60).toString().padStart(2,'0')}`} · بتوقيت القاهرة</p>
    <p>سبب الطلب: {request.reason}</p>
    <form onSubmit={submit}>
      <label className="field">القرار<select value={decision} disabled={busy} onChange={e => setDecision(e.target.value)}><option value="APPROVED">اعتماد</option><option value="REJECTED">رفض</option></select></label>
      <Field label="سبب القرار" required minLength={5} maxLength={1000} disabled={busy} value={reason} onChange={e => setReason(e.target.value)} />
      <Notice text={error} />
      <button className="primary" disabled={busy || reason.trim().length < 5}>{busy ? <Busy /> : "تأكيد القرار"}</button>
    </form>
  </article>;
}
export function ServicePriceReview() {
  const [items, setItems] = useState<Request[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const load = useCallback(async (next?: string) => {
    setLoading(true); setError("");
    try {
      const result = await api<{ items: Request[]; nextCursor: string | null }>(`admin/service-price-requests?limit=25${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      setItems(old => next ? [...old, ...result.items] : result.items); setCursor(result.nextCursor);
    } catch (e) { setError(message(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-label="اعتماد أسعار خدمات الفروع">
    <div className="section-toolbar"><h2>اعتماد خدمات الفروع وأسعارها</h2><button className="secondary" disabled={loading} onClick={() => void load()}>تحديث الخدمات</button></div>
    <Notice text={error} />
    {loading && <Busy />}
    {!loading && !error && items.length === 0 && <Empty title="مفيش خدمات بانتظار المراجعة" />}
    {items.map(request => <Review key={request.id} request={request} onDone={() => load()} />)}
    {cursor && <button className="secondary" disabled={loading} onClick={() => void load(cursor)}>تحميل المزيد من الخدمات</button>}
  </section>;
}
