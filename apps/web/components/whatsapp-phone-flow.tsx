"use client";
import {useEffect,useRef,useState} from 'react';
import {request,send} from '../lib/client';
import {WhatsappVerification,type WhatsappPhase} from './whatsapp-verification';
type Attempt={challengeId:string;whatsappToken:string;expiresAt:string;whatsappUrl:string};
export function WhatsappPhoneFlow({phone,purpose,onVerified,onBack}:{phone:string;purpose:'REGISTER'|'RESET';onVerified:(proof:Record<string,string>)=>Promise<void>;onBack:()=>void}){
 const [attempt,setAttempt]=useState<Attempt|null>(null),[phase,setPhase]=useState<WhatsappPhase>('ready'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const current=useRef<Attempt|null>(null),finished=useRef(false);
 const body=(a:Attempt)=>({phone,purpose,challengeId:a.challengeId,whatsappToken:a.whatsappToken});
 useEffect(()=>{let active=true;setBusy(true);setError('');setAttempt(null);
  request<Attempt>('/api/whatsapp/challenge',send({phone,purpose})).then(a=>{if(!active){void request('/api/whatsapp/cancel',send(body(a))).catch(()=>{});return;}current.current=a;setAttempt(a);setPhase('ready');}).catch(()=>{if(active){setPhase('error');setError('تعذر بدء التحقق. حاول لاحقًا أو استخدم SMS.');}}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;const a=current.current;current.current=null;if(a&&!finished.current)void request('/api/whatsapp/cancel',send(body(a))).catch(()=>{});};
 // The host remounts for a different identity/purpose; tokens stay in memory only.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[phone,purpose,refresh]);
 useEffect(()=>{if(!attempt)return;let active=true,running=false;let timer:ReturnType<typeof setTimeout>;
  async function check(){if(!active||running)return;if(Date.now()>=Date.parse(attempt!.expiresAt)){setPhase('expired');return;}if(document.hidden){timer=setTimeout(check,5000);return;}running=true;
   try{const r=await request<{status:string}>('/api/whatsapp/check',send(body(attempt!)));if(!active)return;
    if(r.status==='verified'){setPhase('verified');setError('');return;}
    if(r.status==='expired'||r.status==='cancelled'){setPhase('expired');return;}
    setError('');timer=setTimeout(check,5000);
   }catch{if(active){setError('تعذر تحديث الحالة؛ هنحاول تاني تلقائيًا.');timer=setTimeout(check,10000);}}
   finally{running=false;}
  }
  timer=setTimeout(check,1000);return()=>{active=false;clearTimeout(timer);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[attempt]);
 function open(){if(!attempt)return;const url=new URL(attempt.whatsappUrl);if(url.protocol!=='https:'||url.hostname!=='wa.me'||url.username||url.password||!/^\/[1-9]\d{7,14}$/.test(url.pathname)){setError('تعذر فتح واتساب.');return;}window.open(url.href,'_blank','noopener,noreferrer');setPhase('waiting');}
 async function complete(){if(!attempt||busy||phase!=='verified')return;setBusy(true);setError('');try{await onVerified({challengeId:attempt.challengeId,whatsappToken:attempt.whatsappToken});finished.current=true;}catch{setError('تعذر إتمام العملية. لو الطلب انتهى ارجع وابدأ من جديد.');}finally{setBusy(false);}}
 return <div aria-busy={busy}>
  {busy&&<p role="status">جارٍ التنفيذ…</p>}
  <WhatsappVerification phase={phase} phone={phone} onOpen={attempt?open:undefined} onRetry={()=>setRefresh(n=>n+1)} onSms={busy?undefined:onBack}/>
  {error&&<p role="alert">{error}</p>}
  {phase==='verified'&&<button type="button" className="web-auth-submit" disabled={busy} onClick={()=>void complete()}>متابعة بعد تأكيد الرقم</button>}
  <button type="button" disabled={busy} onClick={onBack}>رجوع وتغيير الطريقة</button>
 </div>;
}
