"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  message,
  decimal,
  minorUnits,
  date,
  methodName,
} from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
import { CalendarPanel, type Calendar } from "./withdrawal-calendar";
type Withdrawal = {
  id: string;
  gymId: string;
  amountPiasters: string;
  status: string;
  paymentMethod: string;
  destinationAccount: string;
  destinationName: string;
  requestedAt: string;
  acceptedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  proofReceiptId: string | null;
  transferReference: string | null;
  reviewReason: string | null;
  rejectionReason: string | null;
  delayReason: string | null;
  overdue: boolean;
};
type Detail = {
  withdrawal: Withdrawal;
  gymName: string;
  feedback: { kind: string; reason: string; createdAt: string } | null;
  actions: { id: string; kind: string; reason: string; createdAt: string }[];
};
const stateName = (s: string) =>
  ({
    REQUESTED: "بانتظار المراجعة",
    APPROVED: "مقبول — بانتظار التحويل",
    PAID: "تم التحويل",
    REJECTED: "مرفوض",
    CANCELLED: "ملغى",
    DISPUTED: "اعتراض على التحويل",
  })[s] ?? s;
const actionName = (s: string) =>
  ({
    APPROVE: "قبول الطلب",
    REJECT: "رفض الطلب وفك الحجز",
    PAY: "تسجيل التحويل المنفذ",
    CANCEL: "إلغاء الطلب وفك الحجز",
    RECEIVED: "تأكيد استلام المبلغ",
    DISPUTE: "اعتراض على التحويل",
  })[s] ?? s;
