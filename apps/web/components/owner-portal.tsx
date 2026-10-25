"use client";
import {useEffect,useState} from 'react';
import {LayoutDashboard,Store,QrCode,Wallet,UserRound,ChevronLeft,FileChartColumn} from 'lucide-react';
import {api,message,decimal,type Identity} from '../lib/client';
import {PortalHeader} from './portal-header';
import {PortalAccount} from './portal-account';
import {usePage,type Gym,More} from './gyms/shared';
import {Busy,Empty,Notice} from './ui';
import {OwnerBranches} from './owner-branches';
import {NativeReport,reportRange} from './owner-inventory';
import {Fact,PortalNote,ScreenBack} from './portal-ui';
import {Cashier} from './operations';
import {Withdrawals} from './withdrawals';
import {OperationReviews} from './operation-reviews';
import {Disputes} from './disputes';
import {Support} from './support';
import {CampaignBanner} from './campaign-banner';
const sections=[{id:'home',label:'الرئيسية',icon:LayoutDashboard},{id:'gyms',label:'الفروع',icon:Store},{id:'cashier',label:'التشغيل',icon:QrCode},{id:'withdrawals',label:'مستحقاتي',icon:Wallet},{id:'account',label:'حسابي',icon:UserRound}] as const;
type Destination=typeof sections[number]['id']|'reports'|'operation-reviews'|'support'|'disputes';
export function OwnerPortal({user,logout,loggingOut,onPassword,error}:{user:Identity;logout:()=>Promise<void>;loggingOut:boolean;onPassword:()=>void;error:string}){
 const [section,setSection]=useState<Destination>('home'),[gymId,setGymId]=useState(''),[branch,setBranch]=useState<string>();
 const gyms=usePage<Gym>('gyms'),selected=gyms.rows.find(g=>g.id===gymId)??gyms.rows[0];
 function navigate(next:Destination){setSection(next);window.scrollTo({top:0,behavior:'auto'});}
 function destination(next:string){if(['home','gyms','cashier','withdrawals','account','reports','operation-reviews','support','disputes'].includes(next))navigate(next as Destination);}
 const active=section==='reports'?'home':section==='disputes'?'withdrawals':section==='operation-reviews'?'cashier':section==='support'?'account':section;
 return <div className="trainee-portal mobile-mirror owner-mirror"><PortalHeader intro={section==='home'} user={user} onNavigate={destination}/><main className="trainee-content"><Notice text={error}/><div key={section}>
 {section==='home'?<><CampaignBanner placement="HOME" onNavigate={destination}/><Notice text={gyms.error}/>{gyms.rows.length>1&&<label className="field">الجيم الحالي<select value={selected?.id??''} onChange={e=>setGymId(e.target.value)}>{gyms.rows.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}<More list={gyms}/>{selected?<OwnerHome key={selected.id} gym={selected} navigate={navigate}/>:gyms.loading?<Busy/>:<Empty title="مفيش جيم مرتبط بحسابك"/>}</>
 :section==='account'?<PortalAccount user={user} logout={logout} loggingOut={loggingOut} onPassword={onPassword} onPurchases={()=>navigate('reports')} onSupport={()=>navigate('support')}/>
 :<><ScreenBack title={section==='reports'?'تقارير الزيارات':'رجوع'} onBack={()=>navigate('home')}/>{section==='gyms'?selected?<OwnerBranches gym={selected} onOperate={b=>{setBranch(b.id);navigate('cashier');}}/>:<Empty title="مفيش جيم مرتبط بحسابك"/>:section==='cashier'?<Cashier gymId={selected?.id} initialBranchId={branch}/>:section==='withdrawals'?<Withdrawals admin={false} initialGymId={selected?.id}/>:section==='reports'?selected?<NativeReport gymId={selected.id}/>:null:section==='disputes'?<Disputes admin={false}/>:section==='operation-reviews'?<OperationReviews admin={false}/>:<Support/>}</>}
 </div><footer className="page-footer">GymBank · ShoTech Solutions</footer></main><nav className="trainee-navigation" aria-label="قائمة صاحب الجيم">{sections.map(item=><button key={item.id} className={active===item.id?'active':''} aria-current={active===item.id?'page':undefined} onClick={()=>{if(item.id==='cashier')setBranch(undefined);navigate(item.id);}}><item.icon size={22}/><span>{item.label}</span></button>)}</nav></div>;
}
function OwnerHome({gym,navigate}:{gym:Gym;navigate:(next:Destination)=>void}){
 const [balances,setBalances]=useState<{type:string;balancePiasters:string}[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;api<{currentBalances:typeof balances}>(`reports/summary?gymId=${gym.id}&${reportRange()}`).then(r=>{if(live)setBalances(r.currentBalances);}).catch(e=>{if(live)setError(message(e));});return()=>{live=false;};},[gym.id]);
 const balance=(type:string)=>balances?.find(b=>b.type===type)?.balancePiasters??'0';
 return <>{gym.status!=='ACTIVE'&&<PortalNote>الجيم غير نشط حاليًا. تقدر تراجع بياناته، والتشغيل متاح بعد التفعيل.</PortalNote>}<section className="card wallet-signature"><p>مستحقات زيارات {gym.name}</p><Notice text={error}/>{balances?<h2 className="wallet-balance">{decimal(balance('GYM_AVAILABLE'))} <small>ج.م</small></h2>:!error&&<Busy/>}<button className="primary full" onClick={()=>navigate('withdrawals')}>مستحقاتي والسحب<Wallet size={20}/></button><p className="muted">بيع وشحن نقاط المتدرب يتم من صاحب المنصة فقط.</p></section><h2>شغل الجيم</h2><section className="card portal-menu"><button onClick={()=>navigate('cashier')}><QrCode/>تسجيل زيارة<ChevronLeft/></button><button onClick={()=>navigate('gyms')}><Store/>الفروع والموظفين<ChevronLeft/></button><button onClick={()=>navigate('reports')}><FileChartColumn/>تقارير الزيارات والتسويات<ChevronLeft/></button></section>{balances&&<section className="card"><Fact label="محجوز لطلبات السحب">{decimal(balance('GYM_RESERVED'))} ج.م</Fact><Fact label="محجوز للمراجعة">{decimal(balance('GYM_DISPUTED'))} ج.م</Fact></section>}<button className="text-button" onClick={()=>navigate('disputes')}>حجوزات مستحقات الزيارات</button><button className="text-button" onClick={()=>navigate('operation-reviews')}>متابعة طلبات المراجعة</button></>;
}
