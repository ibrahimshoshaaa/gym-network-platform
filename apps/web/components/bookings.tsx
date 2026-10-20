"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {CalendarClock,RefreshCw,ScanLine,Camera} from "lucide-react";
import {QRCodeSVG} from "qrcode.react";
import {api,send,date,message} from "../lib/client";
import {useCommand} from "../lib/use-financial-command";
import {bookingStatus,policySummary,bookingToken,bookingWindow,type Booking,type PublishedPolicy} from "../lib/bookings";
import type {DirectoryBranch} from "./branch-directory";
import {Busy,Empty,Field,Modal,Notice} from "./ui";

export function BookingComposer({branch,onDone,onLocked}:{branch:DirectoryBranch;onDone?:()=>void;onLocked?:(v:boolean)=>void}){
 const [policy,setPolicy]=useState<PublishedPolicy|null>(null),[loading,setLoading]=useState(true),[when,setWhen]=useState(""),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Booking|null>(null);
 const {call,uncertain}=useCommand();
 useEffect(()=>{onLocked?.(busy||uncertain);},[busy,uncertain,onLocked]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{setPolicy((await api<{policy:PublishedPolicy|null}>("booking-policy")).policy);}catch(e){setError(message(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load]);
 const start=when?new Date(when):null,valid=start&&Number.isFinite(start.getTime()),deadline=valid&&policy?new Date(start.getTime()+policy.policy.graceMinutes*60000):null;
 async function book(e:FormEvent){e.preventDefault();if(busy||!policy||!valid||!accepted)return;setBusy(true);setError("");try{
 const b=await call<Booking>("trainee/bookings",{branchId:branch.id,scheduledAt:start.toISOString(),policyVersion:policy.version,branchPricingVersion:branch.pricingVersion});setResult(b);
 }catch(e){setError(message(e));}finally{setBusy(false);}}
 return <section className="card booking-compose"><h2><CalendarClock size={21}/> احجز زيارتك</h2><Notice text={error}/>
 {result?<><Notice text="تم حجز الزيارة والنقاط بنجاح." success/><p>{date(result.scheduledAt)}</p><p>{result.points} نقطة محجوزة لزيارتك.</p><button className="primary full" onClick={onDone}>عرض حجوزاتي</button></>
 :loading?<Busy/>:!policy?<><p className="muted">الحجز غير متاح حتى تضبط الإدارة سياسة الحجز.</p><button className="secondary" onClick={()=>void load()}>إعادة التحميل</button></>
 :<form onSubmit={book}><fieldset disabled={busy||uncertain}>
 <Field label="موعد الزيارة — حسب توقيت جهازك" type="datetime-local" required value={when} onChange={e=>{setWhen(e.target.value);setAccepted(false);}}/>
 <div className="booking-policy"><strong>{branch.visitPricePoints} نقطة · {branch.sessionMinutes} دقيقة</strong><p>النقاط تتحجز الآن، وتتحول للجيم لما يمسح QR حجزك عند وصولك.</p><p>مهلة السماح: {policy.policy.graceMinutes} دقيقة بعد موعد الزيارة.</p>{deadline&&<p>الإلغاء ورد النقاط بالكامل متاح حتى <strong>{date(deadline.toISOString())}</strong>.</p>}<p>{policySummary(policy.policy)}</p></div>
 <label className="check-row"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} required/>راجعت الموعد وسياسة الإلغاء وعدم الحضور</label>
 </fieldset><button className="primary full" disabled={busy||!accepted||!valid||(!uncertain&&start.getTime()<=Date.now())}>{busy?<Busy/>:uncertain?"إعادة نفس الحجز بأمان":"تأكيد الحجز · "+branch.visitPricePoints+" نقطة"}</button>{uncertain&&<p role="status">راجع حجوزاتك بعد إعادة نفس الطلب؛ لا تغيّر بيانات الحجز.</p>}</form>}
 </section>;
}
function BookingQr({booking,onClose}:{booking:Booking;onClose:()=>void}){
 const [qr,setQr]=useState<{token:string;expiresAt:string;serverTime:string}|null>(null),[now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const offset=useRef(0);
 async function renew(){if(busy)return;setBusy(true);setQr(null);setError("");try{const r=await api<{token:string;expiresAt:string;serverTime:string}>("trainee/bookings/"+booking.id+"/qr",send({}));offset.current=Date.parse(r.serverTime)-Date.now();setNow(Date.now()+offset.current);setQr(r);}catch(e){setError(message(e));}finally{setBusy(false);}}
 useEffect(()=>{void renew();const timer=setInterval(()=>setNow(Date.now()+offset.current),1000);return()=>clearInterval(timer);},[]);
 const left=qr?Math.max(0,Math.ceil((Date.parse(qr.expiresAt)-now)/1000)):0;
 return <Modal title="QR حجز الزيارة" onClose={onClose}><Notice text={error}/><section className="trainee-code native-qr"><p>{date(booking.scheduledAt)} · {booking.points} نقطة</p><div className="native-qr-image">{busy?<Busy/>:qr&&left>0?<QRCodeSVG value={"gymbooking:"+qr.token} size={240} title="رمز حجزك؛ اعرضه لموظف الجيم عند الوصول فقط"/>:<ScanLine size={100}/>}</div><p aria-live="polite">{left>0?"صالح لمدة "+left+" ثانية":"انتهى الرمز؛ حدّثه عند الوصول"}</p><button className="primary full" onClick={()=>void renew()} disabled={busy}>تحديث الرمز</button>{qr&&left>0&&<button className="secondary full" onClick={()=>void navigator.clipboard.writeText('gymbooking:'+qr.token).catch(()=>setError('تعذر نسخ الرمز. استخدم المسح بالكاميرا.'))}>نسخ رمز الحجز</button>}<p className="muted">اعرضه لموظف الجيم وأنت قدامه. المسح يؤكد حضورك ويحوّل النقاط للجيم.</p></section></Modal>;
}
function BookingCard({b,refresh,now}:{b:Booking;refresh:()=>Promise<void>;now:number}){
 const [qr,setQr]=useState(false),[reason,setReason]=useState(""),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const late=now>Date.parse(b.deadlineAt);
 async function cancel(){if(busy||!reason.trim())return;setBusy(true);setError("");try{await api("trainee/bookings/"+b.id+"/cancel",send({reason:reason.trim()}));setEditing(false);await refresh();}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <article className="card booking-card"><span className="badge">{bookingStatus(b.status)}</span><h3>{b.branch?b.branch.gym.name+" · "+b.branch.name:"زيارة محجوزة"}</h3><p><CalendarClock size={17}/> {date(b.scheduledAt)}</p><strong>{b.points} نقطة</strong><p className="muted">نهاية مهلة السماح: {date(b.deadlineAt)}</p>
 {b.status==="RESERVED"&&!late&&<p className="muted">{now<Date.parse(b.scheduledAt)?"رمز الحضور يتاح عند موعد الزيارة.":"رمز الحضور متاح الآن."}</p>}
 <details><summary>سياسة هذا الحجز</summary><p>{policySummary(b.policySnapshot)}</p></details>
 {b.decisionReason&&<p>قرار الإدارة: {b.decisionReason}</p>}
 {b.traineePoints!==null&&<div className="booking-allocation"><span>لك: {b.traineePoints}</span><span>للجيم: {b.gymPoints}</span><span>للمنصة: {b.platformPoints}</span></div>}
 {b.absenceReason&&<p className="muted">سبب عدم الحضور: {b.absenceReason}</p>}<Notice text={error}/>
 <div className="booking-actions">{bookingWindow(b,now)&&<button className="primary" onClick={()=>setQr(true)}>اعرض QR الحجز</button>}
 {["RESERVED","PENDING_REVIEW"].includes(b.status)&&<button className="secondary" onClick={()=>setEditing(v=>!v)} disabled={busy}>{late||b.status==="PENDING_REVIEW"?"إضافة سبب عدم الحضور":"إلغاء الحجز"}</button>}</div>
 {editing&&<div className="booking-policy"><Field label="السبب" required value={reason} maxLength={1000} disabled={busy} onChange={e=>setReason(e.target.value)}/><p>{late?policySummary(b.policySnapshot):"سيتم إلغاء الحجز ورد النقاط بالكامل."}</p><button className="primary full" disabled={busy||!reason.trim()} onClick={()=>void cancel()}>{busy?<Busy/>:late?"إرسال السبب وتطبيق السياسة":"تأكيد الإلغاء ورد النقاط"}</button></div>}
 {qr&&<BookingQr booking={b} onClose={()=>{setQr(false);void refresh();}}/>}</article>;
}
export function Bookings({onGyms}:{onGyms?:()=>void}){
 const [items,setItems]=useState<Booking[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[now,setNow]=useState(Date.now());const offset=useRef(0);
 const load=useCallback(async()=>{setLoading(true);setError("");try{const d=await api<{items:Booking[];serverTime:string}>("trainee/bookings");offset.current=Date.parse(d.serverTime)-Date.now();setNow(Date.now()+offset.current);setItems(d.items);}catch(e){setError(message(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();const timer=setInterval(()=>setNow(Date.now()+offset.current),1000);return()=>clearInterval(timer);},[load]);
 return <div className="booking-list"><div className="section-toolbar"><div><h2>حجوزاتي</h2><p className="muted">موعدك، نقاطك، ورمز حضورك في مكان واحد.</p></div><button className="secondary compact" disabled={loading} onClick={()=>void load()} aria-label="تحديث الحجوزات"><RefreshCw size={18}/></button></div><Notice text={error}/>{loading&&<Busy/>}
 {!loading&&!error&&!items.length&&<section className="card"><Empty title="لسه مفيش حجوزات">اختار جيم وحدد موعد تمرينتك.</Empty>{onGyms&&<button className="primary full" onClick={onGyms}>اكتشف الجيمات</button>}</section>}
 {items.map(b=><BookingCard key={b.id+":"+b.status} b={b} refresh={load} now={now}/>)}</div>;
}
function BookingCamera({onValue,onError}:{onValue:(s:string)=>void;onError:(s:string)=>void}){
 const video=useRef<HTMLVideoElement>(null),callback=useRef(onValue);callback.current=onValue;
 useEffect(()=>{let closed=false,done=false,controls:{stop:()=>void}|undefined;const el=video.current;
 const stop=()=>{controls?.stop();if(el?.srcObject instanceof MediaStream)el.srcObject.getTracks().forEach(t=>t.stop());};
 void import("@zxing/browser").then(async({BrowserQRCodeReader})=>{if(closed)return;try{controls=await new BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:"environment"},audio:false},el!,(r)=>{if(r&&!closed&&!done){done=true;callback.current(r.getText());stop();}});if(closed||done)stop();}catch{if(!closed)onError("اسمح بالكاميرا أو الصق رمز الحجز.");}}).catch(()=>{if(!closed)onError("تعذر فتح الكاميرا.");});
 return()=>{closed=true;stop();};},[onError]);
 return <video className="scanner-video" ref={video} muted playsInline aria-label="كاميرا مسح QR الحجز"/>;
}
export function BookingScanner({branchId}:{branchId:string}){
 const [camera,setCamera]=useState(false),[value,setValue]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState<Booking|null>(null);const lock=useRef(false);
 async function scan(raw:string){if(lock.current)return;setCamera(false);const token=bookingToken(raw);if(!token){setError("ده مش QR حجز زيارة. اطلب من المتدرب فتح QR الحجز من حجوزاته.");return;}lock.current=true;setBusy(true);setError("");setResult(null);try{setResult(await api<Booking>("operations/branches/"+branchId+"/bookings/scan",send({token})));setValue("");}catch(e){setError(message(e)+" لو الاتصال انقطع، راجع سجل الزيارات قبل إعادة المسح.");}finally{setBusy(false);lock.current=false;}}
 return <section className="card"><h2><ScanLine size={22}/> تأكيد حضور حجز</h2><p className="muted">المتدرب واقف قدامك؟ امسح QR حجزه لتأكيد حضوره وتحويل النقاط المحجوزة للجيم.</p><Notice text={error}/>{result&&<Notice text={"تم تأكيد الحضور · "+result.points+" نقطة"} success/>}
 {camera?<BookingCamera onValue={v=>void scan(v)} onError={setError}/>:<button className="primary full" disabled={busy} onClick={()=>{setError("");setResult(null);setCamera(true);}}><Camera size={20}/>{busy?<Busy/>:"امسح QR الحجز"}</button>}
 {camera&&<button className="secondary full" onClick={()=>setCamera(false)}>إغلاق الكاميرا</button>}
 <details><summary>لصق رمز الحجز بدل الكاميرا</summary><Field label="رمز الحجز" dir="ltr" value={value} onChange={e=>setValue(e.target.value)} disabled={busy}/><button className="secondary full" disabled={busy||!value.trim()} onClick={()=>void scan(value)}>تأكيد الحضور بالرمز</button></details></section>;
}
