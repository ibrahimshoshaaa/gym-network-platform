"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {api,message,send} from '../lib/client';
import {Busy,Field,Notice} from './ui';
type Preset={id:string;nameAr:string;nameEn:string;category:string;kind:string;active:boolean;version?:number};
const fresh:Preset={id:'',nameAr:'',nameEn:'',category:'training',kind:'SERVICE',active:true};
export function ServicePresets(){
 const [items,setItems]=useState<Preset[]>([]),[draft,setDraft]=useState<Preset>({...fresh}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){try{setItems((await api<{items:Preset[]}>('admin/service-presets')).items);}catch(e){setError(message(e));}}
 useEffect(()=>{void load();},[]);
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const {version,...body}=draft;await api('admin/service-presets',send({...body,...(version!==undefined?{expectedVersion:version}:{})}));setDraft({...fresh});await load();}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <section><h2>الخدمات الجاهزة والمرافق</h2><p>صاحب الفرع يختار الخدمة ويحدد سعرها ومدتها ومواعيدها للمراجعة. المرافق اختيارات متاحة ضمن الزيارة. إيقاف اختيار يمنع إضافته مستقبلًا ويحافظ على بيانات الفروع الحالية.</p><Notice text={error}/>
 <form className="card" onSubmit={save}>
 <Field label="معرّف ثابت بالإنجليزي (لا يتغير)" value={draft.id} required pattern="[a-z][a-z0-9_]{1,63}" disabled={busy||draft.version!==undefined} onChange={e=>setDraft({...draft,id:e.target.value})}/>
 <Field label="الاسم بالعربي" required maxLength={150} value={draft.nameAr} disabled={busy} onChange={e=>setDraft({...draft,nameAr:e.target.value})}/>
 <Field label="الاسم بالإنجليزي" required maxLength={150} value={draft.nameEn} disabled={busy} onChange={e=>setDraft({...draft,nameEn:e.target.value})}/>
 <label className="field">النوع<select value={draft.kind} disabled={busy||draft.version!==undefined} onChange={e=>setDraft({...draft,kind:e.target.value})}><option value="SERVICE">خدمة قابلة للحجز</option><option value="FACILITY">مرفق ضمن الزيارة</option></select></label>
 <label className="field">التصنيف<select value={draft.category} disabled={busy} onChange={e=>setDraft({...draft,category:e.target.value})}>{Object.entries({training:'التدريب والأجهزة',classes:'الكلاسات والفنون القتالية',spa:'الاستشفاء والسبا',nutrition:'القياسات والتغذية',facilities:'المرافق والنظام'}).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
 <label><input type="checkbox" checked={draft.active} disabled={busy} onChange={e=>setDraft({...draft,active:e.target.checked})}/> متاح للاختيار</label>
 <button className="primary" disabled={busy}>{busy?<Busy/>:'حفظ الاختيار'}</button><button type="button" className="secondary" onClick={()=>setDraft({...fresh})}>اختيار جديد</button>
 </form>
 <div className="cards">{items.map(p=><article className="card" key={p.id}><h3>{p.nameAr}</h3><p>{p.nameEn} · {p.kind==='SERVICE'?'خدمة':'مرفق'} · {p.active?'متاح':'موقوف'}</p><button className="secondary" disabled={busy} onClick={()=>setDraft({...p})}>تعديل</button></article>)}</div></section>;
}
