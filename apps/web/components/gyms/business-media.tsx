"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, send, message } from '../../lib/client';
import { Busy, Empty, Field, Notice } from '../ui';
type Image = {
    id: string;
    branchId: string | null;
    purpose: string;
    publicUrl: string;
};
export function BusinessMedia({ gymId, branches, more, onMore }: {
    gymId: string;
    branches: {
        id: string;
        name: string;
    }[];
    more: boolean;
    onMore: () => void;
}) {
    const [images, setImages] = useState<Image[]>([]), [branchId, setBranchId] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
    const generation = useRef(0);
    async function load() { const g = ++generation.current; setLoading(true); try {
        const r = await api<{
            items: Image[];
        }>(`gyms/${gymId}/images`);
        if (g === generation.current)
            setImages(r.items);
    }
    catch (e) {
        if (g === generation.current)
            setError(message(e));
    }
    finally {
        if (g === generation.current)
            setLoading(false);
    } }
    useEffect(() => { void load(); return () => { generation.current++; }; }, [gymId]);
    async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy)
        return; const form = e.currentTarget, f = new FormData(form), file = f.get('image'); if (!(file instanceof File) || !file.size)
        return; setBusy(true); setError(''); setSuccess(''); try {
        if (file.size > 4194304 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
            throw new Error('اختار صورة JPG أو PNG أو WebP حتى ٤ ميجابايت.');
        const q = new URLSearchParams({ purpose: branchId ? 'PHOTO' : 'LOGO', ...(branchId ? { branchId } : {}) });
        await api(`gyms/${gymId}/images?${q}`, { method: 'POST', headers: { 'content-type': file.type }, body: file });
        form.reset();
        setSuccess('تم حفظ الصورة، وتظهر للمتدربين عندما يكون الفرع متاحًا.');
        await load();
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }
    const selected = images.filter(i => (i.branchId ?? '') === branchId);
    return <section className="card"><h2>لوجو الجيم وصور الفروع</h2><p className="muted">الصور دي للعرض العام في دليل الجيمات؛ ارفع صور المكان فقط، بعيدًا عن الإيصالات وبيانات العملاء.</p><label className="field">اختار المحتوى<select value={branchId} disabled={busy} onChange={e => setBranchId(e.target.value)}><option value="">لوجو الجيم (صورة واحدة)</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name} · حتى ٦ صور</option>)}</select></label>{more && <button className="text-button" disabled={busy} onClick={onMore}>تحميل فروع أخرى للاختيار</button>}<Notice text={error}/><Notice text={success} success/>{loading && !images.length ? <Busy /> : !selected.length ? <Empty title={branchId ? 'لسه مفيش صور للفرع' : 'أضف لوجو الجيم'}/> : <div className="business-gallery">{selected.map(i => <article key={i.id}><img src={i.publicUrl} alt={i.purpose === 'LOGO' ? 'لوجو الجيم' : 'صورة من الفرع'} loading="lazy"/><button className="secondary full" disabled={busy} onClick={async () => { setBusy(true); setError(''); try {
        await api(`gyms/${gymId}/images/${i.id}/remove`, send({}));
        await load();
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }}>حذف الصورة</button></article>)}</div>}<form onSubmit={submit}><fieldset disabled={busy || selected.length >= (branchId ? 6 : 1)}><Field label={branchId ? 'إضافة صورة للفرع' : 'رفع اللوجو'} name="image" type="file" required accept="image/jpeg,image/png,image/webp"/><button className="primary full">{busy ? <Busy>جاري حفظ الصورة</Busy> : 'رفع الصورة'}</button></fieldset></form></section>;
}
