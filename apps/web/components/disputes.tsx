"use client";
import { useRef, useState, type FormEvent } from 'react';
import { api, send, message, date, decimal, minorUnits } from '../lib/client';
import { usePage, More } from './gyms/shared';
import { Busy, Empty, Field, Modal, Notice } from './ui';
type Hold = {
    id: string;
    gymId: string;
    gymName: string;
    visitId: string;
    amountPiasters: string;
    reason: string;
    state: string;
    createdAt: string;
    releasedAt: string | null;
    releaseReason: string | null;
};
export function Disputes({ admin }: {
    admin: boolean;
}) { const list = usePage<Hold>('disputes'); const [create, setCreate] = useState(false), [selected, setSelected] = useState<Hold | null>(null); return <><section className="card"><h2>مبالغ الزيارات محل المراجعة</h2><p className="muted">الحجز يخص مبلغًا محددًا من زيارة، وباقي المستحقات يظل متاحًا للسحب. فك الحجز يعيد نفس المبلغ للمتاح؛ لا يرد نقاطًا للمتدرب أو ينفّذ تحويلًا.</p><div className="actions">{<button className="primary" onClick={() => setCreate(true)}>حجز مبلغ لمراجعة زيارة</button>}<button className="secondary" disabled={list.loading} onClick={() => void list.refresh()}>تحديث الحجوزات</button></div></section><Notice text={list.error}/>{list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="لا توجد مبالغ محجوزة للمراجعة"/> : <div className="review-cards">{list.rows.map(h => <article className="card" key={h.id}><div className="section-toolbar"><h3>{h.gymName} · {decimal(h.amountPiasters)} ج.م</h3><span className={'badge ' + (h.state === 'OPEN' ? 'pending' : 'approved')}>{h.state === 'OPEN' ? 'محجوز للمراجعة' : 'تم فك الحجز'}</span></div><p>{h.reason}</p><small>مرجع الزيارة: {h.visitId}<br />{date(h.createdAt)}</small>{h.releaseReason && <p className="subtle-box">قرار فك الحجز: {h.releaseReason}</p>}{h.state === 'OPEN' && <button className="secondary full" onClick={() => setSelected(h)}>مراجعة وفك الحجز</button>}</article>)}</div>}<More list={list}/>{(create || selected) && <HoldForm hold={selected} onClose={() => { setCreate(false); setSelected(null); }} onDone={() => { setCreate(false); setSelected(null); void list.refresh(); }}/>}</>; }
function HoldForm({ hold, onClose, onDone }: {
    hold: Hold | null;
    onClose: () => void;
    onDone: () => void;
}) { const [busy, setBusy] = useState(false), [error, setError] = useState(''); const key = useRef(crypto.randomUUID()); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
    return; setBusy(true); setError(''); const f = new FormData(e.currentTarget); try {
    const body = { reason: f.get('reason'), confirmed: f.get('confirmed') === 'on', key: key.current, ...(!hold ? { visitId: f.get('visitId'), amountPiasters: minorUnits(String(f.get('amount'))) } : {}) };
    await api(hold ? `admin/disputes/${hold.id}/release` : 'admin/disputes', send(body));
    onDone();
}
catch (e) {
    setError(message(e));
}
finally {
    setBusy(false);
} } return <Modal title={hold ? 'فك حجز مبلغ الزيارة' : 'حجز مبلغ لمراجعة زيارة'} onClose={onClose} locked={busy}><p className="muted">{hold ? `سيعود ${decimal(hold.amountPiasters)} ج.م من المحجوز للنزاع إلى المتاح.` : 'لا نقبل حجز مبلغ أكبر من مستحق الزيارة. لو سبق دخول المستحقات في سحب أو تسوية، تُرفض العملية للمراجعة بدل الحجز من رصيد آخر.'}</p><form onSubmit={submit}><fieldset disabled={busy}>{!hold && <><Field label="مرجع الزيارة" name="visitId" required minLength={36} maxLength={36}/><Field label="المبلغ محل المراجعة بالجنيه" name="amount" inputMode="decimal" required/></>}<Field label="سبب الحجز أو قرار فكّه" name="reason" required minLength={5} maxLength={1000}/><label className="check"><input type="checkbox" name="confirmed" required/>{hold ? 'راجعت الحالة وأؤكد فك هذا الحجز فقط' : 'راجعت الزيارة وسبب الاشتباه وأؤكد حجز المبلغ المحدد فقط'}</label><Notice text={error}/><button className="primary full">{busy ? <Busy /> : hold ? 'تأكيد فك الحجز' : 'تأكيد حجز المبلغ'}</button></fieldset></form></Modal>; }
