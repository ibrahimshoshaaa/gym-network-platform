"use client";
import {useEffect,useState,type FormEvent} from "react";
import {api,send,message} from "../lib/client";
import {Busy,Field,Notice} from "./ui";
export function SupportSettings(){
 const [phone,setPhone]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 async function load(){setError("");try{const r=await api<{whatsapp:string|null}>("support/contact");setPhone(r.whatsapp);setLoaded(true);}catch(e){setError(message(e));}}
 useEffect(()=>{void load();},[]);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;setBusy(true);setError("");setSuccess("");const form=new FormData(e.currentTarget);try{const r=await api<{whatsapp:string|null}>("admin/support-contact",send({whatsapp:String(form.get("phone")).trim()||null},"PUT"));setPhone(r.whatsapp);setSuccess("تم تحديث بيانات التواصل.");}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <section className="card"><h2>واتساب الدعم</h2><p className="muted">رقم التواصل الظاهر للعملاء داخل التطبيق. اتركه فارغًا لإخفاء رابط التواصل.</p><Notice text={error}/><Notice text={success} success/>{!loaded?error?<button className="secondary" onClick={()=>void load()}>إعادة المحاولة</button>:<Busy/>:<form key={phone??"none"} onSubmit={save}><fieldset disabled={busy}><Field label="رقم واتساب الدولي" name="phone" defaultValue={phone??""} type="tel" dir="ltr" placeholder="+201xxxxxxxxx" pattern="\+[1-9][0-9]{7,14}"/><button className="primary">{busy?<Busy/>:"حفظ بيانات التواصل"}</button></fieldset></form>}</section>;
}
