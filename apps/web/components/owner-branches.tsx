"use client";
import { useState } from "react";
import { Plus, ArrowLeftRight, QrCode, CreditCard, ChevronDown, Users } from "lucide-react";
import { api, send, date, message } from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
import { BranchFields, ContactFields, Invitation, More, Mutation, PriceFields, Status, branchBody, contact, roleText, usePage, type Gym, type Branch, type Staff, type NewInvite } from "./gyms/shared";
import { StaffDelegation } from "./staff-delegation";
import { Fact, PortalIntro, ScreenBack } from "./portal-ui";
import { NativeReport } from "./owner-inventory";
export function OwnerBranches({ gym, onOperate }: {
    gym: Gym;
    onOperate: (branch: Branch) => void;
}) {
    const list = usePage<Branch>(`gyms/${gym.id}/branches?limit=100`), [form, setForm] = useState<Branch | "new" | null>(null), [staff, setStaff] = useState<Branch | null>(null), [report, setReport] = useState<Branch | null>(null), [price, setPrice] = useState<Branch | null>(null);
    if (staff)
        return <OwnerStaff gym={gym} branch={staff} onBack={() => setStaff(null)}/>;
    if (report)
        return <><ScreenBack title={`حركة ${report.name}`} onBack={() => setReport(null)}/><NativeReport gymId={gym.id} branchId={report.id}/></>;
    return <><PortalIntro title={`فروع ${gym.name}`} trailing={<button className="native-add" aria-label="إضافة فرع" onClick={() => setForm("new")}><Plus /></button>}/><p className="muted native-branch-help">حدد مكان الفرع على الخريطة واقترح نقاط الزيارة ومدتها. الإدارة هتراجعهم قبل التفعيل.</p><Notice text={list.error}/>{list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="ضيف أول فرع ليك">اضغط + وكمّل بيانات الفرع والموقع.</Empty> : list.rows.map(b => <article className="card native-branch-card" key={b.id}><div className="section-toolbar"><h2><button className="text-button" disabled={b.status !== "ACTIVE" || gym.status !== "ACTIVE"} onClick={() => onOperate(b)}>{b.name}<ChevronDown size={18}/></button></h2><Status value={b.status}/></div><p className="muted">{b.address}</p><Fact label="الزيارة">{b.visitPricePoints} نقطة · {b.sessionMinutes} دقيقة</Fact>{!b.priceApprovedAt && <p className="native-green">الموقع وسعر الزيارة بانتظار اعتماد الإدارة.</p>}<div className="actions native-branch-actions"><button className="text-button" disabled={b.status !== "ACTIVE" || gym.status !== "ACTIVE"} onClick={() => onOperate(b)}><QrCode size={18}/>تشغيل الفرع</button></div><details className="native-disclosure"><summary>إدارة الفرع<ChevronDown size={20}/></summary><div className="actions"><button className="text-button" onClick={() => setForm(b)}>تعديل البيانات</button><button className="text-button" onClick={() => setStaff(b)}>الموظفين</button><button className="text-button" onClick={() => setReport(b)}>الحركة</button><button className="text-button" onClick={() => setPrice(b)}>طلب تغيير السعر</button></div></details></article>)}<More list={list}/>
 {form && <Mutation title={form === "new" ? "فرع جديد" : "تعديل الفرع"} path={`gyms/${gym.id}/branches${form === "new" ? "" : "/" + form.id}`} method={form === "new" ? "POST" : "PATCH"} onClose={() => setForm(null)} onDone={() => { setForm(null); void list.refresh(); }} build={f => branchBody(f, form !== "new")} label={form === "new" ? "إرسال الفرع للمراجعة" : "حفظ بيانات الفرع"}><BranchFields branch={form === "new" ? undefined : form}/></Mutation>}
 {price && <Mutation title="طلب تعديل السعر" path={`gyms/${gym.id}/branches/${price.id}/price-change-requests`} onClose={() => setPrice(null)} onDone={() => { setPrice(null); void list.refresh(); }} build={f => ({ visitPricePoints: Number(f.get("visitPricePoints")), sessionMinutes: Number(f.get("sessionMinutes")), reason: f.get("reason") })} label="إرسال للمراجعة"><PriceFields branch={price}/><Field label="سبب التعديل" name="reason" minLength={5} required/></Mutation>}
 </>;
}
function OwnerStaff({ gym, branch, onBack }: {
    gym: Gym;
    branch: Branch;
    onBack: () => void;
}) {
    const list = usePage<Staff>(`gyms/${gym.id}/staff?branchId=${branch.id}`), [invite, setInvite] = useState(false), [invitation, setInvitation] = useState<NewInvite | null>(null), [delegating, setDelegating] = useState<Staff | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
    async function toggle(s: Staff) { if (busy)
        return; setBusy(true); setError(""); try {
        await api(`gyms/${gym.id}/staff/${s.id}`, send({ active: !s.active }, "PATCH"));
        await list.refresh();
    }
    catch (e) {
        setError(message(e));
    }
    finally {
        setBusy(false);
    } }
    return <><ScreenBack title={`موظفين ${branch.name}`} onBack={onBack}/><button className="primary full" onClick={() => setInvite(true)}><Plus size={20}/>دعوة موظف</button><Notice text={error || list.error}/>{list.loading && !list.rows.length ? <Busy /> : !list.rows.length && !list.error ? <Empty title="لسه مفيش موظفين"/> : list.rows.map(s => <article key={s.id} className="card"><div className="section-toolbar"><h2>{s.user.displayName}</h2><span className={`badge ${s.active ? "approved" : "neutral"}`}>{s.active ? "نشط" : "موقوف"}</span></div><p className="native-green">{roleText(s.role)}</p><p className="muted" dir="ltr">{s.user.email}<br />{s.user.phoneE164}</p><button className="text-button" disabled={busy} onClick={() => void toggle(s)}>{s.active ? "إيقاف الصلاحية" : "تفعيل الصلاحية"}</button>{s.role === "BRANCH_MANAGER" && s.canDelegate && <button className="text-button" onClick={() => setDelegating(s)}>تفويض الصلاحيات</button>}</article>)}<More list={list}/>
 {invite && <Mutation<{
        invitation: NewInvite;
    }> title="دعوة موظف" path={`gyms/${gym.id}/staff-invitations`} onClose={() => setInvite(false)} onDone={r => { setInvite(false); setInvitation(r.invitation); void list.refresh(); }} build={f => ({ branchId: branch.id, role: f.get("role"), contact: contact(f) })} label="إنشاء الدعوة"><label className="field">الدور<select name="role"><option value="CASHIER">كاشير</option><option value="BRANCH_MANAGER">مدير فرع</option></select></label><ContactFields /></Mutation>}{invitation && <Invitation data={invitation} onClose={() => setInvitation(null)}/>} {delegating && <StaffDelegation gymId={gym.id} userId={delegating.user.id} branchId={branch.id} name={delegating.user.displayName} onClose={() => setDelegating(null)}/>}</>;
}
