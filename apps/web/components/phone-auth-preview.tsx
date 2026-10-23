"use client";
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {request,send,type Identity,ApiError} from '../lib/client';
type Challenge={challengeId:string;expiresAt:string;retryAfterSeconds:number;testMode:boolean};
const errorText=(e:unknown)=>e instanceof ApiError?({PHONE_OTP_DISABLED:'التجربة مش مفعّلة على السيرفر ده.',PHONE_OTP_WAIT:'انتظر دقيقة قبل طلب كود جديد.',PHONE_OTP_INVALID:'الكود غير صحيح أو انتهى أو اتستخدم؛ والاسترجاع لحسابات التجربة فقط.',ACCOUNT_UNAVAILABLE:'الرقم مسجل بالفعل. ادخل بالباسورد أو استخدم الاسترجاع.',RATE_LIMITED:'محاولات كتير. انتظر قليلًا.',INVALID_INPUT:'راجع الحقول؛ كلمة السر ١٥ حرفًا على الأقل.'} as Record<string,string>)[e.code]??'تعذر إتمام الخطوة. حاول تاني.':'تعذر الاتصال بالخدمة.';
export function PhoneAuthPreview({owner=false,reset=false,onLogin,onClose}:{owner?:boolean;reset?:boolean;onLogin?:(user:Identity)=>void;onClose?:()=>void}){
 const [challenge,setChallenge]=useState<Challenge|null>(null),[draft,setDraft]=useState<Record<string,unknown>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[wait,setWait]=useState(0);const running=useRef(false);
 useEffect(()=>{if(wait<=0)return;const t=setTimeout(()=>setWait(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(t);},[wait]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(running.current)return;running.current=true;setBusy(true);setError('');const f=new FormData(e.currentTarget);
  try{
   if(!challenge){const data=Object.fromEntries(f.entries());const c=await request<Challenge>('/api/phone-auth/challenge',send({phone:data.phone,purpose:reset?'RESET':'REGISTER'}));setDraft(data);setChallenge(c);setWait(c.retryAfterSeconds);}
   else if(draft){const proof={phone:draft.phone,challengeId:challenge.challengeId,code:String(f.get('code')??'').trim()};
    if(reset){await request('/api/phone-auth/reset',send({...proof,newPassword:draft.password}));setDone(true);setDraft(null);setChallenge(null);}
    else{const result=await request<{user:Identity}>('/api/phone-auth/register',send({...proof,displayName:draft.displayName,password:draft.password,accountType:owner?'owner':'trainee',...(owner?{gym:Object.fromEntries(['gymName','description','governorate','city','address'].map(k=>[k,draft[k]]))}:{})}));setDraft(null);onLogin?.(result.user);}
   }
  }catch(e){setError(errorText(e));}finally{running.current=false;setBusy(false);}
 }
 async function resend(){if(!draft||running.current||wait>0)return;running.current=true;setBusy(true);setError('');try{const c=await request<Challenge>('/api/phone-auth/challenge',send({phone:draft.phone,purpose:reset?'RESET':'REGISTER'}));setChallenge(c);setWait(c.retryAfterSeconds);}catch(e){setError(errorText(e));}finally{running.current=false;setBusy(false);}}
 return <section dir="rtl" aria-label={reset?'استرجاع كلمة السر بالموبايل':'تسجيل بالموبايل — تجربة'}>
  <p className="web-auth-note">اكتب رقم موبايلك. دي تجربة بدون إرسال SMS؛ الكود <strong dir="ltr">123456</strong> بيتملّى تلقائيًا، وصلاحيته ٥ دقائق.</p>
  {done?<><p role="status">تم تغيير كلمة السر وإغلاق الجلسات القديمة. ادخل بنفس الرقم وكلمة السر الجديدة.</p><button type="button" onClick={onClose}>رجوع للدخول</button></>:<form onSubmit={submit}><fieldset disabled={busy}>
   {!challenge?<>
    {!reset&&<label className="web-auth-field">الاسم بالكامل<input name="displayName" required minLength={2} maxLength={100} autoComplete="name"/></label>}
    <label className="web-auth-field">{reset?'نفس رقم الموبايل المسجّل':'رقم الموبايل'}<input name="phone" type="tel" required placeholder="اكتب رقم الموبايل" dir="ltr" autoComplete="tel"/></label>
    <label className="web-auth-field">{reset?'كلمة السر الجديدة':'كلمة السر'}<input name="password" type="password" required minLength={15} maxLength={128} autoComplete="new-password"/><small>١٥ حرفًا على الأقل.</small></label>
    {!reset&&owner&&<>{[['gymName','اسم الجيم'],['governorate','المحافظة'],['city','المدينة'],['address','العنوان'],['description','نبذة']].map(([k,label])=><label className="web-auth-field" key={k}>{label}<input name={k} required={k!=='description'} minLength={k!=='description'?2:undefined} maxLength={k==='description'?1000:150}/></label>)}</>}
   </>:<><p>تأكيد الرقم <span dir="ltr">{String(draft?.phone)}</span></p><label className="web-auth-field">كود التأكيد<input key={challenge.challengeId} name="code" defaultValue={challenge.testMode?'123456':''} required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" dir="ltr"/></label><button type="button" disabled={busy||wait>0} onClick={()=>void resend()}>{wait>0?`طلب كود جديد بعد ${wait} ثانية`:'طلب كود جديد'}</button><button type="button" onClick={()=>{setDraft(null);setChallenge(null);setError('');}}>تعديل البيانات</button></>}
   {error&&<p className="web-auth-error" role="alert">{error}</p>}
   <button className="web-auth-submit" type="submit">{busy?'جارٍ التنفيذ…':challenge?(reset?'تأكيد وتغيير كلمة السر':'تأكيد وإنشاء الحساب'):'طلب كود التجربة'}</button>
  </fieldset></form>}
  {onClose&&!done&&<button type="button" disabled={busy} onClick={onClose}>رجوع</button>}
 </section>;
}
