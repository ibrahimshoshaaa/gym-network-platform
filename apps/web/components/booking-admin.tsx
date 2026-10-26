"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {api,send,date,message} from "../lib/client";
import {policySummary,type Allocation,type Booking,type PublishedPolicy} from "../lib/bookings";
import {Busy,Empty,Field,Notice} from "./ui";

type SplitKind="TRAINEE"|"GYM"|"TRAINEE_GYM"|"GYM_PLATFORM";
function allocation(kind:SplitKind,percent:number):Allocation{
 if(!Number.isInteger(percent)||percent<0||percent>100)throw new Error("اكتب نسبة من 0 إلى 100.");
 return kind==="TRAINEE"?{traineeBps:10000,gymBps:0,platformBps:0}:kind==="GYM"?{traineeBps:0,gymBps:10000,platformBps:0}:kind==="TRAINEE_GYM"?{traineeBps:percent*100,gymBps:10000-percent*100,platformBps:0}:{traineeBps:0,gymBps:percent*100,platformBps:10000-percent*100};
}
function SplitPicker({kind,setKind,percent,setPercent,disabled}:{kind:SplitKind;setKind:(k:SplitKind)=>void;percent:number;setPercent:(n:number)=>void;disabled:boolean}){
 return <fieldset disabled={disabled}><label className="field">مصير النقاط<select value={kind} onChange={e=>setKind(e.target.value as SplitKind)}><option value="TRAINEE">إرجاع بالكامل للمتدرب</option><option value="GYM">بالكامل للجيم</option><option value="TRAINEE_GYM">تقسيم بين المتدرب والجيم</option><option value="GYM_PLATFORM">تقسيم بين الجيم والمنصة</option></select></label>
 {kind.includes("_")&&<><Field label={kind==="TRAINEE_GYM"?"نسبة المتدرب %":"نسبة الجيم %"} type="number" required min={0} max={100} step={1} value={percent} onChange={e=>setPercent(Number(e.target.value))}/><p className="muted">الباقي {100-percent}% {kind==="TRAINEE_GYM"?"للجيم":"للمنصة"}. النقاط غير القابلة للقسمة تُوزع بدون فقد أي نقطة.</p></>}</fieldset>;
}
function Decision({b,onDone}:{b:Booking;onDone:()=>Promise<void>}){
 const [kind,setKind]=useState<SplitKind>("TRAINEE"),[percent,setPercent]=useState(50),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function decide(e:FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError("");try{await api("admin/bookings/"+b.id+"/decision",send({reason:reason.trim(),allocation:allocation(kind,percent)}));await onDone();}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <article className="card booking-card"><h3>{b.traineeName??"متدرب"} · {b.branch?.gym.name??"حجز زيارة"}</h3>{b.branch&&<p>{b.branch.name}</p>}<p>{date(b.scheduledAt)} · {b.points} نقطة معلقة</p><p className="booking-policy">سبب عدم الحضور: {b.absenceReason??"لم يرسل المتدرب سببًا بعد."}</p><details><summary>السياسة المحفوظة مع الحجز</summary><p>{policySummary(b.policySnapshot)}</p></details><form onSubmit={decide}><SplitPicker kind={kind} setKind={setKind} percent={percent} setPercent={setPercent} disabled={busy}/><Field label="سبب القرار" required maxLength={1000} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/><Notice text={error}/><button className="primary full" disabled={busy||!reason.trim()}>{busy?<Busy/>:"تأكيد القرار وتوزيع النقاط"}</button></form></article>;
}
export function BookingAdmin({section="reviews"}:{section?:"policy"|"reviews"}){
 const [current,setCurrent]=useState<PublishedPolicy|null>(null),[loaded,setLoaded]=useState(false),[mode,setMode]=useState("MANUAL"),[grace,setGrace]=useState(60),[kind,setKind]=useState<SplitKind>("TRAINEE"),[percent,setPercent]=useState(50),[items,setItems]=useState<Booking[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{setLoading(true);setError("");try{
 const [p,r]=await Promise.all([section==="policy"?api<{policy:PublishedPolicy|null}>("admin/booking-policy"):Promise.resolve({policy:null}),section==="reviews"?api<{items:Booking[]}>("admin/bookings/review"):Promise.resolve({items:[]})]);setCurrent(p.policy);setItems(r.items);setLoaded(true);
 if(p.policy){const policy=p.policy.policy;setMode(policy.mode);setGrace(policy.graceMinutes);if(policy.mode==="AUTOMATIC"){const a=policy.allocation;if(a.traineeBps===10000)setKind("TRAINEE");else if(a.gymBps===10000)setKind("GYM");else if(a.platformBps===0){setKind("TRAINEE_GYM");setPercent(a.traineeBps/100);}else{setKind("GYM_PLATFORM");setPercent(a.gymBps/100);}}}
 }catch(e){setError(message(e));}finally{setLoading(false);}},[section]);
 useEffect(()=>{void load();},[load]);
 async function save(e:FormEvent){e.preventDefault();if(busy||!loaded)return;setBusy(true);setError("");setSuccess("");try{
 if(!Number.isInteger(grace)||grace<0||grace>10080)throw new Error("مهلة السماح من 0 إلى 10080 دقيقة.");
 const policy=mode==="MANUAL"?{mode,graceMinutes:grace}:{mode,graceMinutes:grace,allocation:allocation(kind,percent)};
 await api("admin/booking-policy",send({expectedVersion:current?.version??0,policy}));await load();setSuccess("تم حفظ سياسة الحجز للحجوزات الجديدة.");
 }catch(e){setError(message(e));}finally{setBusy(false);}}
 return <section className="booking-admin"><div className="section-toolbar"><div><h2>{section==="policy"?"سياسة الحجز وعدم الحضور":"حجوزات بانتظار القرار"}</h2><p className="muted">{section==="policy"?"التغييرات للحجوزات الجديدة؛ كل حجز يحتفظ بسياسته.":"راجع سبب عدم الحضور والسياسة المحفوظة مع كل حجز قبل توزيع النقاط."}</p></div><button className="secondary compact" disabled={busy||loading} onClick={()=>void load()}>تحديث</button>{section==="reviews"&&<button className="secondary compact" disabled={busy||loading} onClick={async()=>{setBusy(true);setError("");try{await api("admin/bookings/process-due",send({}));setSuccess("تم تسجيل مهمة جدولة الحجوزات الحالية.");await load();}catch(e){setError(message(e));}finally{setBusy(false);}}}>جدولة الحجوزات الحالية</button>}</div><Notice text={error}/><Notice text={success} success/>{loading&&<Busy/>}
 {loaded&&<>{section==="policy"&&<form className="card" onSubmit={save}><fieldset disabled={busy||loading}><Field label="مهلة السماح بعد موعد الزيارة — بالدقائق" type="number" min={0} max={10080} step={1} required value={grace} onChange={e=>setGrace(Number(e.target.value))}/><p className="muted">الإلغاء خلال المهلة يرد النقاط بالكامل. بعد المهلة تُطبق السياسة التالية:</p><label className="field">طريقة اتخاذ القرار<select value={mode} onChange={e=>setMode(e.target.value)}><option value="MANUAL">مراجعة يدوية من صاحب المنصة</option><option value="AUTOMATIC">توزيع تلقائي وفق نسب ثابتة</option></select></label>{mode==="AUTOMATIC"?<SplitPicker kind={kind} setKind={setKind} percent={percent} setPercent={setPercent} disabled={busy}/>:<p className="booking-policy">النقاط تفضل معلقة حتى تراجع سبب عدم الحضور وتقرر توزيعها.</p>}</fieldset><button className="primary full" disabled={busy||loading}>{busy?<Busy/>:"حفظ سياسة الحجز"}</button></form>}
 {section==="reviews"&&<>{!items.length?<section className="card"><Empty title="مفيش حجوزات محتاجة قرار"/></section>:items.map(b=><Decision key={b.id} b={b} onDone={load}/>)}</>}</>}
 </section>;
}

