"use client";
import {CampaignBanner} from "./campaign-banner";
import {useEffect,useState} from 'react';
import {Home,Store,QrCode,Wallet,UserRound,ArrowLeftRight,ChevronLeft,FileChartColumn} from 'lucide-react';
import {api,message,decimal,type Identity} from '../lib/client';
import {PortalHeader} from './portal-header';

import {PortalAccount} from './portal-account';
import {usePage,type Gym,More} from './gyms/shared';
import {Busy,Empty,Notice} from './ui';
import {GymManagement} from './gyms/management';
import {PointWallet} from './point-wallet';
import {Inventory} from './inventory';
import {Cashier} from './operations';
import {Purchases} from './purchases';
import {Withdrawals} from './withdrawals';
import {Reports} from './reports';
import {OperationReviews} from './operation-reviews';
import {Disputes} from "./disputes";
import {Support} from './support';
const sections=[{id:'home',label:'الرئيسية',icon:Home},{id:'gyms',label:'الفروع',icon:Store},{id:'cashier',label:'التشغيل',icon:QrCode},{id:'withdrawals',label:'مستحقاتي',icon:Wallet},{id:'account',label:'حسابي',icon:UserRound}] as const;
type Destination=typeof sections[number]['id']|'point-wallet'|'inventory'|'purchases'|'reports'|'operation-reviews'|'support'|'disputes';
export function OwnerPortal({user,logout,loggingOut,onPassword,error}:{user:Identity;logout:()=>Promise<void>;loggingOut:boolean;onPassword:()=>void;error:string}){
 const [section,setSection]=useState<Destination>('home'),[gymId,setGymId]=useState('');const gyms=usePage<Gym>('gyms');const selected=gyms.rows.find(g=>g.id===gymId)??gyms.rows[0];
 function navigate(next:Destination){setSection(next);window.scrollTo({top:0,behavior:'auto'});}
 const active=['point-wallet','inventory','purchases','reports'].includes(section)?'home':section==='disputes'?'withdrawals':section==='operation-reviews'?'cashier':section==='support'?'account':section;
 return <div className="trainee-portal mobile-mirror owner-mirror"><PortalHeader user={user} onNavigate={next=>{if(['home','gyms','cashier','withdrawals','point-wallet','inventory','purchases','reports','operation-reviews','support','disputes'].includes(next))navigate(next as Destination);}}/><main className="trainee-content"><Notice text={error}/>{section!=="home"&&["home","gyms","point-wallet","purchases"].includes(section)&&<CampaignBanner placement={section==="gyms"?"GYMS":["point-wallet","purchases"].includes(section)?"WALLET":"HOME"} onNavigate={next=>{if(["home","gyms","cashier","withdrawals","point-wallet","inventory","purchases","reports","operation-reviews","support"].includes(next))navigate(next as Destination);}}/>}<div key={section}>
 {section==='home'?<><div className="portal-welcome"><h1>{selected?.name??'جيمك'}</h1><p className="muted">رصيدك وتشغيل جيمك، من مكان واحد.</p></div><CampaignBanner placement="HOME" onNavigate={next=>{if(["home","gyms","cashier","withdrawals","point-wallet","inventory","purchases","reports","operation-reviews","support"].includes(next))navigate(next as Destination);}}/><Notice text={gyms.error}/>{gyms.rows.length>1&&<label className="field">الجيم الحالي<select value={selected?.id??''} onChange={e=>setGymId(e.target.value)}>{gyms.rows.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}<More list={gyms}/>{selected?<OwnerHome key={selected.id} gym={selected} navigate={navigate}/>:gyms.loading?<Busy/>:!gyms.error?<Empty title="مفيش جيم مرتبط بحسابك"/>:null}</>
 :section==='account'?<PortalAccount user={user} logout={logout} loggingOut={loggingOut} onPassword={onPassword} onPurchases={()=>navigate('purchases')} onSupport={()=>navigate('support')}/>
 :<><button className="text-button portal-back" onClick={()=>navigate('home')}>الرجوع للرئيسية</button>{section==='gyms'?<><h1>الفروع والموظفين</h1><GymManagement admin={false}/></>:section==='cashier'?<><h1>شغل الجيم</h1><Cashier initialTask="visit"/></>:section==='withdrawals'?<Withdrawals admin={false}/>:section==='point-wallet'?<PointWallet admin={false}/>:section==='inventory'?<Inventory admin={false}/>:section==='purchases'?<Purchases/>:section==='reports'?<Reports admin={false}/>:section==='disputes'?<Disputes admin={false}/>:section==='operation-reviews'?<OperationReviews admin={false}/>:<Support/>}</>}
 </div><footer className="page-footer">GymBank · ShoTech Solutions</footer></main><nav className="trainee-navigation" aria-label="قائمة صاحب الجيم">{sections.map(item=><button key={item.id} className={active===item.id?'active':''} aria-current={active===item.id?'page':undefined} onClick={()=>navigate(item.id)}><item.icon size={22}/><span>{item.label}</span></button>)}</nav></div>;
}
function OwnerHome({gym,navigate}:{gym:Gym;navigate:(next:Destination)=>void}){
 const [stock,setStock]=useState<{available:string;branchesTotal:string;total:string}|null>(null),[stockError,setStockError]=useState(''),[finance,setFinance]=useState<{type:string;balancePiasters:string}[]|null>(null),[financeError,setFinanceError]=useState('');
 useEffect(()=>{let active=true;const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());api<typeof stock>(`gyms/${gym.id}/point-wallet`).then(r=>{if(active)setStock(r);}).catch(e=>{if(active)setStockError(message(e));});api<{currentBalances:typeof finance}>(`reports/summary?gymId=${gym.id}&from=${day}&to=${day}`).then(r=>{if(active)setFinance(r.currentBalances);}).catch(e=>{if(active)setFinanceError(message(e));});return()=>{active=false;};},[gym.id]);
 const available=finance?.find(a=>a.type==='GYM_AVAILABLE')?.balancePiasters;
 return <><section className="card wallet-signature"><p>رصيد صاحب الجيم</p><Notice text={stockError}/>{stock?<><h2 className="wallet-balance">{stock.available} <small>نقطة</small></h2><p className="muted">موزّع على الفروع {stock.branchesTotal} نقطة · إجمالي نقاطك {stock.total} نقطة</p><button className="primary full" onClick={()=>navigate('point-wallet')} aria-label="محفظتي وإرسال النقاط">بيع نقاط لمتدرب</button></>:!stockError?<Busy/>:null}<button className="text-button" onClick={()=>navigate('purchases')}>شراء نقاط لرصيد الجيم</button></section><h2>شغل الجيم</h2><section className="card portal-menu"><button onClick={()=>navigate('inventory')}><ArrowLeftRight/><span>إدارة النقاط<small>رصيدك، توزيع الفروع والتحويل بينها</small></span><ChevronLeft/></button><button onClick={()=>navigate('cashier')}><QrCode/><span>تسجيل زيارة<small>امسح رمز المتدرب وأكد حضوره</small></span><ChevronLeft/></button><button onClick={()=>navigate('gyms')}><Store/>الفروع والموظفين<ChevronLeft/></button><button onClick={()=>navigate('reports')}><FileChartColumn/>تقارير الجيم<ChevronLeft/></button></section><h2>فلوس زيارات الجيم</h2><section className="card"><Notice text={financeError}/><p className="muted">متاح للسحب</p>{available!==undefined?<h2>{decimal(available)} ج.م</h2>:!financeError?<Busy/>:null}<p className="muted">المستحقات بالجنيه منفصلة عن مخزون النقاط.</p><button className="text-button" onClick={()=>navigate('withdrawals')}>مستحقاتي والسحب<ChevronLeft size={18}/></button></section><button className="text-button" onClick={()=>navigate('disputes')}>حجوزات مستحقات الزيارات</button><button className="text-button" onClick={()=>navigate('operation-reviews')}>متابعة طلبات المراجعة</button></>;
}
