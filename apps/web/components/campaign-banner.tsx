"use client";
import {useEffect,useRef,useState} from 'react';
import {api} from '../lib/client';
type Delivered={id:string;title:string;description:string;imageUrl:string|null;endsAt:string;destination:string;hasAction:boolean};
export function CampaignBanner({placement,onNavigate}:{placement:'HOME'|'GYMS'|'WALLET';onNavigate:(destination:string)=>void}){
 return <CampaignDelivery key={placement} placement={placement} onNavigate={onNavigate}/>;
}
function CampaignDelivery({placement,onNavigate}:{placement:string;onNavigate:(destination:string)=>void}){
 const [items,setItems]=useState<Delivered[]>([]);
 useEffect(()=>{let live=true;const load=()=>{if(document.visibilityState!=='visible')return;api<{items:Delivered[]}>(`campaigns?placement=${placement}`).then(r=>{if(live)setItems(r.items);}).catch(()=>{if(live)setItems([]);});};load();const timer=setInterval(load,60000);return()=>{live=false;clearInterval(timer);};},[placement]);
 return <CampaignSlider key={items.map(c=>`${c.id}:${c.endsAt}`).join(',')} items={items} onNavigate={onNavigate}/>;
}
export function CampaignSlider({items,onNavigate}:{items:Delivered[];onNavigate:(destination:string)=>void}){
 const [index,setIndex]=useState(0),[now,setNow]=useState(()=>Date.now()),[paused,setPaused]=useState(false),[held,setHeld]=useState(false);
 const touch=useRef<number|null>(null);
 const active=items.filter(c=>Date.parse(c.endsAt)>now),count=active.length;
 useEffect(()=>{const timer=setInterval(()=>{setNow(Date.now());if(!paused&&!held&&document.visibilityState==='visible')setIndex(i=>count>1?(i+1)%count:0);},4000);return()=>clearInterval(timer);},[count,paused,held,index]);
 if(!count)return null;
 const position=index%count,c=active[position]!;
 const move=(next:number)=>setIndex((next+count)%count);
 const posterOnly=Boolean(c.imageUrl&&!c.title&&!c.description&&!c.hasAction);
 return <section className="campaign-slider" aria-roledescription="عارض إعلانات" aria-label="إعلانات GymBank"
 onMouseEnter={()=>setHeld(true)} onMouseLeave={()=>setHeld(false)}
 onFocusCapture={()=>setHeld(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setHeld(false);}}
 onTouchStart={e=>{touch.current=e.touches[0]?.clientX??null;setHeld(true);}}
 onTouchEnd={e=>{const start=touch.current,end=e.changedTouches[0]?.clientX;if(start!==null&&end!==undefined&&Math.abs(end-start)>40)move(position+(end<start?1:-1));touch.current=null;setHeld(false);}}
 onTouchCancel={()=>{touch.current=null;setHeld(false);}}
 onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(position+(e.key==='ArrowLeft'?1:-1));}}}>
 <aside key={c.id} className={`card campaign-banner campaign-slide${posterOnly?' campaign-poster-only':''}`} aria-label={`إعلان ${position+1} من ${count}`}>
 {c.imageUrl&&<img src={c.imageUrl} alt={c.title||'إعلان من GymBank'} loading="lazy"/>}
 {(c.title||c.description||c.hasAction)&&<div className="campaign-copy">{c.title&&<h3>{c.title}</h3>}{c.description&&<p>{c.description}</p>}{c.hasAction&&<button className="text-button" onClick={()=>onNavigate(c.destination)}>اعرف التفاصيل</button>}</div>}
 </aside>
 {count>1&&<div className="campaign-controls"><button type="button" className="text-button" aria-label="الإعلان السابق" onClick={()=>move(position-1)}>‹</button><div className="campaign-dots">{active.map((item,i)=><button type="button" key={item.id} aria-label={`عرض الإعلان ${i+1}`} aria-current={position===i?'true':undefined} onClick={()=>move(i)}/>)}</div><button type="button" className="text-button" aria-label="الإعلان التالي" onClick={()=>move(position+1)}>›</button><button type="button" className="text-button" onClick={()=>setPaused(v=>!v)} aria-label={paused?'تشغيل تبديل الإعلانات':'إيقاف تبديل الإعلانات'}>{paused?'▶':'Ⅱ'}</button></div>}
 </section>;
}