export function Withdrawals({ admin }: { admin: boolean }) {
  return admin ? (
    <>
      <CalendarPanel />
      <WithdrawalList admin path="admin/withdrawals" />
    </>
  ) : (
    <OwnerWithdrawals />
  );
}
function OwnerWithdrawals() {
  const gyms = usePage<{ id: string; name: string; status: string }>("gyms"),
    [gymId, setGymId] = useState(""),
    [revision, setRevision] = useState(0),
    [open, setOpen] = useState(false);
  useEffect(() => {
    setGymId((old) =>
      gyms.rows.some((g) => g.id === old) ? old : (gyms.rows[0]?.id ?? ""),
    );
  }, [gyms.rows]);
  const gym = gyms.rows.find((g) => g.id === gymId);
  return (
    <>
      <Notice text={gyms.error} />
      {gyms.loading && !gyms.rows.length ? (
        <Busy />
      ) : !gyms.rows.length ? (
        <Empty title="لا توجد جيمات مرتبطة بحسابك" />
      ) : (
        <>
          <section className="card">
            <label className="field">
              الجيم
              <select value={gymId} onChange={(e) => setGymId(e.target.value)}>
                {gyms.rows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <More list={gyms} />
            {gymId && <Balance key={gymId} gymId={gymId} revision={revision} />}
            <button
              className="primary"
              disabled={gym?.status !== "ACTIVE"}
              onClick={() => setOpen(true)}
            >
              طلب سحب جديد
            </button>
            <p className="muted">
              أي مبلغ موجب في حدود المتاح. يُحجز فورًا، ولا يبدأ عد أيام التنفيذ
              قبل قبول الإدارة.
            </p>
          </section>
          {gymId && (
            <WithdrawalList
              key={`${gymId}:${revision}`}
              admin={false}
              path={`gyms/${gymId}/withdrawals`}
              onChanged={() => setRevision((n) => n + 1)}
            />
          )}
          {open && (
            <RequestForm
              gymId={gymId}
              onClose={() => setOpen(false)}
              onDone={() => setRevision((n) => n + 1)}
            />
          )}
        </>
      )}
    </>
  );
}
function Balance({ gymId, revision }: { gymId: string; revision: number }) {
  const [rows, setRows] = useState<{ type: string; balancePiasters: string }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ accounts: typeof rows }>(`gyms/${gymId}/receivables`)
      .then((r) => {
        if (active) {
          setRows(r.accounts);
          setError("");
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
  }, [gymId, revision]);
  return (
    <>
      <Notice text={error} />
      {loading ? (
        <Busy />
      ) : (
        <div className="settings-grid">
          {[
            ["GYM_AVAILABLE", "متاح للسحب"],
            ["GYM_RESERVED", "محجوز للطلبات"],
            ["GYM_PAID", "تم تحويله"],
          ].map(([type, label]) => (
            <div className="subtle-box" key={type}>
              <span>{label}</span>
              <h3>
                {decimal(
                  rows.find((r) => r.type === type)?.balancePiasters ?? "0",
                )}{" "}
                ج.م
              </h3>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function RequestForm({
  gymId,
  onClose,
  onDone,
}: {
  gymId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState<Withdrawal | null>(null);
  const { call, uncertain } = useCommand();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      setDone(
        await call<Withdrawal>(`gyms/${gymId}/withdrawals`, {
          amountPiasters: minorUnits(String(f.get("amount"))),
          paymentMethod: f.get("method"),
          destinationAccount: f.get("account"),
          destinationName: f.get("name"),
        }),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (done) onDone();
    onClose();
  };
  return (
    <Modal title="طلب سحب مستحقات" onClose={close} locked={busy || uncertain}>
      <Notice text={error} />
      {done ? (
        <>
          <Notice
            success
            text={`تم حجز ${decimal(done.amountPiasters)} ج.م. مرجع الطلب: ${done.id}`}
          />
          <button className="primary full" onClick={close}>
            تم
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <Field
              label="المبلغ بالجنيه"
              name="amount"
              inputMode="decimal"
              required
              readOnly={uncertain}
            />
            <label className="field">
              طريقة الاستقبال
              <select
                name="method"
                disabled={uncertain}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  اختر الطريقة
                </option>
                <option value="INSTAPAY">إنستا باي</option>
                <option value="WALLET">محفظة إلكترونية</option>
              </select>
            </label>
            <Field
              label="حساب إنستا باي أو رقم المحفظة"
              name="account"
              required
              minLength={3}
              maxLength={150}
              dir="ltr"
              readOnly={uncertain}
            />
            <Field
              label="اسم صاحب الحساب المستقبِل"
              name="name"
              required
              minLength={2}
              maxLength={150}
              readOnly={uncertain}
            />
            <p className="subtle-box">
              راجع بيانات الاستقبال بدقة. تُحفظ مع الطلب وتراجعها الإدارة قبل
              التحويل اليدوي.
            </p>
            <label className="check">
              <input type="checkbox" required disabled={uncertain} />
              راجعت المبلغ وطريقة وحساب الاستقبال
            </label>
            <button className="primary full">
              {busy ? (
                <Busy />
              ) : uncertain ? (
                "إعادة نفس الطلب"
              ) : (
                "تأكيد الطلب وحجز المبلغ"
              )}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
function WithdrawalList({
  admin,
  path,
  onChanged,
}: {
  admin: boolean;
  path: string;
  onChanged?: () => void;
}) {
  const list = usePage<Withdrawal>(path),
    [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <div className="section-toolbar">
        <h2>طلبات السحب</h2>
        <button
          className="secondary compact"
          disabled={list.loading}
          onClick={() => {
            void list.refresh();
            onChanged?.();
          }}
        >
          تحديث
        </button>
      </div>
      <Notice text={list.error} />
      <section className="card">
        {list.loading && !list.rows.length ? (
          <Busy />
        ) : !list.rows.length ? (
          <Empty title="لا توجد طلبات سحب" />
        ) : (
          <div className="timeline">
            {list.rows.map((w) => (
              <article key={w.id}>
                <div className="section-toolbar">
                  <strong>{decimal(w.amountPiasters)} ج.م</strong>
                  <span
                    className={`badge ${w.status === "REQUESTED" ? "pending" : w.status === "PAID" ? "approved" : "neutral"}`}
                  >
                    {stateName(w.status)}
                  </span>
                </div>
                <p>
                  {methodName(w.paymentMethod)} · {w.destinationName}
                </p>
                <small>
                  الطلب: {w.id} · {date(w.requestedAt)}
                </small>
                {w.dueAt && <p>موعد التنفيذ: {date(w.dueAt)}</p>}
                {w.overdue && (
                  <Notice text="انتهت مهلة التنفيذ؛ يلزم توثيق سبب التأخير عند تسجيل التحويل." />
                )}
                <button
                  className="secondary compact"
                  onClick={() => setSelected(w.id)}
                >
                  تفاصيل الطلب والإجراءات
                </button>
              </article>
            ))}
          </div>
        )}
        <More list={list} />
      </section>
      {selected && (
        <WithdrawalDetail
          key={selected}
          id={selected}
          admin={admin}
          onClose={() => {
            setSelected(null);
            void list.refresh();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}
function WithdrawalDetail({
  id,
  admin,
  onClose,
}: {
  id: string;
  admin: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [calendar, setCalendar] = useState<Calendar | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [action, setAction] = useState(""),
    [proof, setProof] = useState(""),
    [fileName, setFileName] = useState(""),
    [receipt, setReceipt] = useState("");
  const { call, uncertain } = useCommand();
  useEffect(() => {
    let active = true;
    Promise.all([
      api<Detail>(`withdrawals/${id}`),
      admin
        ? api<{ calendar: Calendar | null }>("admin/withdrawal-calendar")
        : Promise.resolve({ calendar: null }),
    ])
      .then(([d, c]) => {
        if (active) {
          setDetail(d);
          setCalendar(c.calendar);
          setAction(
            admin
              ? d.withdrawal.status === "REQUESTED"
                ? "APPROVE"
                : "PAY"
              : d.withdrawal.status === "REQUESTED"
                ? "CANCEL"
                : "RECEIVED",
          );
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
  }, [id, admin]);
  async function upload(file?: File) {
    if (!file || busy || uncertain) return;
    setUploading(true);
    setError("");
    setProof("");
    setFileName("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5242880
      )
        throw new Error("ارفع صورة JPG أو PNG أو WebP حتى ٥ ميجابايت.");
      const r = await api<{ id: string }>("receipts", {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      setProof(r.id);
      setFileName(file.name);
    } catch (e) {
      setError(message(e));
    } finally {
      setUploading(false);
    }
  }
  async function showProof() {
    const evidence = detail?.withdrawal.proofReceiptId;
    if (!evidence) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ url: string }>(`receipts/${evidence}/access`);
      setReceipt(r.url);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uploading) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const reason = f.get("reason");
      let path = "",
        body: unknown;
      if (action === "APPROVE" || action === "REJECT") {
        path = `admin/withdrawals/${id}/review`;
        body =
          action === "APPROVE"
            ? {
                decision: action,
                reason,
                calendarVersion: calendar?.version,
                destinationVerified: f.get("destination") === "on",
              }
            : { decision: action, reason };
      } else if (action === "PAY") {
        path = `admin/withdrawals/${id}/payment`;
        body = {
          reason,
          proofReceiptId: proof,
          transferReference: f.get("reference"),
          transferredAmountPiasters: minorUnits(String(f.get("amount"))),
          fundsTransferred: f.get("transferred") === "on",
          proofReviewed: f.get("proof") === "on",
          ...(String(f.get("delay") ?? "").trim()
            ? { delayReason: f.get("delay") }
            : {}),
        };
      } else if (action === "CANCEL") {
        path = `withdrawals/${id}/cancel`;
        body = { reason };
      } else {
        path = `withdrawals/${id}/feedback`;
        body = { kind: action, reason };
      }
      const saved = await call<Withdrawal>(path, body);
      setDetail((current) =>
        current ? { ...current, withdrawal: saved } : current,
      );
      setSuccess("تم تسجيل الإجراء. راجع الحالة والسجل قبل أي خطوة أخرى.");
      try {
        setDetail(await api<Detail>(`withdrawals/${id}`));
      } catch {
        setError(
          "تم تسجيل الإجراء، لكن تحديث السجل تعذر. أغلق التفاصيل وحدّث القائمة.",
        );
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const w = detail?.withdrawal;
  const options = w
    ? admin
      ? w.status === "REQUESTED"
        ? ["APPROVE", "REJECT"]
        : w.status === "APPROVED"
          ? ["PAY", "REJECT"]
          : []
      : w.status === "REQUESTED"
        ? ["CANCEL"]
        : w.status === "PAID" && !detail?.feedback
          ? ["RECEIVED", "DISPUTE"]
          : []
    : [];
  return (
    <Modal
      title="تفاصيل طلب السحب"
      onClose={onClose}
      locked={busy || uploading || uncertain}
    >
      <Notice text={error} />
      <Notice text={success} success />
      {loading ? (
        <Busy />
      ) : (
        detail &&
        w && (
          <>
            <h3>
              {detail.gymName} · {decimal(w.amountPiasters)} ج.م
            </h3>
            <p>{stateName(w.status)}</p>
            <div className="subtle-box">
              <p>
                {methodName(w.paymentMethod)} · {w.destinationName}
              </p>
              <p dir="ltr">{w.destinationAccount}</p>
              <p>تاريخ الطلب: {date(w.requestedAt)}</p>
              {w.acceptedAt && <p>تاريخ القبول: {date(w.acceptedAt)}</p>}
              {w.dueAt && <p>نهاية المهلة: {date(w.dueAt)}</p>}
              {w.transferReference && (
                <p>مرجع التحويل: {w.transferReference}</p>
              )}
              {w.paidAt && <p>سُجّل التحويل: {date(w.paidAt)}</p>}
            </div>
            {w.overdue && (
              <Notice text="الطلب تجاوز مهلة التنفيذ. اكتب سبب التأخر عند تسجيل التحويل." />
            )}
            {w.proofReceiptId && (
              <button
                className="secondary compact"
                disabled={busy}
                onClick={() => void showProof()}
              >
                عرض إثبات التحويل الخاص
              </button>
            )}
            {receipt && (
              <img
                className="receipt-image"
                src={receipt}
                alt="إثبات التحويل اليدوي"
                onError={() => {
                  setReceipt("");
                  setError("تعذر عرض الإثبات. أعد طلبه.");
                }}
              />
            )}
            {detail.feedback && (
              <p className="subtle-box">
                {detail.feedback.kind === "RECEIVED"
                  ? "أكد صاحب الجيم الاستلام"
                  : "اعترض صاحب الجيم على التحويل"}
                : {detail.feedback.reason} · {date(detail.feedback.createdAt)}
              </p>
            )}
            {w.status === "DISPUTED" && (
              <p className="subtle-box">
                الاعتراض مسجل للمراجعة البشرية. لا ينشئ دفعة أخرى ولا يخصم
                مستحقات أخرى تلقائيًا.
              </p>
            )}
            {!success && options.length > 0 && (
              <form onSubmit={submit}>
                <fieldset disabled={busy || uploading}>
                  <label className="field">
                    الإجراء
                    <select
                      value={options.includes(action) ? action : options[0]}
                      onChange={(e) => setAction(e.target.value)}
                      disabled={uncertain}
                    >
                      {options.map((a) => (
                        <option key={a} value={a}>
                          {actionName(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {action === "APPROVE" && (
                    <>
                      <p className="subtle-box">
                        {calendar
                          ? `سيبدأ حساب ٣ أيام عمل من القبول حسب نسخة التقويم ${calendar.version}. راجع أيام العمل والعطلات قبل التأكيد.`
                          : "اضبط سياسة أيام العمل أولًا، ثم أعد فتح الطلب."}
                      </p>
                      <label className="check">
                        <input
                          type="checkbox"
                          name="destination"
                          required
                          disabled={uncertain}
                        />
                        تحققت من طريقة الاستقبال وبيانات الحساب
                      </label>
                    </>
                  )}
                  {action === "PAY" && (
                    <>
                      <p className="subtle-box">
                        نفّذ التحويل خارج المنصة بعد مطابقة الحساب، ثم سجل مرجعه
                        وإثباته هنا. هذا الزر يسجل التحويل ولا يرسل أموالًا.
                      </p>
                      <Field
                        label="المبلغ المحوّل بالجنيه"
                        name="amount"
                        required
                        inputMode="decimal"
                        readOnly={uncertain}
                      />
                      <Field
                        label="مرجع التحويل"
                        name="reference"
                        required
                        minLength={3}
                        maxLength={150}
                        readOnly={uncertain}
                      />
                      <Field
                        label="صورة إثبات التحويل"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uncertain}
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                      {uploading && <Busy>جاري رفع الإثبات</Busy>}
                      {fileName && <p>{fileName}</p>}
                      <Field
                        label="سبب التأخير (إلزامي عند تجاوز المهلة)"
                        name="delay"
                        required={w.overdue}
                        minLength={5}
                        maxLength={1000}
                        readOnly={uncertain}
                      />
                      <label className="check">
                        <input
                          type="checkbox"
                          name="transferred"
                          required
                          disabled={uncertain}
                        />
                        تأكدت من تنفيذ التحويل كاملًا إلى الحساب المحفوظ
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          name="proof"
                          required
                          disabled={uncertain}
                        />
                        راجعت مرجع التحويل وصورة إثباته
                      </label>
                    </>
                  )}
                  <Field
                    label="سبب الإجراء أو تفاصيل التأكيد/الاعتراض"
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    readOnly={uncertain}
                  />
                  <label className="check">
                    <input type="checkbox" required disabled={uncertain} />
                    راجعت تفاصيل الطلب وتأثير الإجراء
                  </label>
                  <button
                    className="primary full"
                    disabled={
                      (action === "PAY" && !proof) ||
                      (action === "APPROVE" && !calendar)
                    }
                  >
                    {busy ? (
                      <Busy />
                    ) : uncertain ? (
                      "إعادة نفس الإجراء"
                    ) : (
                      "تأكيد الإجراء"
                    )}
                  </button>
                </fieldset>
              </form>
            )}
            <h3>سجل الإجراءات</h3>
            {detail.actions.length ? (
              <div className="timeline">
                {detail.actions.map((a) => (
                  <article key={a.id}>
                    <strong>{actionName(a.kind)}</strong>
                    <p>{a.reason}</p>
                    <small>{date(a.createdAt)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">لم تسجل إجراءات بعد.</p>
            )}
          </>
        )
      )}
    </Modal>
  );
}
