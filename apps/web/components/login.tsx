"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Dumbbell, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { type Identity, request, send, message } from "../lib/client";
import { invitationToken } from "../lib/invitation-link";
import { Busy, Field, Notice } from "./ui";
type View = "signin" | "register" | "invite";
export function Login({onLogin}:{onLogin:(user:Identity)=>void}) {
 const [view,setView]=useState<View>("signin"),[token,setToken]=useState(""),[linkedInvite,setLinkedInvite]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[show,setShow]=useState(false);
 useEffect(()=>{
  const invite=invitationToken(window.location.hash);
  if(invite){setToken(invite);setLinkedInvite(true);setView("invite");window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);}
 },[]);
 function change(next:View){setView(next);setError("");setShow(false);}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError("");
  const form=new FormData(e.currentTarget);
  const body=view==="register"?{displayName:form.get("displayName"),phone:form.get("phone"),email:form.get("email"),password:form.get("password")}:view==="invite"?{mode:"invite",token,password:form.get("password")}:{mode:"auto",identifier:form.get("identifier"),password:form.get("password")};
  try{const result=await request<{user:Identity}>(view==="register"?"/api/register":"/api/session",send(body));onLogin(result.user);}
  catch(e){setError(message(e));}finally{setBusy(false);}
 }
 return <main className="login-page">
  <section className="login-story"><div className="brand"><span className="brand-icon"><Dumbbell size={25}/></span><span>GYM<span className="brand-light">NETWORK</span></span></div><div className="story-copy"><span className="eyebrow light">شبكتك للتمرين</span><h1>افتح حسابك.<br/>وكمّل يومك.</h1><p>محفظتك وجيماتك ومهامك اليومية، كل حاجة في مكانها حسب حسابك.</p><div className="story-lines"><span/><span/><span/></div></div><div className="story-footer">رصيد واحد · جيمات أكتر · خطوات أقل</div></section>
  <section className="login-panel"><form className="login-form" onSubmit={submit} key={view}>
   <span className="eyebrow">GYM NETWORK</span><h2>{view==="signin"?"أهلًا بيك":view==="register"?"اعمل حساب متدرب":"فعّل حسابك"}</h2>
   <p className="muted">{view==="signin"?"ادخل بإيميلك أو رقم موبايلك. حسابك هيفتح على المهام الخاصة بيك تلقائيًا.":view==="register"?"سجّل بياناتك، وابدأ بمحفظة وجيمات قريبة منك.":"لو ده حساب جديد، اختار كلمة مرور من 15 حرفًا على الأقل. لو عندك حساب، استخدم كلمة مرورك الحالية."}</p>
   <fieldset disabled={busy}>
    {view==="register"?<><Field label="اسمك" name="displayName" required minLength={2} maxLength={100} autoComplete="name"/><Field label="رقم الموبايل" name="phone" type="tel" required maxLength={40} autoComplete="tel" dir="ltr"/><Field label="البريد الإلكتروني" name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr"/></>:view==="signin"?<Field label="الإيميل أو رقم الموبايل" name="identifier" required maxLength={254} autoComplete="username" dir="ltr"/>:linkedInvite?<p className="invite-ready">الدعوة جاهزة؛ اكتب كلمة المرور لتفعيل حسابك.</p>:null}
    {view==="invite"&&!linkedInvite&&<Field label="رمز الدعوة" required minLength={43} maxLength={43} value={token} onChange={e=>setToken(e.target.value.trim())} dir="ltr" autoComplete="off"/>}
    <div className="password-entry"><Field label="كلمة المرور" name="password" type={show?"text":"password"} required minLength={view==="register"?15:undefined} maxLength={view==="register"?128:256} autoComplete={view==="signin"?"current-password":"new-password"} hint={view==="register"?"15 حرفًا على الأقل؛ ممكن تكون جملة سهلة تفتكرها.":undefined}/><button className="password-toggle" type="button" aria-label={show?"إخفاء كلمة المرور":"إظهار كلمة المرور"} aria-pressed={show} onClick={()=>setShow(old=>!old)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>
    <Notice text={error}/><button className="primary full">{busy?<Busy>{view==="register"?"بنجهز حسابك":"جاري الدخول"}</Busy>:<>{view==="signin"?"تسجيل الدخول":view==="register"?"إنشاء حسابي":"تفعيل وفتح حسابي"}<ArrowLeft size={18}/></>}</button>
   </fieldset>
   <div className="login-links">{view==="signin"?<><p>أول مرة تتمرّن معانا؟ <button type="button" disabled={busy} onClick={()=>change("register")}>إنشاء حساب متدرب</button></p><ForgotHelp/><button type="button" disabled={busy} onClick={()=>change("invite")}>معاك دعوة لجيم أو موظف؟</button></>:<button type="button" disabled={busy} onClick={()=>change("signin")}>رجوع لتسجيل الدخول</button>}</div>
  </form><footer className="powered">Powered by <strong>ShoTech Solutions</strong></footer></section>
 </main>;
}

function ForgotHelp(){const [phone,setPhone]=useState<string|null>(null),[error,setError]=useState("");return <details className="login-recovery-help" onToggle={e=>{if(e.currentTarget.open)request<{whatsapp:string|null}>("/api/support-contact").then(r=>setPhone(r.whatsapp)).catch(e=>setError(message(e)));}}><summary>نسيت كلمة المرور؟</summary><p>تواصل مع إدارة المنصة للتحقق من هويتك واستلام رابط استعادة مؤقت. الاستعادة بالإيميل أو الهاتف غير المتحقق منهما مؤجّلة.</p>{phone&&<a className="secondary full" href={"https://wa.me/"+phone.replace("+","")} target="_blank" rel="noopener noreferrer">تواصل مع الدعم على واتساب</a>}<Notice text={error}/></details>;}
