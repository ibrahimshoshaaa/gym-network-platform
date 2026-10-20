"use client";
import { BranchHome } from './branch-home';
import { useEffect, useState } from 'react';
import { Home, History, ReceiptText, UserRound, QrCode, Plus, ChevronLeft, ClipboardCheck } from 'lucide-react';
import { api, message, decimal, type Identity } from '../lib/client';
import { PortalHeader } from './portal-header';
import { ScreenBack, PortalNote } from './portal-ui';
import { PortalAccount } from './portal-account';
import { BranchOperations, OperationHistory } from './operations';
import { ManagedBranches } from './managed-branch';
import { OperationReviews } from './operation-reviews';
import { Support } from './support';
import { Busy, Empty, Notice } from './ui';
type Branch = {
    id: string;
    gymId: string;
    name: string;
    gymName: string;
    canSell: boolean;
    canCancel: boolean;
};
type Section = 'home' | 'visits' | 'sales' | 'account' | 'visit' | 'sale' | 'reviews' | 'support';
const destinations = [{ id: 'home', label: 'الرئيسية', icon: Home }, { id: 'visits', label: 'الزيارات', icon: History }, { id: 'sales', label: 'المبيعات', icon: ReceiptText }, { id: 'account', label: 'حسابي', icon: UserRound }] as const;
export function StaffPortal({ user, logout, loggingOut, onPassword, error }: {
    user: Identity;
    logout: () => Promise<void>;
    loggingOut: boolean;
    onPassword: () => void;
    error: string;
}) {
    const [section, setSection] = useState<Section>('home'), [branches, setBranches] = useState<Branch[] | null>(null), [branchId, setBranchId] = useState(''), [loadError, setLoadError] = useState('');
    useEffect(() => { let live = true; api<{
        items: Branch[];
    }>('operations/branches').then(r => { if (live)
        setBranches(r.items); }).catch(e => { if (live)
        setLoadError(message(e)); }); return () => { live = false; }; }, []);
    function navigate(next: Section) { setSection(next); window.scrollTo({ top: 0, behavior: 'auto' }); }
    const branch = branches?.find(b => b.id === branchId) ?? branches?.[0], active = ['visit', 'sale', 'reviews'].includes(section) ? 'home' : section === 'support' ? 'account' : section;
    return <div className="trainee-portal mobile-mirror staff-mirror"><PortalHeader intro={!["account", "support", "reviews"].includes(section)} user={user} onNavigate={next => navigate(next === 'support' ? 'support' : 'reviews')}/><main className="trainee-content"><Notice text={error || loadError}/>
 {section === 'account' ? <PortalAccount user={user} onPassword={onPassword} onPurchases={() => navigate('sales')} onSupport={() => navigate('support')} logout={logout} loggingOut={loggingOut}/> : section === 'support' ? <Support /> : section === 'reviews' ? <OperationReviews admin={false}/> : !branches && !loadError ? <Busy /> : !branch ? <Empty title="مفيش فرع متاح للتشغيل">راجع صاحب الجيم لتفعيل الفرع وتعيين حسابك عليه.</Empty> : <>
 <div className="portal-welcome staff-intro"><small>{user.role === 'BRANCH_MANAGER' ? 'مدير الفرع' : 'كاشير الفرع'}</small>{branches!.length > 1 ? <label className="field">الفرع الحالي<select value={branch.id} onChange={e => { setBranchId(e.target.value); navigate('home'); }}>{branches!.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label> : <h1>{branch.name}</h1>}<p className="muted">{branch.gymName}</p></div>
 {section === 'home' ? <BranchHome key={branch.id} branch={branch} navigate={navigate}/> : section === 'visits' || section === 'sales' ? <OperationHistory key={`${branch.id}:${section}`} branchId={branch.id} canCancel={branch.canCancel} kind={section}/> : <><ScreenBack title={section === 'sale' ? 'شحن متدرب' : 'تسجيل زيارة'} onBack={() => navigate('home')}/><BranchOperations taskOnly key={`${branch.id}:${section}`} branch={branch} initialTask={section === 'sale' ? 'sale' : 'visit'}/></>}
 </>}
 </main><nav className="trainee-navigation" aria-label="قائمة موظف الفرع">{destinations.map(item => <button key={item.id} className={active === item.id ? 'active' : ''} aria-current={active === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon size={22}/><span>{item.label}</span></button>)}</nav></div>;
}
