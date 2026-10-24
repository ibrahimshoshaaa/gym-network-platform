'use client';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { api,send,message,date,ApiError } from '../lib/client';
import { usePage,More } from './gyms/shared';
import { Busy,Field,Notice } from './ui';
const notice='حذف الحساب نهائي: يُحذف الاسم وبيانات الاتصال وكلمة السر والمحتوى الشخصي والصور غير المالية، وتنتهي الجلسات. نحتفظ بسجلات العمليات والإيصالات المالية وسجلات الأمان المطلوبة للمحاسبة والنزاعات. لا يُسقط الحذف أي رصيد أو مستحقات.';
const names:Record<string,string>={ACCOUNT_REVIEW:'مراجعة حساب معطل',GYM_CLOSURE:'إغلاق الجيم من الإدارة',POINT_BALANCE:'تسوية رصيد النقاط',MONEY_BALANCE:'تسوية المستحقات المالية',BOOKINGS:'إنهاء الحجوزات',VISITS:'انتهاء الزيارات السارية',TOPUPS:'حسم طلبات الشحن',WITHDRAWALS:'حسم طلبات السحب',DISPUTES:'حسم النزاعات',REVIEWS:'مراجعة العمليات',SUPPORT:'طلبات دعم مالية مفتوحة',MAINTENANCE:'طلبات صيانة مفتوحة',PROMOTIONS:'إعلانات سارية أو طلبات إعلان',SERVICE_CHARGES:'تسوية رسوم الخدمات'};
type Deletion={id:string;status:string;requestedAt:string;reviewDueAt:string;erasedAt:string|null;completedAt:string|null};
type State={request:Deletion|null;blockers?:{code:string;count:number}[]};
function Details({data}:{data:State}){const r=data.request;return <><p role="status">{r?({PENDING:'طلب الحذف مسجل ويحتاج تسوية أو مراجعة',ERASING:'تم مسح بيانات الحساب؛ جاري حذف الصور من التخزين',COMPLETED:'تم حذف الحساب والصور غير المالية',CANCELLED:'تم إلغاء طلب الحذف'}[r.status]??r.status):'لا يوجد طلب حذف مسجل'}</p>{r?.status==='PENDING'&&<p>موعد مراجعة الطلب: {date(r.reviewDueAt)}. قد يستغرق إتمام الحذف أكثر حتى تنتهي التسوية. يمكنك استخدام الحساب للتسوية أو إلغاء الطلب من إعدادات حسابك قبل بدء الحذف.</p>}{r?.completedAt&&<p>اكتمل في {date(r.completedAt)}</p>}{!!data.blockers?.length&&<ul>{data.blockers.map(b=><li key={b.code}>{names[b.code]??b.code} ({b.count})</li>)}</ul>}</>;}
export function PublicAccountDeletion(){
 const [data,setData]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const key=useRef<string|null>(null),lock=useRef(false);
 useEffect(()=>{try{key.current=localStorage.getItem('gymbank.deletion.receipt');}catch{setError('المتصفح يمنع حفظ مرجع المتابعة. اسمح بالتخزين المحلي قبل تقديم الطلب.');}},[]);
 async function call(action:string,body:unknown){const r=await fetch('/api/account-deletion/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new ApiError(d.code??'SERVICE_UNAVAILABLE',r.status);setData(d);return d as State;}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const form=e.currentTarget,f=new FormData(form);
  try{
   const identity=String(f.get('identifier')).trim().toLowerCase();
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const scoped='gymbank.deletion.v1.'+digest;
   const k=localStorage.getItem(scoped)??crypto.randomUUID();
   localStorage.setItem(scoped,k);
   // Persist before sending: a response can be lost after credentials are erased.
   localStorage.setItem('gymbank.deletion.receipt',k);key.current=k;
   await call('request',{identifier:f.get('identifier'),password:f.get('password'),confirmation:f.get('confirmation'),requestKey:k});
   form.reset();
  }catch(e){setError(e instanceof Error?e.message:'تعذر إرسال الطلب. احتفظ بمرجع المتابعة وحاول تحديث الحالة.');}
  finally{lock.current=false;setBusy(false);}
 }
 async function refresh(){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{if(!key.current)throw new Error('لا يوجد مرجع محفوظ على هذا الجهاز. قدم الطلب ببيانات حسابك.');await call('status',{requestKey:key.current});}catch(e){setError(e instanceof Error?e.message:'تعذر تحديث الحالة');}finally{lock.current=false;setBusy(false);}}
 return <section className="card"><p>{notice}</p><p>قدّم الطلب هنا بدون إعادة تثبيت التطبيق. لو فيه رصيد أو عمليات مفتوحة هنسجل الطلب ونوضح المطلوب تسويته. الإدارة تراجعه خلال 7 أيام. حذف الصور من مزود التخزين قد يحتاج وقتًا إضافيًا.</p>{data&&<Details data={data}/>}<Notice text={error}/>{!data?.request?.erasedAt&&<form onSubmit={submit}><fieldset disabled={busy}><Field label="الموبايل أو الإيميل المسجل" name="identifier" required maxLength={254} autoComplete="username"/><Field label="كلمة السر الحالية" name="password" required type="password" maxLength={256} autoComplete="current-password"/><Field label="اكتب DELETE لتأكيد الحذف النهائي" name="confirmation" required pattern="DELETE" autoComplete="off"/><button className="primary full" type="submit">{busy?<Busy/>:'تأكيد طلب حذف الحساب'}</button></fieldset></form>}<button className="secondary" disabled={busy} onClick={()=>void refresh()}>تحديث حالة طلبي المحفوظ</button><p className="muted">مرجع المتابعة محفوظ على هذا المتصفح. لا تشارك بيانات الدخول مع أحد.</p><a href="/">الرجوع إلى GymBank</a></section>;
}
export function AccountDeletions(){
 const list=usePage<Deletion&{userId:string}>('admin/account-deletions');
 const [selected,setSelected]=useState<string|null>(null),[detail,setDetail]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false);
 async function open(id:string){if(lock.current)return;lock.current=true;setBusy(true);setError('');setSelected(id);setDetail(null);try{setDetail(await api<State>('admin/account-deletions/'+id));}catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}}
 async function process(e:FormEvent<HTMLFormElement>){e.preventDefault();if(lock.current||!selected)return;lock.current=true;setBusy(true);setError('');const form=e.currentTarget,f=new FormData(form);try{setDetail(await api<State>('admin/account-deletions/'+selected+'/process',send({password:f.get('password'),confirmation:f.get('confirmation')})));form.reset();await list.refresh();}catch(e){setError(message(e));}finally{lock.current=false;setBusy(false);}}
 return <section className="card"><h2>طلبات حذف الحسابات</h2><p>{notice}</p><p>لا يمكن تجاوز الأرصدة أو العمليات المفتوحة. أغلق الجيم بعد مراجعة التزاماته أولًا. الطلب الجاري حذفه يعيد تشغيل محاولة حذف الصور عند الضغط على تنفيذ.</p><Notice text={list.error||error}/><button className="secondary" disabled={busy||list.loading} onClick={()=>void list.refresh()}>تحديث الطلبات</button>{!list.loading&&!list.rows.length&&<p>لا توجد طلبات معلقة.</p>}<div className="timeline">{list.rows.map(r=><article key={r.id}><strong>{r.status==='PENDING'?'يحتاج تسوية أو مراجعة':'جاري حذف الصور'}</strong><p>موعد المراجعة: {date(r.reviewDueAt)}</p><code>{r.id}</code><br/><button className="secondary" disabled={busy} onClick={()=>void open(r.id)}>مراجعة الطلب</button></article>)}</div><More list={list}/>{detail&&<div className="card"><Details data={detail}/>{detail.request?.status!=='COMPLETED'&&<form onSubmit={process}><fieldset disabled={busy}><Field label="كلمة مرور الأدمن الحالية" name="password" required type="password" maxLength={256} autoComplete="current-password"/><Field label="اكتب DELETE لتنفيذ طلب المستخدم بعد التسوية" name="confirmation" required pattern="DELETE"/><button className="primary">{busy?<Busy/>:'فحص التسوية وتنفيذ الطلب'}</button></fieldset></form>}</div>}</section>;
}
