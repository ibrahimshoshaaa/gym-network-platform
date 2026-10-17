"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  RefreshCw,
  Eye,
  FileCheck2,
  ArrowDownLeft,
  Clock3,
} from "lucide-react";
import {
  api,
  send,
  message,
  decimal,
  minorUnits,
  methodName,
  date,
  type Page,
  type Topup,
} from "../lib/client";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
export function Reviews() {
  const [rows, setRows] = useState<Topup[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [selected, setSelected] = useState<Topup | null>(null);
  async function load(next?: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api<Page<Topup>>(
        `admin/topups?limit=25${next ? `&cursor=${next}` : ""}`,
      );
      setRows((old) => (next ? [...old, ...result.items] : result.items));
      setCursor(result.nextCursor);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api<Page<Topup>>("admin/topups?limit=25")
      .then((result) => {
        if (active) {
          setRows(result.items);
          setCursor(result.nextCursor);
        }
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
  }, []);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          راجع الإيصال وتأكد من وصول المبلغ قبل إضافة النقاط.
        </p>
        <button
          className="secondary compact"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          تحديث الطلبات
        </button>
      </div>
      <Notice text={error} />
      <Notice text={success} success />
      <div className="metrics">
        <article>
          <span className="metric-icon">
            <Clock3 size={22} />
          </span>
          <div>
            <p>طلبات محملة للمراجعة</p>
            <strong>{rows.length}</strong>
            <small>
              {cursor
                ? "توجد طلبات أخرى بالصفحة التالية"
                : "في القائمة الحالية"}
            </small>
          </div>
        </article>
        <article>
          <span className="metric-icon purple">
            <FileCheck2 size={22} />
          </span>
          <div>
            <p>مراجعة واضحة لكل طلب</p>
            <h3>الإيصال + التحويل الفعلي</h3>
            <small>الصورة وحدها لا تؤكد وصول المبلغ</small>
          </div>
        </article>
      </div>
      <section className="card table-card">
        <div className="table-heading">
          <h2>طلبات الشحن المعلقة</h2>
          <span className="badge pending">بانتظار المراجعة</span>
        </div>
        {loading && !rows.length ? (
          <div className="loading-block">
            <Busy />
          </div>
        ) : !rows.length ? (
          <Empty title="كل الطلبات تمت مراجعتها">
            أي طلب شحن جديد هيظهر هنا.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>صاحب الطلب</th>
                  <th>نوع الشحن</th>
                  <th>النقاط</th>
                  <th>قيمة التحويل</th>
                  <th>التاريخ</th>
                  <th>المراجعة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {row.requestor?.displayName ?? "صاحب الطلب"}
                      </strong>
                      <small dir="ltr">
                        {row.requestor?.phoneE164 ?? row.requestorUserId}
                      </small>
                    </td>
                    <td>
                      {row.kind === "TRAINEE" ? "محفظة متدرب" : "مخزون فرع"}
                      {row.branch && (
                        <small>
                          {row.branch.gym.name} · {row.branch.name}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="points-pill">{row.points} نقطة</span>
                    </td>
                    <td>
                      <strong>{decimal(row.chargePiasters)} ج.م</strong>
                      <small>{methodName(row.paymentMethod)}</small>
                    </td>
                    <td className="date-cell">{date(row.createdAt)}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => {
                          setSelected(row);
                          setSuccess("");
                        }}
                      >
                        <Eye size={16} />
                        عرض الطلب
                        <ArrowDownLeft size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div className="load-more">
            <button
              className="secondary"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              {loading ? <Busy /> : "تحميل طلبات إضافية"}
            </button>
          </div>
        )}
      </section>
      {selected && (
        <Review
          key={selected.id}
          request={selected}
          onClose={() => setSelected(null)}
          onDone={(decision) => {
            setRows((rows) => rows.filter((row) => row.id !== selected.id));
            setSelected(null);
            setSuccess(
              decision === "APPROVED"
                ? "تم اعتماد الطلب وإضافة النقاط مرة واحدة."
                : "تم رفض الطلب بدون إضافة نقاط.",
            );
          }}
        />
      )}
    </>
  );
}
function Review({
  request: row,
  onClose,
  onDone,
}: {
  request: Topup;
  onClose: () => void;
  onDone: (decision: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false),
    [receipt, setReceipt] = useState(""),
    [decision, setDecision] = useState(""),
    [receiptError, setReceiptError] = useState("");
  async function read() {
    setReading(true);
    setReceiptError("");
    try {
      const result = await api<{ url: string }>(
        `receipts/${row.receiptId}/access`,
      );
      setReceipt(result.url);
    } catch (e) {
      setReceiptError(message(e));
    } finally {
      setReading(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const body =
        decision === "REJECTED"
          ? { decision, reason: form.get("reason") }
          : {
              decision,
              reason: form.get("reason"),
              paymentReference: form.get("reference"),
              receivedAmountPiasters: minorUnits(String(form.get("amount"))),
              fundsReceived: form.get("funds") === "on",
              receiptReviewed: form.get("receipt") === "on",
            };
      await api(`admin/topups/${row.id}/review`, send(body));
      onDone(decision);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="مراجعة طلب الشحن" onClose={onClose} locked={busy}>
      <div className="request-summary">
        <div>
          <span className="eyebrow">
            {row.kind === "TRAINEE" ? "محفظة متدرب" : "مخزون فرع"}
          </span>
          <h3>{row.requestor?.displayName ?? "صاحب الطلب"}</h3>
          <p>
            {row.branch
              ? `${row.branch.gym.name} · ${row.branch.name}`
              : row.requestor?.email}
          </p>
        </div>
        <div>
          <strong>
            {decimal(row.chargePiasters)} <small>ج.م</small>
          </strong>
          <span>{row.points} نقطة</span>
        </div>
      </div>
      <dl className="details">
        <div>
          <dt>طريقة الدفع</dt>
          <dd>{methodName(row.paymentMethod)}</dd>
        </div>
        <div>
          <dt>الحساب المحوّل إليه</dt>
          <dd dir="ltr">{row.paymentAccount}</dd>
        </div>
        <div>
          <dt>اسم صاحب الحساب</dt>
          <dd>{row.paymentAccountName}</dd>
        </div>
        <div>
          <dt>خصم الشراء المحفوظ</dt>
          <dd>{decimal(row.discountBps ?? 0)}%</dd>
        </div>
      </dl>
      <div className="receipt-section">
        <div className="section-toolbar">
          <h3>إيصال التحويل</h3>
          <button
            className="secondary compact"
            disabled={reading || !row.receiptId}
            onClick={() => void read()}
          >
            {reading ? (
              <Busy />
            ) : (
              <>
                <Eye size={16} />
                {receipt ? "تحديث عرض الإيصال" : "عرض الإيصال"}
              </>
            )}
          </button>
        </div>
        <Notice text={receiptError} />
        {receipt ? (
          <>
            <img
              className="receipt-image"
              src={receipt}
              alt="إيصال التحويل المرفق بالطلب"
              referrerPolicy="no-referrer"
              onError={() => {
                setReceiptError(
                  "تعذر عرض الصورة أو انتهى الرابط. اضغط تحديث عرض الإيصال.",
                );
                setReceipt("");
              }}
            />
            <small className="muted">
              رابط العرض صالح لدقيقة. يمكنك تحديثه عند الحاجة.
            </small>
          </>
        ) : (
          <p className="subtle-box">
            اعرض الإيصال وطابق بياناته مع التحويل الوارد في حساب الاستلام.
          </p>
        )}
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          <div className="field">
            <label htmlFor="review-decision">قرار المراجعة</label>
            <select
              id="review-decision"
              required
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
            >
              <option value="">اختر القرار</option>
              <option value="APPROVED">اعتماد وإضافة النقاط</option>
              <option value="REJECTED">رفض الطلب</option>
            </select>
          </div>
          {decision === "APPROVED" && (
            <>
              <div className="form-grid">
                <Field
                  label="مرجع التحويل الفعلي"
                  name="reference"
                  required
                  minLength={3}
                  maxLength={150}
                  dir="ltr"
                />
                <Field
                  label="المبلغ المستلم بالجنيه"
                  name="amount"
                  inputMode="decimal"
                  required
                  dir="ltr"
                />
              </div>
              <label className="check">
                <input name="receipt" type="checkbox" required />
                راجعت الإيصال وطابقت بياناته
              </label>
              <label className="check">
                <input name="funds" type="checkbox" required />
                تأكدت من وصول المبلغ لحساب الاستلام
              </label>
            </>
          )}
          <div className="field">
            <label htmlFor="review-reason">سبب القرار / ملاحظة المراجعة</label>
            <textarea
              name="reason"
              id="review-reason"
              required
              maxLength={1000}
              rows={3}
            />
          </div>
          <Notice text={error} />
          <button
            className={decision === "REJECTED" ? "danger full" : "primary full"}
            disabled={!decision}
          >
            {busy ? (
              <Busy>جاري تسجيل القرار</Busy>
            ) : decision === "REJECTED" ? (
              "تأكيد رفض الطلب"
            ) : (
              "تأكيد القرار"
            )}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
