"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {request,send,type Identity,ApiError} from '../lib/client';
import {WhatsappPhoneFlow} from './whatsapp-phone-flow';
import {WhatsappVerification} from './whatsapp-verification';
import {normalizeDigits} from '../lib/topup-estimate';
type Challenge={challengeId:string;expiresAt:string;retryAfterSeconds:number;testMode:boolean};
const errorText=(e:unknown)=>e instanceof ApiError?({PHONE_OTP_DISABLED:'خدمة التحقق بالموبايل غير مفعلة حاليًا.',PHONE_OTP_SEND_FAILED:'تعذر طلب رسالة التحقق. راجع اتصال جهاز الإرسال وحاول لاحقًا.',PHONE_OTP_WAIT:'انتظر دقيقة قبل طلب كود جديد.',PHONE_OTP_INVALID:'الكود غير صحيح أو انتهى أو اتستخدم.',ACCOUNT_UNAVAILABLE:'الرقم مسجل بالفعل. ادخل بالباسورد أو استخدم الاسترجاع.',RATE_LIMITED:'محاولات كتير. انتظر قليلًا.',INVALID_INPUT:'راجع الحقول؛ كلمة السر ١٥ حرفًا على الأقل.'} as Record<string,string>)[e.code]??'تعذر إتمام الخطوة. حاول تاني.':'تعذر الاتصال بالخدمة.';
export function PhoneAuthPreview({owner=false,reset=false,onLogin,onClose}:{owner?:boolean;reset?:boolean;onLogin?:(user:Identity)=>void;onClose?:()=>void}){
 const [showWhatsapp,setShowWhatsapp]=useState(false),[whatsappPhone,setWhatsappPhone]=useState('');
 const [method,setMethod]=useState('sms'),[waEnabled,setWaEnabled]=useState(false),[smsEnabled,setSmsEnabled]=useState(true),[waFlow,setWaFlow]=useState(false);
 useEffect(()=>{let active=true;request<{smsEnabled?:boolean;whatsappEnabled?:boolean}>('/api/phone-auth/status').then(s=>{if(active){setWaEnabled(s.whatsappEnabled===true);setSmsEnabled(s.smsEnabled!==false);if(s.smsEnabled===false&&s.whatsappEnabled)setMethod('whatsapp');}}).catch(()=>{});return()=>{active=false;};},[]);
 async function finish(proof:Record<string,unknown>){if(!draft)return;const data={phone:draft.phone,...proof};if(reset){await request('/api/phone-auth/reset',send({...data,newPassword:draft.password}));setDone(true);setWaFlow(false);setDraft(null);setChallenge(null);}else{const result=await request<{user:Identity}>('/api/phone-auth/register',send({...data,displayName:draft.displayName,password:draft.password,accountType:owner?'owner':'trainee',...(owner?{gym:Object.fromEntries(['gymName','description','governorate','city','address'].map(k=>[k,draft[k]]))}:{})}));setWaFlow(false);setDraft(null);onLogin?.(result.user);}}
 const form=useRef<HTMLFormElement>(null);
 const [challenge,setChallenge]=useState<Challenge|null>(null),[draft,setDraft]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[wait,setWait]=useState(0);const running=useRef(false);
 useEffect(()=>{if(wait<=0)return;const t=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(t);},[wait]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(running.current)return;running.current=true;setBusy(true);setError('');const f=new FormData(e.currentTarget);
  try{
   if(!challenge){const data=Object.fromEntries(f.entries());if(method==='whatsapp'){setDraft(data);setWaFlow(true);return;}const c=await request<Challenge>('/api/phone-auth/challenge',send({phone:data.phone,purpose:reset?'RESET':'REGISTER'}));setDraft(data);setChallenge(c);setWait(c.retryAfterSeconds);}
   else if(draft){const proof={phone:draft.phone,challengeId:challenge.challengeId,code:normalizeDigits(String(f.get('code')??'').trim())};
    await finish(proof);
   }
  }catch(e){setError(errorText(e));}finally{running.current=false;setBusy(false);}
 }
 async function resend(){if(!draft||running.current||wait>0)return;running.current=true;setBusy(true);setError('');try{const c=await request<Challenge>('/api/phone-auth/challenge',send({phone:draft.phone,purpose:reset?'RESET':'REGISTER'}));setChallenge(c);setWait(c.retryAfterSeconds);}catch(e){setError(errorText(e));}finally{running.current=false;setBusy(false);}}
 return <section dir="rtl" aria-label={reset?'استرجاع كلمة السر بالموبايل':'تسجيل بالموبايل'}>
  {waFlow&&draft&&<WhatsappPhoneFlow phone={String(draft.phone)} purpose={reset?'RESET':'REGISTER'} onVerified={finish} onBack={()=>{setWaFlow(false);setMethod('sms');}}/>}
  {showWhatsapp&&<WhatsappVerification phase="unavailable" phone={whatsappPhone} onSms={()=>setShowWhatsapp(false)} onBack={()=>setShowWhatsapp(false)}/>}
  <div hidden={showWhatsapp||waFlow}>
  <p className="web-auth-note">{challenge?.testMode?<>وضع تجريبي بدون SMS؛ الكود <strong dir="ltr">123456</strong> بيتملّى تلقائيًا.</>:<>اكتب رقم موبايلك، وهنطلب إرسال كود التحقق في رسالة SMS. صلاحيته ٥ دقائق.</>}</p>
  {done?<><p role="status">تم تغيير كلمة السر وإغلاق الجلسات القديمة. ادخل بنفس الرقم وكلمة السر الجديدة.</p><button type="button" onClick={onClose}>رجوع للدخول</button></>:<form ref={form} onSubmit={submit}><fieldset disabled={busy}>
   {!challenge?<>
    <div className="phone-verification-methods" role="group" aria-label="طرق التحقق"><strong>طريقة تأكيد الرقم</strong><label><input type="radio" name="verificationMethod" checked={method==='sms'} disabled={!smsEnabled} onChange={()=>setMethod('sms')}/>رسالة SMS</label><label><input type="radio" name="verificationMethod" checked={method==='whatsapp'} disabled={!waEnabled} onChange={()=>setMethod('whatsapp')}/>واتساب{!waEnabled&&' · غير متاح حاليًا'}</label>{!waEnabled&&<button type="button" onClick={()=>{setWhatsappPhone(form.current?String(new FormData(form.current).get('phone')??''):'');setShowWhatsapp(true);}}>تفاصيل واتساب</button>}</div>
    {!reset&&<label className="web-auth-field">الاسم بالكامل<input name="displayName" required minLength={2} maxLength={100} autoComplete="name"/></label>}
    <label className="web-auth-field">{reset?'نفس رقم الموبايل المسجّل':'رقم الموبايل'}<input name="phone" type="tel" required placeholder="اكتب رقم الموبايل" dir="ltr" autoComplete="tel"/></label>
    <label className="web-auth-field">{reset?'كلمة السر الجديدة':'كلمة السر'}<input name="password" type="password" required minLength={15} maxLength={128} autoComplete="new-password"/><small>١٥ حرفًا على الأقل.</small></label>
    {!reset&&owner&&<>{[['gymName','اسم الجيم'],['governorate','المحافظة'],['city','المدينة'],['address','العنوان'],['description','نبذة']].map(([k,label])=><label className="web-auth-field" key={k}>{label}<input name={k} required={k!=='description'} minLength={k!=='description'?2:undefined} maxLength={k==='description'?1000:150}/></label>)}</>}
   </>:<><p>تأكيد الرقم <span dir="ltr">{String(draft?.phone)}</span></p>{!challenge.testMode&&<p>الكود في الرسالة مكتوب بالكلمات؛ اكتبه هنا بالأرقام.</p>}<label className="web-auth-field">كود التأكيد<input key={challenge.challengeId} name="code" defaultValue={challenge.testMode?'123456':''} required pattern="[0-9٠-٩۰-۹]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" dir="ltr"/></label><button type="button" disabled={busy||wait>0} onClick={()=>void resend()}>{wait>0?`طلب كود جديد بعد ${wait} ثانية`:'طلب كود جديد'}</button><button type="button" onClick={()=>{setDraft(null);setChallenge(null);setError('');}}>تعديل البيانات</button></>}
   {error&&<p className="web-auth-error" role="alert">{error}</p>}
   <button className="web-auth-submit" type="submit">{busy?'جارٍ التنفيذ…':challenge?(reset?'تأكيد وتغيير كلمة السر':'تأكيد وإنشاء الحساب'):method==='whatsapp'?'متابعة عبر واتساب':'طلب كود التحقق'}</button>
  </fieldset></form>}
  </div>
  {onClose&&!done&&!showWhatsapp&&!waFlow&&<button type="button" disabled={busy} onClick={onClose}>رجوع</button>}
 </section>;
}
