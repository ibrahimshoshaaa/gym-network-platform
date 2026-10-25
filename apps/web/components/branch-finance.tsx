"use client";
import { useEffect, useState } from 'react';
import { api, decimal, message } from '../lib/client';
import { Busy, Notice } from './ui';
import { Fact, PortalNote } from './portal-ui';
type Branch = { id: string; gymId: string; fullAccess?: boolean; permissions?: string[] };
type Entitlement = { available: string; earned: string; committed: string; disputed: string; legacyReviewRequired: boolean };
type Report = { visits: {count: string}; cancellations: {count: string}; netVisitPoints: string; netVisitReceivablesPiasters: string };
type Details = { address: string; city: string; governorate: string; contactPhone?: string; openingHours?: string; status: string };
export function BranchFinance({branch}: {branch: Branch}) {
  const canFinance = branch.fullAccess === true || branch.permissions?.includes('REQUEST_WITHDRAWAL') === true;
  const [days, setDays] = useState(30), [revision, setRevision] = useState(0);
  const [finance, setFinance] = useState<Entitlement | null>(null), [report, setReport] = useState<Report | null>(null), [details, setDetails] = useState<Details | null>(null);
  const [financeError, setFinanceError] = useState(''), [reportError, setReportError] = useState(''), [detailsError, setDetailsError] = useState('');
  useEffect(() => {
    let live = true;
    setFinance(null); setDetails(null); setFinanceError(''); setDetailsError('');
    if (canFinance) {
      api<Entitlement>(`operations/branches/${branch.id}/entitlements`).then(r => {if(live)setFinance(r);}).catch(e => {if(live)setFinanceError(message(e));});
      api<Details>(`branches/${branch.id}/manage`).then(r => {if(live)setDetails(r);}).catch(e => {if(live)setDetailsError(message(e));});
    }
    return () => {live = false;};
  }, [branch.id, canFinance, revision]);
  useEffect(() => {
    let live = true;
    setReport(null); setReportError('');
    if (canFinance) {
      const format = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'});
      const today = format.format(new Date()), start = new Date(`${today}T12:00:00Z`);
      start.setUTCDate(start.getUTCDate() - days + 1);
      api<Report>(`reports/summary?gymId=${branch.gymId}&branchId=${branch.id}&from=${start.toISOString().slice(0,10)}&to=${today}`).then(r => {if(live)setReport(r);}).catch(e => {if(live)setReportError(message(e));});
    }
    return () => {live = false;};
  }, [branch.id, branch.gymId, canFinance, days, revision]);
  if (!canFinance) return null;
  return <>
    <div className="section-toolbar"><h2>مستحقات الفرع</h2><button className="text-button" onClick={() => setRevision(v => v + 1)}>تحديث</button></div>
    <section className="card owner-cash-card"><Notice text={financeError}/>{finance ? <>
      <Fact label="متاح للسحب من الفرع" strong>{decimal(finance.available)} ج.م</Fact>
      <Fact label="إجمالي عائد الزيارات المؤكدة">{decimal(finance.earned)} ج.م</Fact>
      <Fact label="مسحوب أو مرتبط بطلبات سحب">{decimal(finance.committed)} ج.م</Fact>
      <Fact label="محجوز للمراجعة">{decimal(finance.disputed)} ج.م</Fact>
      {finance.legacyReviewRequired && <PortalNote>فيه سحوبات قديمة غير موزعة على الفروع؛ المتاح محسوب بتحفّظ لحين مراجعتها.</PortalNote>}
    </> : !financeError ? <Busy/> : null}<p className="muted">مستحقات الفرع الحالية من كل الفترات. المتاح للسحب يخضع لرصيد الجيم.</p></section>
    <h2>ملخص الزيارات</h2><label className="field">الفترة<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={1}>اليوم</option><option value={30}>آخر ٣٠ يوم</option></select></label>
    <section className="card portal-facts"><Notice text={reportError}/>{report ? <>
      <Fact label="زيارات مسجلة">{report.visits.count}</Fact><Fact label="زيارات ملغاة خلال الفترة">{report.cancellations.count}</Fact>
      <Fact label="صافي نقاط الزيارات">{report.netVisitPoints} نقطة</Fact><Fact label="صافي عائد الزيارات خلال الفترة">{decimal(report.netVisitReceivablesPiasters)} ج.م</Fact>
    </> : !reportError ? <Busy/> : null}<p className="muted">الصافي = الزيارات المسجلة خلال الفترة ناقص الإلغاءات المنفذة خلالها.</p></section>
    <h2>بيانات الفرع</h2><section className="card portal-facts"><Notice text={detailsError}/>{details ? <>
      <Fact label="العنوان">{details.address}</Fact><Fact label="المنطقة">{details.city} · {details.governorate}</Fact>
      <Fact label="الهاتف">{details.contactPhone || 'غير محدد'}</Fact><Fact label="مواعيد العمل">{details.openingHours || 'غير محددة'}</Fact>
    </> : !detailsError ? <Busy/> : null}</section>
  </>;
}
