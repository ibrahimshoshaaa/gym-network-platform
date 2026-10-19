"use client";
import { useEffect, useRef, useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Eye, EyeOff, Globe2, Mail, LockKeyhole, UserRound, Smartphone, Store, Dumbbell, MapPin, TicketCheck } from "lucide-react";
import { type Identity, request, send, message, ApiError } from "../lib/client";
import { invitationToken } from "../lib/invitation-link";
import { Busy } from "./ui";
type View = "signin" | "register" | "invite";
type Locale = "ar" | "en";
export function Login({onLogin}:{onLogin:(user:Identity)=>void}) {
 const [view,setView]=useState<View>("signin"),[locale,setLocale]=useState<Locale>("ar"),[owner,setOwner]=useState(false),[remember,setRemember]=useState(false),[token,setToken]=useState(""),[linkedInvite,setLinkedInvite]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null),[show,setShow]=useState(false),[social,setSocial]=useState("");
 const submitting=useRef(false),english=locale==="en";
 const t=(ar:string,en:string)=>english?en:ar;
 useEffect(()=>{
  try {if(localStorage.getItem("gym.auth.language.v1")==="en")setLocale("en");}catch{}
  const invite=invitationToken(window.location.hash);
  if(invite){setToken(invite);setLinkedInvite(true);setView("invite");window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search);}
 },[]);
 function language(){const next=english?"ar":"en";setLocale(next);try{localStorage.setItem("gym.auth.language.v1",next);}catch{}}
 function change(next:View){if(submitting.current)return;setView(next);setError(null);setSocial("");setShow(false);}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError(null);setSocial("");
  const form=new FormData(e.currentTarget);
  const body=view==="register"?{displayName:form.get("displayName"),phone:form.get("phone"),email:form.get("email"),password:form.get("password"),...(owner?{accountType:"owner",gymName:form.get("gymName"),description:form.get("description"),governorate:form.get("governorate"),city:form.get("city"),address:form.get("address")}: {})}:view==="invite"?{mode:"invite",token,password:form.get("password"),remember:true}:{mode:"auto",identifier:form.get("identifier"),password:form.get("password"),remember};
  try{const result=await request<{user:Identity}>(view==="register"?"/api/register":"/api/session",send(body));onLogin(result.user);}
  catch(e){setError(e);}finally{submitting.current=false;setBusy(false);}
 }
 const errorText=!error?"":!english?message(error):error instanceof ApiError?({INVALID_CREDENTIALS:"Your email, mobile number or password is incorrect.",ACCOUNT_UNAVAILABLE:"This email or mobile number is already registered. Try logging in.",INVALID_INPUT:"Check the required fields and try again.",RATE_LIMITED:"Too many attempts. Please wait and try again."} as Record<string,string>)[error.code]??"Unable to complete this step. Please try again.":"Unable to connect. Please try again.";
 return <main className="web-auth" dir={english?"ltr":"rtl"} lang={locale}>
  <div className="web-auth-shell">
   <header className="web-auth-header">
    <div className="web-auth-language"><button type="button" onClick={language} disabled={busy}><Globe2 size={17}/>{english?"العربية":"English"}</button></div>
    <div className="web-auth-brand"><img className="gymbank-wordmark" src="/brand/gymbank-wordmark.png" width={200} height={50} alt="GymBank"/></div>
    <h1>{view==="signin"?t("أهلًا بيك من جديد","Welcome back"):view==="register"?t("ابدأ رحلتك معانا","Your next chapter"):t("دعوتك بداية جديدة","You're invited")}</h1>
    <p>{view==="register"?t("حساب واحد يفتح لك عالم الجيمات.","One account. A world of gyms."):view==="invite"?t("فعّل حسابك وانضم لفريقك.","Activate your account and join your team."):t("جيمك، رصيدك، وتمرينتك… في مكان واحد.","Your gyms, your wallet, your next workout.")}</p>
   </header>
   <section className="web-auth-sheet" aria-label={t("الدخول والتسجيل","Account access")}>
    <div className="web-auth-tabs" aria-label={t("نوع العملية","Account action")}>{(["signin","register"] as const).map(mode=><button type="button" key={mode} aria-pressed={view===mode} disabled={busy} onClick={()=>change(mode)}>{mode==="signin"?t("دخول","Log in"):t("حساب جديد","Sign up")}</button>)}</div>
    {view==="register"&&<div className="web-auth-roles" role="group" aria-label={t("نوع الحساب","Account type")}>{[false,true].map(value=><button key={String(value)} type="button" aria-pressed={owner===value} disabled={busy} onClick={()=>setOwner(value)}>{value?<Store size={23}/>:<Dumbbell size={23}/>}<strong>{value?t("صاحب جيم","Gym owner"):t("متدرب","Trainee")}</strong><small>{value?t("إدارة جيمك وفروعك","Manage your gyms"):t("اختار جيمك واتمرّن","Find your next workout")}</small></button>)}</div>}
    <form onSubmit={submit} key={view}>
     <fieldset disabled={busy}>
      {view==="register"?<><AuthField label={t("الاسم بالكامل","Full name")} name="displayName" icon={<UserRound/>} required minLength={2} maxLength={100} autoComplete="name" placeholder={t("اكتب اسمك بالكامل","Enter your full name")}/><AuthField label={t("الإيميل","Email address")} icon={<Mail/>} name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" placeholder={t("اكتب الإيميل","Enter your email")}/><AuthField label={t("رقم الموبايل","Mobile number")} name="phone" icon={<Smartphone/>} type="tel" required maxLength={40} autoComplete="tel" dir="ltr" placeholder={t("اكتب رقم الموبايل","Enter mobile number")}/></>:view==="signin"?<AuthField label={t("الإيميل أو رقم الموبايل","Email or mobile number")} name="identifier" icon={<Mail/>} required maxLength={254} autoComplete="username" dir="ltr" placeholder={t("اكتب الإيميل أو رقم الموبايل","Enter email or mobile number")}/>:linkedInvite?<p className="web-auth-note">{t("الدعوة جاهزة؛ اكتب كلمة السر لتفعيل حسابك.","Your invitation is ready. Enter your password to activate your account.")}</p>:null}
      {view==="invite"&&!linkedInvite&&<AuthField label={t("رمز الدعوة","Invitation code")} icon={<TicketCheck/>} required minLength={43} maxLength={43} value={token} onChange={e=>setToken(e.target.value.trim())} dir="ltr" autoComplete="off"/>}
      <AuthField label={t("كلمة السر","Password")} name="password" icon={<LockKeyhole/>} type={show?"text":"password"} required minLength={view==="register"?15:undefined} maxLength={view==="register"?128:256} autoComplete={view==="signin"?"current-password":"new-password"} dir="ltr" placeholder={t("اكتب كلمة السر","Enter password")} hint={view==="register"?t("15 حرفًا على الأقل؛ جرّب جملة سهلة تحفظها.","At least 15 characters. Try a memorable phrase."):view==="invite"?t("اختار كلمة سر جديدة (15 حرفًا)، أو اكتب الحالية لو عندك حساب.","Choose a new password (15+ characters), or use your existing password."):undefined} action={<button type="button" aria-label={show?t("إخفاء كلمة السر","Hide password"):t("إظهار كلمة السر","Show password")} aria-pressed={show} onClick={()=>setShow(old=>!old)}>{show?<Eye/>:<EyeOff/>}</button>}/>
      {view==="register"&&owner&&<div className="web-auth-business"><h2>{t("بيانات الجيم","Gym details")}</h2>{[["gymName","اسم الجيم","Gym name"],["governorate","المحافظة","Governorate"],["city","المدينة أو المنطقة","City or area"],["address","العنوان بالتفصيل","Full address"],["description","نبذة عن الجيم","About your gym"]].map(([name,ar,en])=><AuthField key={name} label={t(ar!,en!)} name={name} icon={name==="gymName"?<Store/>:<MapPin/>} required={name!=="description"} minLength={name!=="description"?2:undefined} maxLength={name==="description"?1000:name==="address"?500:120} placeholder={t(`اكتب ${ar}`,`Enter ${en!.toLowerCase()}`)}/>)}<p className="web-auth-note">{t("طلبك هيوصل للإدارة للمراجعة. تقدر تتابع حالته بعد التسجيل.","Your application goes to the platform team for review. Track its status after signing up.")}</p></div>}
      {view==="signin"&&<div className="web-auth-options"><label><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>{t("تذكّرني","Remember me")}</label><ForgotHelp english={english}/></div>}
      {errorText&&<p className="web-auth-error" role="alert">{errorText}</p>}
      <button className="web-auth-submit" type="submit">{busy?<Busy>{t("جاري التنفيذ","Please wait")}</Busy>:view==="signin"?t("تسجيل الدخول","Log in"):view==="register"?(owner?t("إنشاء حساب وإرسال الطلب","Create account & apply"):t("إنشاء حساب متدرب","Create trainee account")):t("قبول الدعوة والدخول","Accept invitation & log in")}</button>
     </fieldset>
    </form>
    {view!=="invite"&&<><div className="web-auth-divider"><span>{t("أو كمّل باستخدام","Or continue with")}</span></div><div className="web-auth-social">{["Google","Apple"].map(provider=><button type="button" key={provider} disabled={busy} onClick={()=>setSocial(provider)}><span dir="ltr">{provider==="Google"?<img src="/brand/google-g.png" width={20} height={20} alt=""/>:<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.3c0-2.1 1.7-3.1 1.8-3.2-1-1.5-2.5-1.7-3-1.7-1.3-.1-2.6.8-3.2.8-.7 0-1.8-.8-2.9-.7-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.8 1.1 9 .7 1.1 1.6 2.3 2.8 2.2 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.7-2.2c.9-1.2 1.3-2.4 1.3-2.5-.1 0-2.9-1.1-2.9-3.9ZM14.9 5.9c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.6-1.2 1.8-1.1 2.8 1.1.1 2.2-.5 2.9-1.2Z"/></svg>}{provider}</span><small>{t("قريبًا","Soon")}</small></button>)}</div>{social&&<p className="web-auth-note" role="status">{t(`الدخول والتسجيل باستخدام ${social} هيتاح قريبًا. استخدم الإيميل حاليًا.`,`${social} sign-in and sign-up are coming soon. Please use email for now.`)}</p>}</>}
    <div className="web-auth-switch"><span>{view==="signin"?t("لسه معندكش حساب؟","Don't have an account?"):t("عندك حساب بالفعل؟","Already a member?")}</span><button type="button" disabled={busy} onClick={()=>change(view==="signin"?"register":"signin")}>{view==="signin"?t("إنشاء حساب","Create account"):t("سجّل دخولك","Log in")}</button></div>
    {view!=="invite"&&<button className="web-auth-invite" type="button" disabled={busy} onClick={()=>change("invite")}><TicketCheck size={19}/>{t("وصلك دعوة؟ قبول الدعوة","Got an invitation? Accept invite")}</button>}
    <footer dir="ltr">GYMBANK · SHO TECH</footer>
   </section>
  </div>
 </main>;
}
function AuthField({label,icon,action,hint,...props}:InputHTMLAttributes<HTMLInputElement>&{label:string;icon:React.ReactNode;action?:React.ReactNode;hint?:string}){
 return <label className="web-auth-field"><span>{label}</span><span className="web-auth-input">{icon}<input {...props}/>{action}</span>{hint&&<small>{hint}</small>}</label>;
}
function ForgotHelp({english}:{english:boolean}){const [phone,setPhone]=useState<string|null>(null),[error,setError]=useState("");return <details className="web-auth-recovery" onToggle={e=>{if(e.currentTarget.open&&!phone)request<{whatsapp:string|null}>("/api/support-contact").then(r=>setPhone(r.whatsapp)).catch(e=>setError(message(e)));}}><summary>{english?"Forgot password?":"نسيت كلمة السر؟"}</summary><div><p>{english?"Contact platform support to verify your identity and receive a temporary recovery link.":"تواصل مع إدارة المنصة للتحقق من هويتك واستلام رابط استعادة مؤقت."}</p>{phone&&<a href={"https://wa.me/"+phone.replace("+","")} target="_blank" rel="noopener noreferrer">{english?"Contact support":"تواصل مع الدعم"}</a>}{error&&<p role="alert">{english?"Unable to load support. Try again.":error}</p>}</div></details>;}
