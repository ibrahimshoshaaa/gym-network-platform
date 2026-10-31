"use client";
import {useState,type ComponentType} from 'react';
import {ArrowLeft,Search,Inbox,X} from 'lucide-react';
import {adminSections,adminSectionFor,type AdminDestination} from '../lib/navigation';
import {adminQueues,queueCounts} from '../lib/admin-queues';
import {normalizeSearch} from '../lib/list-filter';
import {useAdminActivity} from './admin-activity';
import {Busy,Notice} from './ui';
type Item={id:AdminDestination;label:string;description:string;icon:ComponentType<{size?:number}>};
export function AdminWorkspaceTools({items,current,onNavigate}:{items:readonly Item[];current:AdminDestination;onNavigate:(id:AdminDestination,view?:string)=>void}){
 const [query,setQuery]=useState('');const activity=useAdminActivity();
 const counts=queueCounts(activity?.summary??null),total=Object.values(counts).reduce((n,v)=>n+(v??0),0);
 const search=normalizeSearch(query),results=search?items.filter(item=>normalizeSearch(item.label+' '+item.description).includes(search)):[];
 return <div className="workspace-tools">
  <div className="workspace-search"><Search size={18}/><input type="search" aria-label="ابحث عن صفحة أو مهمة" placeholder="ابحث عن صفحة أو مهمة…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button type="button" className="icon-button" aria-label="مسح البحث" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
  <button className="secondary inbox-shortcut" onClick={()=>{setQuery('');onNavigate('requests');}}><Inbox size={18}/>مركز المتابعة{total>0&&<span className="nav-pending">{total}</span>}</button>
  {query&&<section className="workspace-search-results" aria-label="نتائج البحث في الإدارة"><h2 className="sr-only">نتائج البحث</h2>{results.length?results.map(item=><button key={item.id} onClick={()=>{setQuery('');onNavigate(item.id);}}><item.icon size={20}/><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowLeft size={17}/></button>):<p>لا توجد صفحة بهذا الاسم. جرّب «الشحن» أو «الإعلانات» أو «الفروع».</p>}</section>}
  {activity?.error&&current!=='home'&&<Notice text="تعذر تحديث أعداد المتابعة. افتح الصفحة المطلوبة أو أعد التحديث."/>}
 </div>;
}
export function SectionOverview({sectionId,items,onNavigate}:{sectionId:string;items:readonly Item[];onNavigate:(id:AdminDestination,view?:string)=>void}){
 const activity=useAdminActivity(),section=adminSectionFor(sectionId),counts=queueCounts(activity?.summary??null);
 const [showAll,setShowAll]=useState(false);
 if(sectionId==='requests'){
  const queue=adminQueues.filter(q=>showAll||Number(activity?.summary?.cards.find(c=>c.label===q.label)?.value??0)>0);
  return <section className="request-center" aria-label="مركز متابعة المنصة"><div className="section-toolbar"><p className="muted">كل ما يحتاج قرارًا أو متابعة، من جميع أقسام المنصة.</p><button className="secondary compact" disabled={activity?.loading} onClick={()=>void activity?.refresh()}>تحديث الطلبات</button></div><Notice text={activity?.error??''}/><label className="check"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/>عرض الأقسام التي ليس بها طلبات أيضًا</label>{activity?.loading&&!activity.summary?<Busy/>:!activity?.summary?<p>تعذر تحميل الأعداد. افتح القسم المطلوب من القائمة.</p>:queue.length?<div className="admin-destination-grid">{queue.map(q=><button className="card admin-destination" key={q.label} onClick={()=>onNavigate(q.destination,q.view)}><span className="request-count">{activity.summary!.cards.find(c=>c.label===q.label)?.value??'—'}</span><strong>{q.title}</strong><span>{q.description}</span><ArrowLeft size={18}/></button>)}</div>:<div className="card"><h2>{adminQueues.every(q=>activity.summary!.cards.some(c=>c.label===q.label))?"لا توجد طلبات تحتاج متابعة حاليًا":"أعداد المتابعة غير مكتملة"}</h2><p>فعّل عرض كل الأقسام للوصول إلى الطلبات والسجلات.</p></div>}</section>;
 }
 return <section className="admin-destination-grid" aria-label={section.label}>{section.items.map(id=>{const item=items.find(item=>item.id===id)!;return <button className="card admin-destination" key={id} onClick={()=>onNavigate(id)}><item.icon size={25}/>{Boolean(counts[id])&&<span className="destination-count">{counts[id]} للمتابعة</span>}<strong>{item.label}</strong><span>{item.description}</span><ArrowLeft size={18}/></button>;})}</section>;
}
const related:Partial<Record<AdminDestination,AdminDestination[]>>={reviews:['payments','direct-topup','reports'],'direct-topup':['reviews','payments','reports'],'branch-prices':['gyms','service-prices'],'service-prices':['service-presets','gyms'],'promotion-requests':['gyms','campaigns','reports'],market:['promotion-requests','campaigns'],'booking-reviews':['booking-policy','operation-reviews'],withdrawals:['finance','reports','disputes'],pricing:['packages','payments'],payments:['reviews','pricing'],packages:['pricing','reviews'],maintenance:['gyms','reports'],users:['account-deletions','audit']};
export function RelatedTasks({current,items,onNavigate}:{current:AdminDestination;items:readonly Item[];onNavigate:(id:AdminDestination,view?:string)=>void}){const ids=related[current];return ids?<nav className="related-tasks" aria-label="صفحات مرتبطة"><strong>قد تحتاج أيضًا</strong>{ids.map(id=><button className="secondary compact" key={id} onClick={()=>onNavigate(id)}>{items.find(item=>item.id===id)?.label}<ArrowLeft size={15}/></button>)}</nav>:null;}
