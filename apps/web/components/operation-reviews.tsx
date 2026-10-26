"use client";
import { RecordReference } from "./record-reference";
import { useEffect, useState, type FormEvent } from "react";
import { api, message, decimal, date } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { useListTools } from "./list-tools";
import { More, Status, usePage } from "./gyms/shared";
type Kind = "VISIT_CANCEL";
type Review = {
    id: string;
    kind: Kind;
    targetId: string;
    branchId: string;
    reason: string;
    evidenceText: string;
    evidenceId: string | null;
    status: string;
    reviewReason: string | null;
    reviewedAt: string | null;
    createdAt: string;
};
const kindName = (kind: Kind) => "إلغاء زيارة";
export function OperationReviews({ admin }: {
    admin: boolean;
}) {
    const list = usePage<Review>("admin/operation-reviews"), [selected, setSelected] = useState<string | null>(null);
    const filtered = useListTools(list.rows, r => [r.id, r.targetId, r.reason, r.evidenceText, kindName(r.kind)].join(" "), r => r.status, { PENDING: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض" });
    return (<>
      <div className="section-toolbar">
        <p className="muted">
          {"راجع السبب والأدلة وتأثير الإلغاء قبل اتخاذ القرار."}
        </p>
        {false}
        <button className="secondary compact" disabled={list.loading} onClick={() => void list.refresh()}>
          تحديث
        </button>
      </div>
      <Notice text={list.error}/>
      {filtered.controls}
      <section className="card">
        {list.loading && !list.rows.length ? (<Busy />) : !list.rows.length ? (<Empty title="لا توجد طلبات مراجعة"/>) : (<div className="timeline">
            {filtered.visible.map((r) => (<article key={r.id}>
                <div className="section-toolbar">
                  <strong>{kindName(r.kind)}</strong>
                  <Status value={r.status}/>
                </div>
                <p>{r.reason}</p>
                <p>{r.evidenceText}</p>
                <small>
                  العملية: {r.targetId} · {date(r.createdAt)}
                </small>
                {r.reviewReason && (<p className="subtle-box">
                    قرار الإدارة: {r.reviewReason}
                    {r.reviewedAt && ` · ${date(r.reviewedAt)}`}
                  </p>)}
                {(<button className="secondary compact" onClick={() => setSelected(r.id)}>
                    {r.status === "PENDING" ? "مراجعة واتخاذ قرار" : "عرض القرار والأدلة"}
                  </button>)}
              </article>))}
          </div>)}
        <More list={list}/>
      </section>
      {selected && (<ReviewDetail id={selected} onClose={() => {
                setSelected(null);
                void list.refresh();
            }}/>)}
    </>);
}
function ReviewDetail({ id, onClose }: {
    id: string;
    onClose: () => void;
}) {
    const [detail, setDetail] = useState<{
        review: Review;
        branchName: string;
        gymName: string;
        target: {
            pointsCharged?: number;
            points?: number;
            settlementPiasters?: string;
            chargePiasters?: string;
            status?: string;
            startedAt?: string;
            createdAt?: string;
        };
    } | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
    const { call, uncertain } = useCommand();
    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        setDetail(null);
        setReceipt("");
        api<NonNullable<typeof detail>>(`admin/operation-reviews/${id}`)
            .then((r) => {
            if (active)
                setDetail(r);
        })
            .catch((e) => {
            if (active)
                setError(message(e));
        })
            .finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [id]);
    async function showEvidence() {
        if (!detail?.review.evidenceId)
            return;
        setBusy(true);
        setError("");
        try {
            const r = await api<{
                url: string;
            }>(`receipts/${detail.review.evidenceId}/access`);
            setReceipt(r.url);
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (busy)
            return;
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
            await call(`admin/operation-reviews/${id}/review`, {
                decision: f.get("decision"),
                reason: f.get("reason"),
            });
            onClose();
        }
        catch (e) {
            setError(message(e));
        }
        finally {
            setBusy(false);
        }
    }
    return (<Modal title="مراجعة الإلغاء والتصحيح" onClose={onClose} locked={busy || uncertain}>
      <Notice text={error}/>
      {loading ? (<Busy />) : (detail && (<>
            <h3>
              {detail.gymName} · {detail.branchName}
            </h3>
            <Status value={detail.review.status}/>
            <p>{detail.review.reason}</p>
            <p>{detail.review.evidenceText}</p>
            <small>العملية: {detail.review.targetId}</small>
            <div className="subtle-box">
              <p>
                النقاط: {detail.target.pointsCharged ?? detail.target.points}
              </p>
              <p>
                القيمة:{" "}
                {decimal(detail.target.settlementPiasters ??
                detail.target.chargePiasters ??
                "0")}{" "}
                ج.م
              </p>
              <p>
                {detail.target.status ?? "بيع مسجل"} ·{" "}
                {date((detail.target.startedAt ?? detail.target.createdAt)!)}
              </p>
            </div>
            {detail.review.evidenceId && (<button className="secondary compact" onClick={() => void showEvidence()} disabled={busy}>
                عرض الصورة الداعمة
              </button>)}
            {receipt && (<img className="receipt-image" src={receipt} alt="الدليل المرفق بطلب المراجعة" onError={() => {
                    setReceipt("");
                    setError("تعذر عرض الصورة. أعد طلبها.");
                }}/>)}
            {detail.review.status === "PENDING" ? (<form onSubmit={submit}>
                <fieldset disabled={busy}>
                  <label className="field">
                    القرار
                    <select name="decision" disabled={uncertain}>
                      <option value="REJECT">رفض الطلب</option>
                      {detail.review.kind === "VISIT_CANCEL" && (<option value="APPROVE">
                          قبول الإلغاء ورد النقاط وعكس المستحق
                        </option>)}
                    </select>
                  </label>
                  <Field name="reason" label="سبب القرار" readOnly={uncertain} required minLength={5} maxLength={1000}/>
                  <label className="check">
                    <input type="checkbox" required disabled={uncertain}/>
                    راجعت العملية والسبب والأدلة وتأثير القرار
                  </label>
                  <button className="primary full">
                    {busy ? (<Busy />) : uncertain ? ("إعادة نفس القرار") : ("تسجيل القرار")}
                  </button>
                </fieldset>
              </form>) : (<p>{detail.review.reviewReason}</p>)}
          </>))}
    </Modal>);
}
