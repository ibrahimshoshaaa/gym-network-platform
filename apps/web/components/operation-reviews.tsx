"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, message, decimal, date } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { More, Status, usePage } from "./gyms/shared";
type Kind = "VISIT_CANCEL" | "SALE_CORRECTION";
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
const kindName = (kind: Kind) =>
  kind === "VISIT_CANCEL" ? "إلغاء زيارة" : "تصحيح بيع نقاط";
export function RequestAction({
  kind,
  targetId,
  onDone,
}: {
  kind?: Kind;
  targetId?: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="secondary compact" onClick={() => setOpen(true)}>
        {kind ? `طلب مراجعة: ${kindName(kind)}` : "طلب مراجعة جديد"}
      </button>
      {open && (
        <RequestForm
          kind={kind}
          targetId={targetId}
          onClose={() => setOpen(false)}
          onDone={onDone}
        />
      )}
    </>
  );
}
function RequestForm({
  kind,
  targetId,
  onClose,
  onDone,
}: {
  kind?: Kind;
  targetId?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [evidenceId, setEvidenceId] = useState(""),
    [fileName, setFileName] = useState(""),
    [result, setResult] = useState<Review | null>(null);
  const { call, uncertain } = useCommand();
  async function upload(file?: File) {
    if (!file || busy || uncertain) return;
    setUploading(true);
    setError("");
    setEvidenceId("");
    setFileName("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5242880
      )
        throw new Error("ارفع صورة JPG أو PNG أو WebP لا تتجاوز ٥ ميجابايت.");
      const r = await api<{ id: string }>("receipts", {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      setEvidenceId(r.id);
      setFileName(file.name);
    } catch (e) {
      setError(message(e));
    } finally {
      setUploading(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const row = await call<Review>("operation-reviews", {
        kind: kind ?? f.get("kind"),
        targetId: targetId ?? f.get("target"),
        reason: f.get("reason"),
        evidenceText: f.get("evidence"),
        ...(evidenceId ? { evidenceId } : {}),
      });
      setResult(row);
      onDone?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="طلب مراجعة عملية"
      onClose={onClose}
      locked={busy || uploading || uncertain}
    >
      <Notice text={error} />
      {result ? (
        <>
          <Notice
            success
            text={`تم تسجيل الطلب: ${result.id}. تابع النتيجة من الإلغاء والتصحيح.`}
          />
          <button className="primary full" onClick={onClose}>
            تم
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy || uploading}>
            {kind ? (
              <p>
                {kindName(kind)} · {targetId}
              </p>
            ) : (
              <>
                <label className="field">
                  نوع العملية
                  <select name="kind" disabled={uncertain}>
                    <option value="VISIT_CANCEL">إلغاء زيارة</option>
                    <option value="SALE_CORRECTION">تصحيح بيع نقاط</option>
                  </select>
                </label>
                <Field
                  label="مرجع الزيارة أو البيع"
                  name="target"
                  required
                  maxLength={36}
                  readOnly={uncertain}
                  dir="ltr"
                />
              </>
            )}
            <Field
              label="سبب الطلب"
              name="reason"
              required
              minLength={5}
              maxLength={1000}
              readOnly={uncertain}
            />
            <Field
              label="تفاصيل الواقعة والأدلة المتاحة"
              name="evidence"
              required
              minLength={10}
              maxLength={2000}
              readOnly={uncertain}
            />
            <Field
              label="صورة داعمة (اختياري)"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uncertain}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            {uploading && <Busy>جاري رفع الصورة</Busy>}
            {fileName && <p>{fileName}</p>}
            <p className="subtle-box">
              تسجيل الطلب لا يغيّر الرصيد. تصحيح البيع يحتاج تحديد مسؤولية رد
              الفلوس قبل اعتماده.
            </p>
            {uncertain && (
              <p role="alert">نتيجة الطلب غير مؤكدة. أعد نفس الطلب بأمان.</p>
            )}
            <button className="primary full">
              {busy ? (
                <Busy />
              ) : uncertain ? (
                "إعادة نفس الطلب"
              ) : (
                "إرسال للمراجعة"
              )}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
type VisitImpact = {
  pointsCharged: number;
  settlementPiasters: string;
  startedAt: string;
};
export function VisitCancelAction({
  branchId,
  visitId,
  impact,
  onDone,
}: {
  branchId: string;
  visitId: string;
  impact: VisitImpact;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="secondary compact" onClick={() => setOpen(true)}>
        إلغاء خلال أول ١٠ دقائق
      </button>
      {open && (
        <CancelForm
          branchId={branchId}
          visitId={visitId}
          impact={impact}
          onDone={onDone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
function CancelForm({
  branchId,
  visitId,
  impact,
  onDone,
  onClose,
}: {
  branchId: string;
  visitId: string;
  impact: VisitImpact;
  onDone: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  const { call, uncertain } = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await call(`operations/branches/${branchId}/visits/${visitId}/cancel`, {
        reason: f.get("reason"),
      });
      setDone(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="إلغاء زيارة موثق"
      onClose={() => {
        if (done) onDone();
        onClose();
      }}
      locked={busy || uncertain}
    >
      <Notice text={error} />
      {done ? (
        <>
          <Notice
            success
            text="تم إلغاء الزيارة ورد النقاط وعكس مستحق الجيم بقيد موثق."
          />
          <button
            className="primary full"
            onClick={() => {
              onDone();
              onClose();
            }}
          >
            تم
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <p>المرجع: {visitId}</p>
            <div className="subtle-box">
              <p>رد {impact.pointsCharged} نقطة للمتدرب</p>
              <p>عكس مستحق الجيم: {decimal(impact.settlementPiasters)} ج.م</p>
              <p>بداية الزيارة: {date(impact.startedAt)}</p>
            </div>
            <p className="subtle-box">
              صلاحية الإلغاء المباشر لمدير الفرع خلال ١٠ دقائق. لا تتجدد صلاحية
              المحفظة، وأي تسوية مالية سابقة تحتاج مراجعة.
            </p>
            <Field
              name="reason"
              label="سبب الإلغاء"
              required
              minLength={5}
              maxLength={1000}
              readOnly={uncertain}
            />
            <label className="check">
              <input type="checkbox" required disabled={uncertain} />
              راجعت الزيارة وأؤكد إلغاءها ورد نقاطها
            </label>
            <button className="primary full">
              {busy ? (
                <Busy />
              ) : uncertain ? (
                "إعادة نفس الإلغاء"
              ) : (
                "تأكيد إلغاء الزيارة"
              )}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
export function OperationReviews({ admin }: { admin: boolean }) {
  const list = usePage<Review>(
      admin ? "admin/operation-reviews" : "operation-reviews",
    ),
    [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          {admin
            ? "راجع السبب والأدلة وتأثير الإلغاء قبل اتخاذ القرار."
            : "طلباتك وقرارات الإدارة. لا يُخصم أو يُرد رصيد بمجرد إرسال الطلب."}
        </p>
        {!admin && <RequestAction onDone={() => void list.refresh()} />}
        <button
          className="secondary compact"
          disabled={list.loading}
          onClick={() => void list.refresh()}
        >
          تحديث
        </button>
      </div>
      <Notice text={list.error} />
      <section className="card">
        {list.loading && !list.rows.length ? (
          <Busy />
        ) : !list.rows.length ? (
          <Empty title="لا توجد طلبات مراجعة" />
        ) : (
          <div className="timeline">
            {list.rows.map((r) => (
              <article key={r.id}>
                <div className="section-toolbar">
                  <strong>{kindName(r.kind)}</strong>
                  <Status value={r.status} />
                </div>
                <p>{r.reason}</p>
                <p>{r.evidenceText}</p>
                <small>
                  العملية: {r.targetId} · {date(r.createdAt)}
                </small>
                {r.reviewReason && (
                  <p className="subtle-box">
                    قرار الإدارة: {r.reviewReason}
                    {r.reviewedAt && ` · ${date(r.reviewedAt)}`}
                  </p>
                )}
                {admin && (
                  <button
                    className="secondary compact"
                    onClick={() => setSelected(r.id)}
                  >
                    عرض العملية والأدلة
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        <More list={list} />
      </section>
      {selected && (
        <ReviewDetail
          id={selected}
          onClose={() => {
            setSelected(null);
            void list.refresh();
          }}
        />
      )}
    </>
  );
}
function ReviewDetail({ id, onClose }: { id: string; onClose: () => void }) {
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
    } | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const { call, uncertain } = useCommand();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDetail(null);
    setReceipt("");
    api<NonNullable<typeof detail>>(`admin/operation-reviews/${id}`)
      .then((r) => {
        if (active) setDetail(r);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function showEvidence() {
    if (!detail?.review.evidenceId) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(
        `receipts/${detail.review.evidenceId}/access`,
      );
      setReceipt(r.url);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await call(`admin/operation-reviews/${id}/review`, {
        decision: f.get("decision"),
        reason: f.get("reason"),
      });
      onClose();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="مراجعة الإلغاء والتصحيح"
      onClose={onClose}
      locked={busy || uncertain}
    >
      <Notice text={error} />
      {loading ? (
        <Busy />
      ) : (
        detail && (
          <>
            <h3>
              {detail.gymName} · {detail.branchName}
            </h3>
            <Status value={detail.review.status} />
            <p>{detail.review.reason}</p>
            <p>{detail.review.evidenceText}</p>
            <small>العملية: {detail.review.targetId}</small>
            <div className="subtle-box">
              <p>
                النقاط: {detail.target.pointsCharged ?? detail.target.points}
              </p>
              <p>
                القيمة:{" "}
                {decimal(
                  detail.target.settlementPiasters ??
                    detail.target.chargePiasters ??
                    "0",
                )}{" "}
                ج.م
              </p>
              <p>
                {detail.target.status ?? "بيع مسجل"} ·{" "}
                {date((detail.target.startedAt ?? detail.target.createdAt)!)}
              </p>
            </div>
            {detail.review.evidenceId && (
              <button
                className="secondary compact"
                onClick={() => void showEvidence()}
                disabled={busy}
              >
                عرض الصورة الداعمة
              </button>
            )}
            {receipt && (
              <img
                className="receipt-image"
                src={receipt}
                alt="الدليل المرفق بطلب المراجعة"
                onError={() => {
                  setReceipt("");
                  setError("تعذر عرض الصورة. أعد طلبها.");
                }}
              />
            )}
            {detail.review.kind === "SALE_CORRECTION" && (
              <p className="subtle-box">
                اعتماد تصحيح البيع متوقف لحين تحديد مسؤولية رد الفلوس. الطلب لا
                يرد فلوسًا أو نقاطًا تلقائيًا.
              </p>
            )}
            {detail.review.status === "PENDING" ? (
              <form onSubmit={submit}>
                <fieldset disabled={busy}>
                  <label className="field">
                    القرار
                    <select name="decision" disabled={uncertain}>
                      <option value="REJECT">رفض الطلب</option>
                      {detail.review.kind === "VISIT_CANCEL" && (
                        <option value="APPROVE">
                          قبول الإلغاء ورد النقاط وعكس المستحق
                        </option>
                      )}
                    </select>
                  </label>
                  <Field
                    name="reason"
                    label="سبب القرار"
                    readOnly={uncertain}
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                  <label className="check">
                    <input type="checkbox" required disabled={uncertain} />
                    راجعت العملية والسبب والأدلة وتأثير القرار
                  </label>
                  <button className="primary full">
                    {busy ? (
                      <Busy />
                    ) : uncertain ? (
                      "إعادة نفس القرار"
                    ) : (
                      "تسجيل القرار"
                    )}
                  </button>
                </fieldset>
              </form>
            ) : (
              <p>{detail.review.reviewReason}</p>
            )}
          </>
        )
      )}
    </Modal>
  );
}
