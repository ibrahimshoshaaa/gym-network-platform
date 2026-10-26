"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, send, message, date } from '../lib/client';
import { Busy, Empty, Field, Modal, Notice } from './ui';
import { More, usePage } from './gyms/shared';
type Ticket = {
    id: string;
    subject: string;
    category: string;
    operationId: string | null;
    status: string;
    updatedAt: string;
    user?: {
        displayName: string;
        role: string;
    };
};
type Reply = {
    id: string;
    body: string;
    receiptId: string | null;
    createdAt: string;
    authorId: string;
    author: {
        displayName: string;
        role: string;
    };
};
const names: Record<string, string> = { OPEN: 'طلب مفتوح', WAITING_USER: 'بانتظار رد العميل', WAITING_ADMIN: 'بانتظار رد الإدارة', CLOSED: 'مغلق' };
const kinds: Record<string, string> = { HELP: 'مساعدة عامة', TOPUP: 'شحن نقاط', VISIT: 'زيارة أو خصم', WITHDRAWAL: 'سحب مستحقات', REFUND: 'استرداد أو اعتراض', ACCOUNT: 'مشكلة حساب' };
export function Support() {
    const [filter, setFilter] = useState(''), [selected, setSelected] = useState<string | null>(null);
    const list = usePage<Ticket>('support/tickets' + (filter ? '?status=' + filter : ''));
    return <><section className="card"><h2>مركز الدعم والشكاوى</h2><p className="muted">طلبات العملاء والموظفين والردود ومتابعة حالتها.</p><button className="secondary" disabled={list.loading} onClick={() => void list.refresh()}>تحديث الطلبات</button></section><label className="field">حالة الطلب<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">كل الحالات</option>{Object.entries(names).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><Notice text={list.error}/>
 {list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="لا توجد طلبات دعم في هذه الحالة"/> : <div className="review-cards">{list.rows.map(t => <article className="card" key={t.id}><div className="section-toolbar"><h3>{t.subject}</h3><span className={'badge ' + (t.status === 'CLOSED' ? 'neutral' : 'pending')}>{names[t.status]}</span></div><p>{kinds[t.category]} · {t.user?.displayName}</p><small className="muted">آخر تحديث: {date(t.updatedAt)}</small><button className="secondary full" onClick={() => setSelected(t.id)}>الرسائل وتفاصيل الطلب</button></article>)}</div>}<More list={list}/>{selected && <SupportThread key={selected} id={selected} admin onClose={() => { setSelected(null); void list.refresh(); }}/>}</>;
}
async function attachment(form: FormData) { const file = form.get('file'); if (!(file instanceof File) || !file.size)
    return null; if (file.size > 4194304 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('ارفع صورة JPG أو PNG أو WebP أقل من ٤ ميجابايت.'); return (await api<{
    id: string;
}>('receipts', { method: 'POST', headers: { 'content-type': file.type }, body: file })).id; }
function EvidenceField() { return <Field label="صورة توضيحية (اختياري، حتى ٤ ميجابايت)" name="file" type="file" accept="image/jpeg,image/png,image/webp"/>; }
function SupportThread({ id, admin, onClose }: {
    id: string;
    admin: boolean;
    onClose: () => void;
}) {
    const [ticket, setTicket] = useState<Ticket | null>(null), [rows, setRows] = useState<Reply[]>([]), [cursor, setCursor] = useState<string | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [image, setImage] = useState('');
    const key = useRef(crypto.randomUUID());
    const generation = useRef(0);
    async function load(before?: string) { const v = ++generation.current; setLoading(true); try {
        const r = await api<{
            ticket: Ticket;
            items: Reply[];
            nextCursor: string | null;
        }>(`support/tickets/${id}${before ? '?before=' + before : ''}`);
        if (v === generation.current) {
            setTicket(r.ticket);
            setRows(old => before ? [...r.items.filter(x => !old.some(y => y.id === x.id)), ...old] : r.items);
            setCursor(r.nextCursor);
        }
    }
    catch (e) {
        if (v === generation.current)
            setError(message(e));
    }
    finally {
        if (v === generation.current)
            setLoading(false);
    } }
    useEffect(() => { void load(); return () => { generation.current++; }; }, [id]);
    async function reply(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; const form = e.currentTarget, f = new FormData(form); setBusy(true); setError(''); try {
        const receiptId = await attachment(f);
        await api(`support/tickets/${id}/messages`, send({ body: f.get('body'), clientKey: key.current, ...(receiptId ? { receiptId } : {}) }));
        key.current = crypto.randomUUID();
        form.reset();
        await load();
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }
    async function state(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); const f = new FormData(e.currentTarget); try {
        await api(`support/tickets/${id}/status`, send({ status: ticket?.status === 'CLOSED' ? 'OPEN' : 'CLOSED', reason: f.get('reason') }));
        await load();
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }
    return <Modal title={ticket?.subject ?? 'رسائل الدعم'} onClose={onClose} locked={busy}><Notice text={error}/>{loading && !ticket ? <Busy /> : ticket && <><span className="badge pending">{names[ticket.status]}</span>{ticket.operationId && <p className="muted">مرجع العملية: {ticket.operationId}</p>}<p className="muted">الشكوى لا تغيّر الرصيد أو تنفّذ استردادًا تلقائيًا.</p>{cursor && <button className="secondary full" disabled={loading || busy} onClick={() => void load(cursor)}>رسائل أقدم</button>}<div className="support-messages">{rows.map(m => <article key={m.id} className={m.author.role === 'PLATFORM_ADMIN' ? 'support-answer' : ''}><strong>{m.author.displayName} · {m.author.role === 'PLATFORM_ADMIN' ? 'الإدارة' : 'صاحب الرسالة'}</strong><p>{m.body}</p><small>{date(m.createdAt)}</small>{m.receiptId && <button className="text-button" disabled={busy} onClick={async () => { try {
            setImage((await api<{
                url: string;
            }>(`receipts/${m.receiptId}/access`)).url);
        }
        catch (e) {
            setError(message(e));
        } }}>عرض الصورة المرفقة</button>}</article>)}</div>{image && <img className="receipt-image" src={image} alt="صورة مرفقة بطلب الدعم" referrerPolicy="no-referrer" onError={() => { setImage(''); setError('انتهى رابط الصورة؛ افتحها مرة أخرى.'); }}/>}
 {ticket.status !== 'CLOSED' && <form onSubmit={reply}><fieldset disabled={busy}><label className="field">ردك<textarea name="body" required minLength={5} maxLength={3000} rows={3}/></label><EvidenceField /><button className="primary full">{busy ? <Busy /> : 'إرسال الرد'}</button></fieldset></form>}
 {<details className="optional-note"><summary>{ticket.status === 'CLOSED' ? 'إعادة فتح الطلب' : 'إغلاق الطلب'}</summary><form onSubmit={state}><fieldset disabled={busy}><Field name="reason" label="سبب الإجراء" required minLength={5} maxLength={1000}/><button className="secondary full">{ticket.status === 'CLOSED' ? 'إعادة فتح' : 'تأكيد الإغلاق'}</button></fieldset></form></details>}</>}</Modal>;
}
