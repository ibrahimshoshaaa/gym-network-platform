"use client";
import {useEffect,useState} from 'react';
import {api,message} from '../../lib/client';
import {Busy,Empty,Modal,Notice} from '../ui';
import {ServiceRequestReview,type ServiceRequest} from '../service-price-review';
type Service={id:string;name:string;description:string;points:number|null;durationMinutes:number|null;version:number;active:boolean;approvedAt:string|null;openMinute:number|null;closeMinute:number|null;requests:(Omit<ServiceRequest,'service'>&{status:string})[]};
type Catalog={branch:{id:string;name:string;bookingOpenMinute:number|null;bookingCloseMinute:number|null};facilities:{id:string;nameAr:string}[];items:Service[]};
const clock=(minute:number)=>`${Math.floor(minute/60).toString().padStart(2,'0')}:${(minute%60).toString().padStart(2,'0')}`;
export function BranchCatalog({gymId,branch,onClose}:{gymId:string;branch:{id:string;name:string};onClose:()=>void}){
 const [data,setData]=useState<Catalog|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{setData(await api<Catalog>(`admin/gyms/${gymId}/branches/${branch.id}/services`));}catch(e){setError(message(e));}finally{setLoading(false);}}
 useEffect(()=>{void load();},[gymId,branch.id]);
 return <Modal title={`خدمات ومواعيد ${branch.name}`} onClose={onClose}>
  <Notice text={error}/><button className="secondary compact" disabled={loading} onClick={()=>void load()}>تحديث الخدمات والمواعيد</button>
  {loading&&!data?<Busy/>:data&&<>
   <section className="subtle-box"><h3>مواعيد الحجز الفعلية · القاهرة</h3>{data.branch.bookingOpenMinute!==null&&data.branch.bookingCloseMinute!==null?<p><bdi>{clock(data.branch.bookingOpenMinute)} – {clock(data.branch.bookingCloseMinute)}</bdi></p>:<p>لم يضبط صاحب الجيم مواعيد عامة. يمكن حجز الخدمات ذات المواعيد المستقلة فقط.</p>}</section>
   <h3>المرافق ضمن الزيارة</h3>{data.facilities.length?<div className="branch-facilities">{data.facilities.map(f=><span className="badge" key={f.id}>{f.nameAr}</span>)}</div>:<p className="muted">لم تُحدد مرافق بعد.</p>}
   <h3>الخدمات وأسعارها</h3>{!data.items.length?<Empty title="لم يضف صاحب الجيم خدمات بعد"/>:data.items.map(service=>{
    const pending=service.requests.find(r=>r.status==='PENDING');
    if(pending)return <ServiceRequestReview key={pending.id} request={{...pending,service:{points:service.points,durationMinutes:service.durationMinutes,version:service.version,branch:{name:branch.name,gymId}}}} onDone={load}/>;
    const own=service.openMinute!==null&&service.closeMinute!==null,missing=!own&&data.branch.bookingOpenMinute===null;
    return <article className="card branch-service-review" key={service.id}><div className="section-toolbar"><h3>{service.name}</h3><span className={`badge ${service.approvedAt&&service.active?'approved':'neutral'}`}>{service.approvedAt?(service.active?'معتمدة ومتاحة':'معتمدة ومتوقفة'):'لم تُعتمد'}</span></div><p>{service.description}</p><p>{service.points??'—'} نقطة · {service.durationMinutes??'—'} دقيقة</p><p>{own?<><bdi>{clock(service.openMinute!)} – {clock(service.closeMinute!)}</bdi> · مواعيد مستقلة</>:missing?'الحجز غير جاهز: الخدمة تحتاج مواعيد الفرع.':'تستخدم مواعيد الفرع'}</p>{service.requests[0]?.status==='REJECTED'&&<p className="muted">آخر مقترح مرفوض؛ البيانات المعتمدة السابقة تظل كما هي.</p>}</article>;
   })}
  </>}
 </Modal>;
}
