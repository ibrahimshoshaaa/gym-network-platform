"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, ImagePlus, History } from "lucide-react";
import { api, send, message, decimal, minorUnits, methodName, date, type Settings, type Page, type Topup } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { normalizeDigits, topupEstimate } from "../lib/topup-estimate";
import { Busy, Empty, Field, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
import {CampaignBanner} from "./campaign-banner";
import { Fact, FlowSteps, PortalIntro, ScreenBack } from "./portal-ui";
import { RecordReference } from "./record-reference";
type Quote = {
    points: number;
    chargePiasters: string;
    pricingVersion: number;
    unallocatedPiasters: string;
};
type Selection = {
    kind: string;
    receivingGymId?: string;
    receivingBranchId?: string;
    packageId?: string;
    packageVersion?: number;
    points?: number;
    amountPiasters?: string;
};
type Gym = {
    id: string;
    name: string;
    status: string;
};
export function Purchases({ trainee = false, onWallet, gymId, branchId }: {
    trainee?: boolean;
    onWallet?: () => void;
    gymId?: string;
    branchId?: string;
}) {
    const [version,setVersion]=useState(0);
    const [options, setOptions] = useState<Settings | null>(null), [gyms, setGyms] = useState<Gym[]>([]), [chosenGym, setChosenGym] = useState(gymId ?? ""), [quantity, setQuantity] = useState(""), [byAmount, setByAmount] = useState(false), [packId, setPackId] = useState(""), [method, setMethod] = useState(""), [quote, setQuote] = useState<Quote | null>(null), [receipt, setReceipt] = useState<{
        id: string;
        name: string;
    } | null>(null), [reviewing, setReviewing] = useState(false), [confirmed, setConfirmed] = useState(false), [result, setResult] = useState<Topup | null>(null), [history, setHistory] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
    const snapshot = useRef<Selection | null>(null), fileRef = useRef<HTMLInputElement>(null), running = useRef(false), { call, uncertain } = useCommand();
    const locked = busy || uncertain, kind = trainee ? "TRAINEE" : "BRANCH_STOCK", destination = trainee ? "محفظتك" : branchId ? "مخزون الفرع" : "رصيد صاحب الجيم";
    useEffect(() => { let live = true; setBusy(true); Promise.all([api<Settings>(`topup-options?kind=${kind}`), !trainee && !gymId && !branchId ? api<Page<Gym>>("gyms?limit=100") : Promise.resolve({ items: [] as Gym[] })]).then(([o, g]) => { if (!live)
        return; setOptions(o); setMethod(o.paymentMethods[0]?.type ?? ""); setGyms(g.items.filter(x => x.status === "ACTIVE")); setChosenGym(gymId ?? g.items.find(x => x.status === "ACTIVE")?.id ?? ""); }).catch(e => { if (live)
        setError(message(e)); }).finally(() => { if (live)
        setBusy(false); }); return () => { live = false; }; }, [kind, trainee, gymId, branchId,version]);
    const estimate = topupEstimate(options?.policy, trainee, quantity, byAmount), channel = options?.paymentMethods.find(m => m.type === method), step = quote ? reviewing ? 2 : 1 : 0;
    async function calculate(e: FormEvent) {
        e.preventDefault();
        if (running.current || locked || !estimate || (!trainee && !branchId && !chosenGym))
            return;
        running.current = true;
        setBusy(true);
        setError("");
        try {
            const pack = options?.packages.find(p => p.id === packId);
            const selected: Selection = { kind, ...(!trainee ? (branchId ? { receivingBranchId: branchId } : { receivingGymId: chosenGym }) : {}), ...(pack ? { packageId: pack.id, packageVersion: pack.version } : byAmount ? { amountPiasters: minorUnits(normalizeDigits(quantity).trim()) } : { points: estimate.points }) };
            const q = await api<Quote>("topup-quotes", send(selected));
            snapshot.current = selected;
            setQuote(q);
            setReviewing(false);
            setReceipt(null);
            setConfirmed(false);
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            running.current = false;
            setBusy(false);
        }
    }
    async function upload(file?: File) { if (!file || running.current || locked)
        return; setError(""); if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4194304) {
        setError("اختار صورة JPG أو PNG أو WebP بحد أقصى 4 ميجابايت.");
        return;
    } running.current = true; setBusy(true); try {
        const r = await api<{
            id: string;
        }>("receipts", { method: "POST", headers: { "content-type": file.type }, body: file });
        setReceipt({ id: r.id, name: file.name });
        setConfirmed(false);
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        running.current = false;
        setBusy(false);
        if (fileRef.current)
            fileRef.current.value = "";
    } }
    async function submit(e: FormEvent) { e.preventDefault(); if (running.current || busy || !confirmed || !quote || !receipt || !channel || !snapshot.current)
        return; running.current = true; setBusy(true); setError(""); try {
        const r = await call<Topup>("topups", { ...snapshot.current, pricingVersion: quote.pricingVersion, receiptId: receipt.id, paymentMethod: channel.type, paymentMethodVersion: channel.version });
        setResult(r);
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        running.current = false;
        setBusy(false);
    } }
    function edit() { setQuote(null); snapshot.current = null; setReceipt(null); setConfirmed(false); setError(""); }
    if (history)
        return <><ScreenBack title="طلبات الشحن" onBack={() => setHistory(false)}/><TopupHistory /></>;
    return <div className="native-topup">
 <ScreenBack title={trainee ? "اشحن رصيدك" : "شراء نقاط"} onBack={() => { if (reviewing && !locked) {
        setReviewing(false);
        setConfirmed(false);
    }
    else if (quote && !locked)
        edit();
    else
        onWallet?.(); }} disabled={locked || (!quote && !onWallet)}/>
 <Notice text={error}/>{uncertain && <Notice text="نتيجة الطلب غير مؤكدة. أعد إرسال نفس الطلب بأمان قبل تعديل البيانات."/>}
 {result ? <><Empty title="طلب الشحن وصل">هتوصلك النتيجة بعد مراجعة التحويل.</Empty><section className="card"><Fact label="وجهة النقاط">{destination}</Fact><Fact label="النقاط" strong>{result.points} نقطة</Fact><Fact label="المبلغ">{decimal(result.chargePiasters)} ج.م</Fact><RecordReference value={result.id}/></section><button className="primary full" onClick={onWallet ?? (() => setHistory(true))}>رجوع للمحفظة</button><button className="text-button" onClick={() => setHistory(true)}>متابعة طلبات الشحن</button></> : !options ? busy ? <Busy /> : <><Empty title="تعذر تحميل بيانات الشحن"/><button className="secondary full" onClick={()=>setVersion(v=>v+1)}>إعادة المحاولة</button></> : !options.paymentMethods.length ? <Empty title="الشحن غير متاح مؤقتًا">لا توجد وسيلة تحويل مفعّلة حاليًا. تواصل مع الإدارة.</Empty> : !options.policy ? <Empty title="تسعير النقاط غير متاح">الإدارة هتفعّل الأسعار قبل استقبال طلبات جديدة.</Empty> : <>
 <FlowSteps pills labels={["اختيار الرصيد", "التحويل", "المراجعة"]} current={step}/>
 <PortalIntro title={!quote ? "اختار رصيدك" : reviewing ? "راجع طلب الشحن" : "حوّل وارفع الإيصال"} detail={`النقاط هتضاف إلى ${destination} بعد اعتماد الطلب.`}/>
 {!quote ? <form onSubmit={calculate}><fieldset disabled={locked}>
 {!trainee && !gymId && !branchId && <label className="field">الجيم<select required value={chosenGym} onChange={e => setChosenGym(e.target.value)}>{gyms.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select></label>}
 {!byAmount && options.packages.length > 0 && <><h3 className="native-label">باقات جاهزة</h3><div className="native-packages">{options.packages.map(p => <button type="button" key={p.id} aria-pressed={packId === p.id} onClick={() => { setPackId(p.id); setQuantity(String(p.points)); setError(""); }}><strong>{p.points} نقطة</strong><span>{decimal(topupEstimate(options.policy, trainee, String(p.points), false)?.chargePiasters ?? "0")} ج.م</span>{!normalizeDigits(p.label).includes(String(p.points)) && <small>{p.label}</small>}</button>)}</div><h3 className="native-label">أو اختار قيمة تانية</h3></>}
 <div className="native-segments" role="group" aria-label="طريقة تحديد الرصيد">{[false, true].map(v => <button type="button" key={String(v)} aria-pressed={byAmount === v} onClick={() => { setByAmount(v); setQuantity(""); setPackId(""); setError(""); }}>{byAmount === v && <Check size={18}/>} {v ? "جنيه" : "نقاط"}</button>)}</div>
 <Field label={byAmount ? "المبلغ بالجنيه" : "عدد النقاط"} value={quantity} inputMode={byAmount ? "decimal" : "numeric"} dir="ltr" onChange={e => { setQuantity(normalizeDigits(e.target.value)); setPackId(""); setError(""); }}/>
 {estimate && <section className="card native-estimate"><Fact label="النقاط المختارة">{estimate.points} نقطة</Fact><Fact label="السعر المتوقع" strong>{decimal(estimate.chargePiasters)} ج.م</Fact></section>}
 <button className="primary full" disabled={!estimate || (!trainee && !branchId && !chosenGym)}>{busy ? <Busy /> : "متابعة لبيانات التحويل"}</button>
 </fieldset></form> : <>
 <section className="card wallet-signature native-transfer-total"><p>{reviewing ? `طلب شحن إلى ${destination}` : "المبلغ المطلوب تحويله"}</p><h2 className="wallet-balance">{decimal(quote.chargePiasters)} ج.م</h2><p>{quote.points} نقطة</p></section>
 {quote.unallocatedPiasters && quote.unallocatedPiasters !== "0" && <p className="muted">حوّل القيمة الموضحة فقط؛ المتبقي {decimal(quote.unallocatedPiasters)} ج.م لا يقابل نقاطًا كاملة.</p>}
 {!reviewing ? <><h2>بيانات التحويل</h2><label className="field">وسيلة التحويل<select value={method} disabled={locked} onChange={e => { setMethod(e.target.value); setReceipt(null); setConfirmed(false); setCopied(false); }}>{options.paymentMethods.map(m => <option key={m.type} value={m.type}>{methodName(m.type)}</option>)}</select></label>
 {channel && <section className="card native-receiver"><strong>{channel.accountName}</strong><strong dir="ltr">{channel.account}</strong><button className="text-button" onClick={async () => { try {
                    await navigator.clipboard.writeText(channel.account);
                    setCopied(true);
                }
                catch {
                    setError("تعذر النسخ؛ انسخ الحساب من النص الظاهر.");
                } }}><Copy size={17}/>{copied ? "تم النسخ" : "نسخ الحساب"}</button></section>}
 <h2>إيصال التحويل</h2><input className="native-file" ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="صورة إيصال التحويل" onChange={e => void upload(e.target.files?.[0])}/><button className="secondary full native-upload" disabled={locked} onClick={() => fileRef.current?.click()}>{busy ? <Busy /> : receipt ? <Check size={20}/> : <ImagePlus size={20}/>} {receipt ? "الإيصال جاهز · تغيير الصورة" : "ارفع صورة الإيصال"}</button>{receipt && <small className="muted">{receipt.name}</small>}
 <button className="primary full" disabled={locked || !receipt || !channel} onClick={() => { setReviewing(true); setConfirmed(false); setError(""); }}>مراجعة طلب الشحن</button><button className="text-button" disabled={locked} onClick={edit}>تعديل الرصيد المختار</button>
 </> : <form onSubmit={submit}><fieldset disabled={locked}><section className="card"><Fact label="وسيلة التحويل">{methodName(method)}</Fact><Fact label="صاحب الحساب">{channel?.accountName}</Fact><Fact label="الحساب"><span dir="ltr">{channel?.account}</span></Fact><Fact label="الإيصال">مرفوع وجاهز للمراجعة</Fact></section><label className="check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>حوّلت المبلغ وراجعت الحساب والإيصال.</label></fieldset><button className="primary full" disabled={busy || !confirmed}>{busy ? <Busy /> : uncertain ? "إعادة إرسال نفس الطلب" : "إرسال طلب الشحن"}</button><button type="button" className="text-button" disabled={locked} onClick={() => { setReviewing(false); setConfirmed(false); }}>تعديل بيانات التحويل</button></form>}
 </>}
 {!quote && <button className="text-button" disabled={locked} onClick={() => setHistory(true)}><History size={18}/>متابعة طلبات الشحن</button>}
 </>}
 </div>;
}
export function TopupHistory() { const list = usePage<Topup>("topups"); return <div className="native-record-list"><Notice text={list.error}/>{list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="لسه مفيش طلبات شحن"/> : list.rows.map(r => <article className="card" key={r.id}><div className="section-toolbar"><h2>{r.points} نقطة</h2><span className={`badge ${r.status === "APPROVED" ? "approved" : r.status === "REJECTED" ? "rejected" : "pending"}`}>{r.status === "APPROVED" ? "تم الشحن" : r.status === "REJECTED" ? "مرفوض" : "بانتظار المراجعة"}</span></div><Fact label="المبلغ">{decimal(r.chargePiasters)} ج.م</Fact><small className="muted">{date(r.createdAt)}</small>{r.reviewReason && <p>{r.reviewReason}</p>}<RecordReference value={r.id}/></article>)}<More list={list}/></div>; }
