"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Eye, CheckCircle2, XCircle } from "lucide-react";
import { api, send, message, decimal, methodName, date, type Page, type Topup } from "../lib/client";
import { Busy, Empty, Field, Modal, Notice } from "./ui";

import { useListTools } from "./list-tools";

export function Reviews() {
 const [rows,setRows]=useState<Topup[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[success,setSuccess]=useState(""),[selected,setSelected]=useState<Topup|null>(null);
 const filtered=useListTools(rows,row=>[row.id,row.requestor?.displayName,row.requestor?.email,row.requestor?.phoneE164,row.branch?.gym.name,row.branch?.name,row.gym?.name,methodName(row.paymentMethod)].filter(Boolean).join(" "),row=>row.kind,{TRAINEE:"شحن متدرب"});
 const generation=useRef(0);
 async function load(next?:string) {
  const current=++generation.current; setLoading(true);setError("");
  try {const p=await api<Page<Topup>>(`admin/topups?limit=25${next ? "&cursor="+next : ""}`);if(current!==generation.current)return;
   setRows(old=>next?[...old,...p.items.filter(item=>!old.some(row=>row.id===item.id))]:p.items);setCursor(p.nextCursor);
  }catch(e){if(current===generation.current)setError(message(e));}finally{if(current===generation.current)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[]);
 return <>
  <div className="section-toolbar"><div><h2>طلبات الشحن</h2><p className="muted">افتح الطلب، طابق التحويل، ثم اعتمد إضافة النقاط.</p></div><button className="secondary compact" disabled={loading} onClick={()=>void load()}><RefreshCw size={17}/>تحديث</button></div>
  <Notice text={error}/><Notice text={success} success/>
  {filtered.controls}
  <p className="muted review-count">{rows.length} طلب محمّل للمراجعة{cursor ? " · توجد طلبات إضافية" : ""}</p>
  {loading&&!rows.length?<section className="card"><Busy/></section>:!rows.length&&!error?<section className="card"><Empty title="مفيش طلبات شحن معلقة">أي طلب جديد هيظهر هنا.</Empty></section>:null}
  <div className="review-cards">{filtered.visible.map(row=><TopupCard key={row.id} row={row} onOpen={()=>{setSelected(row);setSuccess("");}}/>)}</div>
  {cursor&&<button className="secondary full" disabled={loading} onClick={()=>void load(cursor)}>{loading?<Busy/>:"تحميل طلبات إضافية"}</button>}
  {selected&&<Review key={selected.id} request={selected} onClose={()=>setSelected(null)} onDone={decision=>{setRows(old=>old.filter(row=>row.id!==selected.id));setSelected(null);setSuccess(decision==="APPROVED"?"تم قبول الشحن وإضافة النقاط.":"تم رفض الطلب، بدون إضافة نقاط.");}}/>}
 </>;
}
export function TopupCard({row,onOpen}:{row:Topup;onOpen:()=>void}) {
 return <article className="card topup-card">
  <div className="section-toolbar"><span className="badge pending">{"شحن متدرب"}</span><small className="muted">{date(row.createdAt)}</small></div>
  <h3>{row.requestor?.displayName??"صاحب الطلب"}</h3>
  {row.branch&&<p className="muted">{row.branch.gym.name} · {row.branch.name}</p>}
  {row.gym&&<p className="muted">{row.gym.name} · رصيد صاحب الجيم</p>}
  <div className="topup-card-total"><strong>{decimal(row.chargePiasters)} <small>ج.م</small></strong><span>{row.points} نقطة</span></div>
  <p className="muted">{methodName(row.paymentMethod)}{row.requestor?.phoneE164&&<> · <span dir="ltr">{row.requestor.phoneE164}</span></>}</p>
  <button className="primary full" onClick={onOpen}><Eye size={18}/>مراجعة وقبول الشحن</button>
 </article>;
}
export function Review({request:row,onClose,onDone}:{request:Topup;onClose:()=>void;onDone:(decision:string)=>void}) {
 const [error,setError]=useState(""),[busy,setBusy]=useState(false),[reading,setReading]=useState(true),[receipt,setReceipt]=useState(""),[viewed,setViewed]=useState(false),[receiptError,setReceiptError]=useState(""),[decision,setDecision]=useState<"APPROVED"|"REJECTED">(row.kind==="TRAINEE"?"APPROVED":"REJECTED");
 const generation=useRef(0);
 async function read() {
  const current=++generation.current;setReading(true);setReceiptError("");setViewed(false);setReceipt("");
  if(!row.receiptId){setReceiptError("الطلب بدون إيصال؛ لا يمكن اعتماده من هذه الشاشة.");setReading(false);return;}
  try {const r=await api<{url:string}>(`receipts/${row.receiptId}/access`);if(current===generation.current)setReceipt(r.url);}
  catch(e){if(current===generation.current)setReceiptError(message(e));}
  finally{if(current===generation.current)setReading(false);}
 }
 useEffect(()=>{void read();return()=>{generation.current++;};},[row.receiptId]);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  const form=new FormData(e.currentTarget);
  if(decision==="APPROVED"&&(!viewed||form.get("confirmed")!=="on")){setError("راجع الإيصال وأكد وصول المبلغ أولًا.");return;}
  setBusy(true);setError("");
  try {
   const body=decision==="REJECTED"?{decision,reason:form.get("reason")}:{decision,reason:String(form.get("note")??"").trim()||"تمت مطابقة الإيصال والتأكد من وصول التحويل.",paymentReference:form.get("reference"),receivedAmountPiasters:row.chargePiasters,fundsReceived:true,receiptReviewed:true};
   await api(`admin/topups/${row.id}/review`,send(body));onDone(decision);
  }catch(e){setError(message(e));}finally{setBusy(false);}
 }
 return <Modal title="مراجعة الشحن" onClose={onClose} locked={busy}>
  <div className="request-summary"><div><span className="eyebrow">{"محفظة متدرب"}</span><h3>{row.requestor?.displayName??"صاحب الطلب"}</h3><p>{row.branch?`${row.branch.gym.name} · ${row.branch.name}`:row.gym?.name??row.requestor?.email}</p></div><div><strong>{decimal(row.chargePiasters)} <small>ج.م</small></strong><span>{row.points} نقطة</span></div></div>
  <div className="subtle-box"><strong>{methodName(row.paymentMethod)}</strong><p>حساب الاستلام: <span dir="ltr">{row.paymentAccount}</span> · {row.paymentAccountName}</p></div>
  <div className="receipt-section"><div className="section-toolbar"><h3>إيصال التحويل</h3><button className="secondary compact" disabled={reading||busy||!row.receiptId} onClick={()=>void read()}><RefreshCw size={15}/>إعادة العرض</button></div>
   <Notice text={receiptError}/>{reading?<Busy>جاري فتح الإيصال</Busy>:receipt?<a href={receipt} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" aria-label="تكبير إيصال التحويل"><img className="receipt-image" src={receipt} alt="إيصال التحويل المرفق" referrerPolicy="no-referrer" onLoad={()=>setViewed(true)} onError={()=>{setViewed(false);setReceipt("");setReceiptError("تعذر عرض الإيصال. اضغط إعادة العرض.");}}/></a>:null}
  </div>
  <div className="decision-switch" aria-label="قرار الشحن"><button type="button" aria-pressed={decision==="APPROVED"} className={decision==="APPROVED"?"active":""} disabled={busy||row.kind!=="TRAINEE"} onClick={()=>{setDecision("APPROVED");setError("");}}><CheckCircle2 size={18}/>قبول الشحن</button><button type="button" aria-pressed={decision==="REJECTED"} className={decision==="REJECTED"?"active reject":""} disabled={busy} onClick={()=>{setDecision("REJECTED");setError("");}}><XCircle size={18}/>رفض</button></div>
  <form onSubmit={submit} key={decision}><fieldset disabled={busy}>
   {decision==="APPROVED"?<>
    <Field label="مرجع التحويل الوارد" name="reference" required minLength={3} maxLength={150} dir="ltr" hint="رقم العملية الظاهر في حساب الاستلام."/>
    <label className="check review-confirm"><input name="confirmed" type="checkbox" required disabled={!viewed}/>راجعت الإيصال وتأكدت من وصول {decimal(row.chargePiasters)} ج.م لحساب الاستلام</label>
    <details className="optional-note"><summary>إضافة ملاحظة (اختياري)</summary><Field label="ملاحظة المراجعة" name="note" maxLength={1000}/></details>
   </>:<div className="field"><label htmlFor="reject-reason">سبب الرفض</label><textarea name="reason" id="reject-reason" required maxLength={1000} rows={3} placeholder="وضح لصاحب الطلب سبب الرفض"/></div>}
   <Notice text={error}/><button className={decision==="APPROVED"?"primary full":"danger full"} disabled={decision==="APPROVED"&&!viewed}>{busy?<Busy>جاري تسجيل القرار</Busy>:decision==="APPROVED"?`قبول وإضافة ${row.points} نقطة`:"تأكيد رفض الطلب"}</button>
  </fieldset></form>
 </Modal>;
}
