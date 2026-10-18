"use client";
import { RecordReference } from "./record-reference";
import { useEffect, useState, type FormEvent } from "react";
import { api, date, message } from "../lib/client";
import { useCommand } from "../lib/use-financial-command";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
type Gym = { id: string; name: string; canFinance: boolean };
type Branch = { id: string; gymId: string; name: string };
type Stock = Branch & { stock: number; status: string; gymStatus: string };
type Movement = {
  id: string;
  delta: number;
  transactionId: string;
  kind: string;
  operation: string;
  createdAt: string;
  actorId: string;
  otherBranchId: string | null;
};
const names: Record<string, string> = {
  ISSUE: "إضافة نقاط معتمدة",
  TRANSFER: "تحويل نقاط",
  BRANCH_TRANSFER: "نقل بين الفروع",
  VISIT: "استهلاك زيارة",
  VISIT_REVERSAL: "عكس زيارة",
  SALE_REVERSAL: "عكس بيع",
  EXPIRY: "انتهاء صلاحية",
  SALE: "بيع نقاط",
  ADJUSTMENT: "تسوية معتمدة",
};
export function Inventory({ admin }: { admin: boolean }) {
  const gyms = usePage<Gym>("reports/gyms"),
    [gymId, setGymId] = useState(""),
    [branchId, setBranchId] = useState(""),
    [open, setOpen] = useState(false),
    [revision, setRevision] = useState(0);
  const branches = usePage<Branch>(
      gymId ? `reports/gyms/${gymId}/branches` : null,
    ),
    gym = gyms.rows.find((g) => g.id === gymId),
    options = branches.rows.filter((b) => b.gymId === gymId),
    selected = options.find((b) => b.id === branchId);
  useEffect(() => {
    if (!gymId && gyms.rows[0]) setGymId(gyms.rows[0].id);
  }, [gymId, gyms.rows]);
  return (
    <>
      <section className="card">
        <h2>مخزون الفروع</h2>
        <p className="muted">
          {admin ? "اختار الجيم ثم الفرع لعرض رصيد النقاط وحركة البيع والزيارات." : "النقل متاح بين فروع الجيم الفعالة فقط. كل حركة مسجلة، والنقل لا يصدر نقاطًا جديدة."}
        </p>
        <Notice text={gyms.error || branches.error} />
        <div className="form-grid">
          <label className="field">
            الجيم
            <select
              value={gymId}
              onChange={(e) => {
                setGymId(e.target.value);
                setBranchId("");
              }}
            >
              <option value="">اختر الجيم</option>
              {gyms.rows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            الفرع
            <select
              value={selected?.id ?? ""}
              disabled={!gymId || branches.loading}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">اختر الفرع</option>
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <More list={gyms} />
        <More list={branches} />
        {gym?.canFinance && !admin && (
          <button
            className="primary"
            disabled={options.length < 2 || branches.loading}
            onClick={() => setOpen(true)}
          >
            نقل نقاط بين فرعين
          </button>
        )}
        {!admin && options.length < 2 && gym?.canFinance && (
          <p className="muted">حمّل الفروع المتاحة؛ يلزم وجود فرعين للنقل.</p>
        )}
      </section>
      {selected && (
        <button
          className="secondary compact"
          onClick={() => setRevision((v) => v + 1)}
        >
          تحديث الرصيد والحركة
        </button>
      )}
      {selected ? (
        <BranchStock
          key={`${selected.id}:${revision}`}
          branch={selected}
          branches={options}
        />
      ) : (
        <Empty title="اختر فرعًا لعرض الرصيد والحركة" />
      )}
      {open && gymId && (
        <TransferForm
          gymId={gymId}
          branches={options}
          onClose={() => setOpen(false)}
          onDone={() => setRevision((v) => v + 1)}
        />
      )}
    </>
  );
}
function BranchStock({
  branch,
  branches,
}: {
  branch: Branch;
  branches: Branch[];
}) {
  const movements = usePage<Movement>(
      `inventory/branches/${branch.id}/movements`,
    ),
    [stock, setStock] = useState<Stock | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<Stock>(`inventory/branches/${branch.id}`)
      .then((r) => {
        if (active) setStock(r);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [branch.id]);
  return (
    <section className="card">
      <div className="section-toolbar">
        <h2>{branch.name}</h2>
        <strong>{stock ? `${stock.stock} نقطة حاليًا` : ""}</strong>
      </div>
      <Notice text={error || movements.error} />
      <p className="muted">
        الرصيد الحالي وسجل الحركة يُحدّثان عند فتح الفرع أو بعد النقل. السجل
        مرتب بالمرجع للتحميل المتتابع، وليس ترتيبًا زمنيًا.
      </p>
      {movements.loading && !movements.rows.length ? (
        <Busy />
      ) : !movements.rows.length ? (
        <Empty title="لا توجد حركات مخزون" />
      ) : (
        <div className="table-scroll">
          <table className="mobile-records">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>النقاط</th>
                <th>الفرع المقابل</th>
                <th>المرجع</th>
              </tr>
            </thead>
            <tbody>
              {movements.rows.map((m) => (
                <tr key={m.id}>
                  <td data-label="التاريخ">{date(m.createdAt)}</td>
                  <td data-label="النوع">{names[m.operation] ?? m.operation}</td>
                  <td dir="ltr" data-label="النقاط">{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                  <td data-label="الفرع المقابل">
                    {m.otherBranchId
                      ? (branches.find((b) => b.id === m.otherBranchId)?.name ??
                        m.otherBranchId)
                      : "—"}
                  </td>
                  <td data-label="المرجع">
                    <RecordReference value={m.transactionId} label="قيد النقاط" />
                    <p>
                      <small>الحساب: {m.actorId}</small>
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <More list={movements} />
    </section>
  );
}
function TransferForm({
  gymId,
  branches,
  onClose,
  onDone,
}: {
  gymId: string;
  branches: Branch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [points, setPoints] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{
      source: Stock;
      target: Stock;
      points: number;
    } | null>(null),
    [done, setDone] = useState<string | null>(null);
  const { call, uncertain } = useCommand();
  async function prepare(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const n = Number(points);
      if (!Number.isSafeInteger(n) || n <= 0 || n > 2147483647 || from === to)
        throw new Error("اختر فرعين مختلفين وكمية نقاط صحيحة.");
      const [source, target] = await Promise.all([
        api<Stock>(`inventory/branches/${from}`),
        api<Stock>(`inventory/branches/${to}`),
      ]);
      if (
        source.gymId !== gymId ||
        target.gymId !== gymId ||
        [source, target].some(
          (b) => b.status !== "ACTIVE" || b.gymStatus !== "ACTIVE",
        )
      )
        throw new Error("النقل يتطلب فرعين فعالين من نفس الجيم.");
      if (source.stock < n) throw new Error("رصيد الفرع المصدر غير كافٍ.");
      if (target.stock + n > 2147483647)
        throw new Error("رصيد الفرع المستلم سيتجاوز الحد المسموح.");
      setPreview({ source, target, points: n });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (busy || !preview) return;
    setBusy(true);
    setError("");
    try {
      const r = await call<{ id: string }>(`gyms/${gymId}/stock-transfers`, {
        fromBranchId: preview.source.id,
        toBranchId: preview.target.id,
        points: preview.points,
      });
      setDone(r.id);
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="نقل مخزون بين الفروع"
      locked={busy || uncertain}
      onClose={onClose}
    >
      <Notice text={error} />
      {done ? (
        <>
          <Notice success text={`تم نقل النقاط. المرجع: ${done}`} />
          <button className="primary full" onClick={onClose}>
            تم
          </button>
        </>
      ) : preview ? (
        <>
          <p>
            نقل <strong>{preview.points} نقطة</strong> من {preview.source.name}{" "}
            إلى {preview.target.name}.
          </p>
          <div className="subtle-box">
            <p>
              {preview.source.name}: قبل النقل {preview.source.stock} · بعد
              النقل {preview.source.stock - preview.points}
            </p>
            <p>
              {preview.target.name}: قبل النقل {preview.target.stock} · بعد
              النقل {preview.target.stock + preview.points}
            </p>
          </div>
          <p className="muted">
            الأرصدة المعروضة تقديرية وقت المعاينة؛ الخادم يفحص الرصيد والصلاحيات
            مجددًا عند التنفيذ.
          </p>
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? (
              <Busy />
            ) : uncertain ? (
              "إعادة نفس النقل بأمان"
            ) : (
              "تأكيد نقل النقاط"
            )}
          </button>
          <button
            className="secondary full"
            disabled={busy || uncertain}
            onClick={() => {
              setPreview(null);
              setError("");
            }}
          >
            تعديل الاختيار
          </button>
        </>
      ) : (
        <form onSubmit={prepare}>
          <fieldset disabled={busy}>
            <label className="field">
              الفرع المصدر
              <select
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              >
                <option value="">اختر المصدر</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              الفرع المستلم
              <select
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              >
                <option value="">اختر المستلم</option>
                {branches
                  .filter((b) => b.id !== from)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
            <Field
              label="عدد النقاط"
              type="number"
              min={1}
              max={2147483647}
              step={1}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              required
            />
            <button className="primary full">
              {busy ? <Busy /> : "مراجعة الأرصدة قبل النقل"}
            </button>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
