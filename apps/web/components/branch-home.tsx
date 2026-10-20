"use client";
import { useEffect, useState } from 'react';
import { History, ReceiptText, QrCode, Plus, ChevronLeft, ClipboardCheck } from 'lucide-react';
import { api, message, decimal } from '../lib/client';
import { ManagedBranches } from './managed-branch';
import { Busy, Notice } from './ui';
import { BranchFinance } from './branch-finance';
import { PortalNote } from './portal-ui';
type Branch = {
    id: string;
    gymId: string;
    name: string;
    gymName: string;
    canSell: boolean;
    canCancel: boolean;
    fullAccess?: boolean;
    permissions?: string[];
};
export type BranchDestination = 'visit' | 'sale' | 'visits' | 'sales' | 'reviews';
export function BranchHome({ branch, navigate }: {
    branch: Branch;
    navigate: (next: BranchDestination) => void;
}) {
    const [stock, setStock] = useState<{
        stock: number;
        visitPricePoints: number;
        sessionMinutes: number;
    } | null>(null), [report, setReport] = useState<{
        visits?: {
            count: number;
        };
        sales?: {
            points: number;
            amountPiasters: string;
        };
    } | null>(null), [stockError, setStockError] = useState(''), [reportError, setReportError] = useState('');
    useEffect(() => { let live = true; const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); api<typeof stock>(`operations/branches/${branch.id}/summary`).then(r => { if (live)
        setStock(r); }).catch(e => { if (live)
        setStockError(message(e)); }); api<typeof report>(`reports/summary?gymId=${branch.gymId}&branchId=${branch.id}&from=${day}&to=${day}`).then(r => { if (live)
        setReport(r); }).catch(e => { if (live)
        setReportError(message(e)); }); return () => { live = false; }; }, [branch.id, branch.gymId]);
    return <><BranchFinance key={branch.id} branch={branch}/><section className="card wallet-signature staff-stock"><p>رصيد الفرع لبيع النقاط</p><Notice text={stockError}/>{stock ? <><h2 className="wallet-balance">{stock.stock} نقطة</h2><p>الزيارة {stock.visitPricePoints} نقطة · {stock.sessionMinutes} دقيقة</p></> : !stockError ? <Busy /> : null}</section>{stock?.stock === 0 && <PortalNote>رصيد بيع النقاط خلص. اطلب من صاحب الجيم يوزّع نقاط للفرع. تسجيل الزيارات متاح من رصيد المتدرب.</PortalNote>}<h2>إجراء سريع</h2>{branch.canSell && <div className="staff-quick-actions"><button className="primary full" onClick={() => navigate('visit')}><QrCode size={20}/>تسجيل زيارة</button><button className="secondary full" disabled={!stock || stock.stock === 0} onClick={() => navigate('sale')}><Plus size={20}/>بيع نقاط لمتدرب</button></div>}<h2>حركة الفرع النهارده</h2><section className="card portal-facts"><Notice text={reportError}/>{report ? <><p><span>زيارات مسجلة</span><strong>{report.visits?.count ?? '—'}</strong></p><p><span>نقاط مباعة</span><strong>{report.sales?.points ?? '—'}</strong></p><p><span>تحصيل بيع النقاط</span><strong>{report.sales?.amountPiasters !== undefined ? decimal(report.sales.amountPiasters) : '—'} ج.م</strong></p></> : !reportError ? <Busy /> : null}</section><ManagedBranches selectedBranchId={branch.id}/><h2>متابعة الفرع</h2><section className="card portal-menu"><button onClick={() => navigate('visits')}><History />سجل الزيارات<ChevronLeft /></button><button onClick={() => navigate('sales')}><ReceiptText />سجل المبيعات<ChevronLeft /></button>{branch.canCancel && <p className="muted">إلغاء الزيارة متاح خلال أول ١٠ دقائق من سجل الزيارات. بعد كده يُرسل طلب مراجعة.</p>}</section><button className="text-button" onClick={() => navigate('reviews')}><ClipboardCheck size={18}/>طلبات المراجعة</button></>;
}
