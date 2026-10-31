"use client";
import { useState } from "react";
import { RefreshCw, FileCheck2 } from "lucide-react";
import { useListTools } from "../list-tools";
import { date } from "../../lib/client";
import { Busy, Empty, Modal, Notice } from "../ui";
import {ReviewNote,DecisionButtons} from '../review-decision';
import { More, Mutation, Status, usePage, type Pricing, } from "./shared";
export function PriceReviews({ onOpenGym }: {
    onOpenGym?: (gymId: string) => void;
} = {}) {
    const list = usePage<Pricing>("admin/price-change-requests"), [selected, setSelected] = useState<Pricing | null>(null), [success, setSuccess] = useState(""), [decision,setDecision]=useState("APPROVED");
    const filtered = useListTools(list.rows, r => [r.id, r.branch?.gym.name, r.branch?.name, r.reason, String(r.visitPricePoints)].filter(Boolean).join(" "));
    return (<>
      <div className="section-toolbar">
        <p className="muted">
          افتح ملف الجيم لمراجعة بياناته واعتماد سعر الزيارة وتفعيل الفرع في نفس المكان.
        </p>
        <button className="secondary compact" disabled={list.loading} onClick={() => void list.refresh()}>
          <RefreshCw size={16}/>
          تحديث الطلبات
        </button>
      </div>
      <Notice text={list.error}/>
      <Notice text={success} success/>
      {filtered.controls}
      <section className="card table-card">
        <div className="table-heading">
          <h2>طلبات أسعار الزيارات</h2>
          <span className="badge pending">قيد المراجعة</span>
        </div>
        {list.loading && !list.rows.length ? (<div className="loading-block">
            <Busy />
          </div>) : !list.rows.length && !list.error ? (<Empty title="لا توجد طلبات أسعار معلقة">
            طلبات الفروع الجديدة وتغيير الأسعار ستظهر هنا.
          </Empty>) : (<div className="table-scroll">
            <table className="mobile-records">
              <thead>
                <tr>
                  <th>الجيم والفرع</th>
                  <th>سعر الزيارة</th>
                  <th>مدة الجلسة</th>
                  <th>حالة الجيم</th>
                  <th>القرار</th>
                </tr>
              </thead>
              <tbody>
                {filtered.visible.map((row) => (<tr key={row.id}>
                    <td data-label="الجيم والفرع">
                      <strong>{row.branch?.gym.name}</strong>
                      <small>{row.branch?.name}</small>
                    </td>
                    <td data-label="سعر الزيارة">
                      {row.visitPricePoints} نقطة
                      <small>
                        {row.baseVersion
                    ? `السابق: ${row.previousPricePoints}`
                    : "سعر أولي للفرع"}
                      </small>
                    </td>
                    <td data-label="مدة الجلسة">
                      {row.sessionMinutes} دقيقة
                      <small>
                        {row.baseVersion
                    ? `السابق: ${row.previousSessionMinutes}`
                    : "مدة مقترحة"}
                      </small>
                    </td>
                    <td data-label="حالة الجيم">
                      <Status value={row.branch?.gym.status ?? "PENDING"}/>
                    </td>
                    <td data-label="القرار">
                      <button className="text-button" onClick={() => {setSelected(row);setDecision("APPROVED");}}>
                        <FileCheck2 size={16}/>
                        مراجعة
                      </button>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>)}
        <More list={list}/>
      </section>
      {selected && (<Mutation<Pricing> title="مراجعة سعر الزيارة" path={`admin/price-change-requests/${selected.id}/review`} onClose={() => setSelected(null)} onDone={(result) => {
                setSelected(null);
                setSuccess(result.status === "APPROVED"
                    ? "تم اعتماد السعر. يمكنك تفعيل الفرع من إدارة الجيمات بعد اكتمال بياناته."
                    : "تم رفض طلب السعر، ولم يتغير السعر المعتمد سابقًا.");
                void list.refresh();
            }} build={(form) => ({
                decision,
                reason: form.get("reason"),
            })} label="تسجيل القرار">
          <div className="subtle-box price-proposal">
            <strong>
              {selected.branch?.gym.name} · {selected.branch?.name}
            </strong>
            <p>
              {selected.visitPricePoints} نقطة للزيارة ·{" "}
              {selected.sessionMinutes} دقيقة
            </p>
            <p>سبب الطلب: {selected.reason}</p>
          </div>
          {selected.branch?.gym.status !== "ACTIVE" && (<Notice text="الجيم غير نشط حاليًا. اعتماد السعر يحتاج تفعيل الجيم؛ رفض المقترح متاح دون تفعيل."/>)}
          <DecisionButtons value={decision} onChange={setDecision} approve="اعتماد السعر والمدة"/>
          <ReviewNote key={decision} preset={decision==='APPROVED'?'تمت مراجعة سعر الزيارة ومدتها والموافقة عليهما.':'سعر الزيارة أو مدتها يحتاج تعديلًا.'} choices={decision==='REJECTED'?['بيانات الفرع غير مكتملة.','السعر المقترح غير مناسب.']:[]}/>
          {selected.branch?.gymId&&onOpenGym&&<button type="button" className="text-button" onClick={()=>onOpenGym(selected.branch!.gymId!)}>فتح ملف الجيم والفروع</button>}

        </Mutation>)}
    </>);
}
export function PriceHistory({ path, onClose, }: {
    path: string;
    onClose: () => void;
}) {
    const list = usePage<Pricing>(path);
    return (<Modal title="سجل أسعار الزيارة" onClose={onClose}>
      <Notice text={list.error}/>
      {list.loading && !list.rows.length ? (<Busy />) : !list.rows.length && !list.error ? (<Empty title="لا توجد طلبات أسعار"/>) : (<div className="timeline">
          {list.rows.map((row) => (<article key={row.id}>
              <div className="section-toolbar">
                <strong>
                  {row.visitPricePoints} نقطة · {row.sessionMinutes} دقيقة
                </strong>
                <Status value={row.status}/>
              </div>
              <small>{date(row.createdAt)}</small>
              <p>{row.reason}</p>
              {row.reviewReason && (<p className="muted">ملاحظة المراجعة: {row.reviewReason}</p>)}
            </article>))}
        </div>)}
      <More list={list}/>
    </Modal>);
}
