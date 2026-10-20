"use client";
import {useState} from 'react';
import {UserRound,KeyRound,ReceiptText,Bell,LifeBuoy,LogOut,ChevronLeft} from 'lucide-react';
import type {Identity} from '../lib/client';
import {Profile} from './updates';
import {Busy} from './ui';
export function PortalAccount({user,onPassword,onPurchases,onSupport,logout,loggingOut}:{user:Identity;onPassword:()=>void;onPurchases:()=>void;onSupport:()=>void;logout:()=>Promise<void>;loggingOut:boolean}){
 const [profile,setProfile]=useState(false);
 return <div className="portal-account-page"><h1>حسابك</h1><p className="muted">بياناتك ونشاطك، في مكان واحد.</p><section className="card wallet-signature portal-profile-card"><span className="portal-avatar">{user.displayName.slice(0,1)}</span><div><h2>{user.displayName}</h2><p>{user.role==='GYM_OWNER'?'حساب صاحب الجيم':user.role==='BRANCH_MANAGER'?'حساب مدير مفوّض':'حساب المتدرب'}</p><p dir="ltr">{user.email}<br/>{user.phone}</p></div></section><h2>بياناتك والأمان</h2><section className="card portal-menu"><button onClick={()=>setProfile(true)}><UserRound/>تعديل الاسم<ChevronLeft/></button><button onClick={onPassword}><KeyRound/>كلمة السر والأمان<ChevronLeft/></button></section><h2>نشاطك والمساعدة</h2><section className="card portal-menu"><button onClick={onPurchases}><ReceiptText/>طلبات الشحن<ChevronLeft/></button><p className="muted portal-account-hint"><Bell size={18}/> إشعاراتك من علامة الجرس أعلى الصفحة</p><button onClick={onSupport}><LifeBuoy/>الدعم والمساعدة<ChevronLeft/></button></section><button className="primary full" disabled={loggingOut} onClick={()=>void logout()}>{loggingOut?<Busy/>:<><LogOut size={18}/>تسجيل الخروج</>}</button>{profile&&<Profile user={user} onClose={()=>setProfile(false)}/>}</div>;
}
