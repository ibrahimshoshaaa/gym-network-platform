"use client";
import {useEffect,useState} from 'react';
import {api} from '../lib/client';
export function CampaignBanner({placement,onNavigate}:{placement:'HOME'|'GYMS'|'WALLET';onNavigate:(destination:string)=>void}){
 return <CampaignDelivery key={placement} placement={placement} onNavigate={onNavigate}/>;
}
type Delivered={id:string;title:string;description:string;imageUrl:string|null;endsAt:string;destination:string;hasAction:boolean};
function CampaignDelivery({placement,onNavigate}:{placement:string;onNavigate:(destination:string)=>void}){
 const [items,setItems]=useState<Delivered[]>([]);
 useEffect(()=>{let live=true;const load=()=>{if(document.visibilityState!=='visible')return;api<{items:Delivered[]}>(`campaigns?placement=${placement}`).then(r=>{if(live)setItems(r.items);}).catch(()=>{if(live)setItems([]);});};load();const timer=setInterval(load,60000);return()=>{live=false;clearInterval(timer);};},[placement]);
 return <>{items.filter(c=>Date.parse(c.endsAt)>Date.now()).map(c=><aside className="card campaign-banner" key={c.id} aria-label="إعلان من المنصة">{c.imageUrl&&<img src={c.imageUrl} alt="" loading="lazy"/>}<div><small>من GymBank</small><h3>{c.title}</h3><p>{c.description}</p>{c.hasAction&&<button className="text-button" onClick={()=>onNavigate(c.destination)}>اعرف التفاصيل</button>}</div></aside>)}</>;
}
