"use client";
import {useEffect,useState,type ComponentType} from 'react';
import {PendingCount} from './admin-activity';
import {ChevronDown} from 'lucide-react';
import {adminSections,adminSectionFor} from '../lib/navigation';
type Item={id:string;label:string;icon:ComponentType<{size?:number}>};
export function AdminSideNav({items,current,onNavigate}:{items:readonly Item[];current:string;onNavigate:(id:string)=>void}){
 const active=adminSectionFor(current).id;
 const [expanded,setExpanded]=useState<string[]>([active]);
 useEffect(()=>{setExpanded(previous=>previous.includes(active)?previous:[...previous,active]);},[active]);
 return <>{adminSections.map(section=>{
  const item=items.find(item=>item.id===section.id);if(!item)return null;
  const children=section.items.length?[{...item,label:'نظرة عامة'},...section.items.flatMap(id=>items.filter(item=>item.id===id))]:[];
  if(!children.length)return <button key={section.id} type="button" className={active===section.id?'active':''} aria-current={current===section.id?'page':undefined} onClick={()=>onNavigate(section.id)}><item.icon size={20}/><span>{section.label}</span><PendingCount destination={section.id}/></button>;
  const open=expanded.includes(section.id),panelId=`admin-nav-${section.id}`;
  return <div className="admin-nav-group" key={section.id}>
   <button type="button" className={`admin-nav-toggle${active===section.id?' section-active':''}`} aria-expanded={open} aria-controls={panelId} onClick={()=>setExpanded(previous=>open?previous.filter(id=>id!==section.id):[...previous,section.id])}><item.icon size={20}/><span>{section.label}</span><ChevronDown size={16} className={open?'expanded':''}/></button>
   <div id={panelId} className="admin-nav-children" hidden={!open} role="group" aria-label={`قائمة ${section.label}`}>
    {children.map(child=><button key={child.id} type="button" aria-current={current===child.id?'page':undefined} className={current===child.id?'active':''} onClick={()=>onNavigate(child.id)}><child.icon size={17}/><span>{child.label}</span><PendingCount destination={child.id}/></button>)}
   </div>
  </div>;
 })}</>;
}
