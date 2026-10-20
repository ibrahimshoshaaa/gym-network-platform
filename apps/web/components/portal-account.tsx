"use client";
import { useState } from 'react';
import { UserRound, KeyRound, ReceiptText, LifeBuoy, LogOut, ChevronLeft } from 'lucide-react';
import type { Identity } from '../lib/client';
import { Profile, AccountTools } from './updates';
import { PortalIntro } from './portal-ui';
import { Busy } from './ui';
export function PortalAccount({ user, onPassword, onPurchases, onSupport, logout, loggingOut }: {
    user: Identity;
    onPassword: () => void;
    onPurchases: () => void;
    onSupport: () => void;
    logout: () => Promise<void>;
    loggingOut: boolean;
}) {
    const [profile, setProfile] = useState(false), trainee = user.role === 'TRAINEE', staff = user.role === 'CASHIER' || user.role === 'BRANCH_MANAGER';
    const role = trainee ? 'حساب المتدرب' : user.role === 'GYM_OWNER' ? 'صاحب جيم' : user.role === 'BRANCH_MANAGER' ? 'مدير فرع' : 'كاشير';
    return <div className={`portal-account-page${trainee ? ' native-trainee-account' : ' work-account'}`}><PortalIntro title="حسابك" detail={trainee ? 'بياناتك ونشاطك، في مكان واحد.' : 'بياناتك والأمان والدعم في مكان واحد.'}/><section className={`card native-profile${trainee ? ' wallet-signature' : ''}`}><div className="native-profile-top"><span className="portal-avatar">{user.displayName.trim().slice(0, 1) || '؟'}</span><div>{!trainee && <small>{role}</small>}<h2>{user.displayName}</h2>{trainee && <small>{role}</small>}</div></div><p dir="ltr">{user.email}<br />{user.phone}</p></section>
 {trainee && <h2>بياناتك والأمان</h2>}<section className="card portal-menu"><button onClick={() => setProfile(true)}><UserRound />تعديل الاسم<ChevronLeft /></button><button onClick={onPassword}><KeyRound />كلمة السر والأمان<ChevronLeft /></button>{!trainee && <>{!staff && <button onClick={onPurchases}><ReceiptText />طلبات الشحن<ChevronLeft /></button>}<AccountTools compact notificationLabel="الإشعارات" user={user} onNavigate={next => { if (next === 'support')
        onSupport();
    else
        onPurchases(); }}/><button onClick={onSupport}><LifeBuoy />الدعم والمساعدة<ChevronLeft /></button></>}</section>
 {trainee && <><h2>نشاطك والمساعدة</h2><section className="card portal-menu"><button onClick={onPurchases}><ReceiptText />طلبات الشحن<ChevronLeft /></button><AccountTools compact notificationLabel="الإشعارات" user={user} onNavigate={next => { if (next === 'support')
        onSupport();
    else
        onPurchases(); }}/><button onClick={onSupport}><LifeBuoy />الدعم والمساعدة<ChevronLeft /></button></section></>}
 <button className={`${trainee ? 'secondary native-logout' : 'primary'} full`} disabled={loggingOut} onClick={() => void logout()}>{loggingOut ? <Busy>جاري تسجيل الخروج…</Busy> : <><LogOut size={19}/>تسجيل الخروج</>}</button><p className="native-version">GYMBANK<br />ShoTech Solutions</p>{profile && <Profile user={user} onClose={() => setProfile(false)}/>}</div>;
}
