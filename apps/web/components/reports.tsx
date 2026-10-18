"use client";
import { FinanceSnapshot,type PlatformFinanceData } from "./platform-finance";
import { RecordReference } from "./record-reference";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, message, decimal, date, ApiError } from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
type Gym = { id: string; name: string; canFinance: boolean };
type Branch = { id: string; gymId: string; name: string };
type Metric = { count: string; points: string; amountPiasters: string };
type Summary = {
  platformFinance: PlatformFinanceData|null;
  period: { from: string; to: string };
  asOf: string;
  scope: { finance: boolean };
  topups: Metric | null;
  sales: Metric;
  visits: Metric;
  cancellations: Metric;
  netVisitPoints: string;
  netVisitReceivablesPiasters: string;
  currentStockPoints: string;
  currentBalances: { type: string; balancePiasters: string }[] | null;
  paidWithdrawals: Metric | null;
  alerts: {
    topups: { count: string; oldestAt: string | null } | null;
    reviews: { count: string; oldestAt: string | null };
    withdrawals: {
      requested: string;
      approved: string;
      overdue: string;
      disputed: string;
    } | null;
  };
  reconciliation: {
    points: { type: string; balance: string }[];
    pointDifference: string;
    moneyDifference: string;
  } | null;
};
type Row = {
  id: string;
  referenceId: string;
  eventAt: string;
  gymName: string | null;
  branchName: string | null;
  status: string;
  points: string | null;
  amountPiasters: string;
  actorId: string | null;
};
type Page = {
  kind: Kind;
  filterStatus: string | null;
  items: Row[];
  nextCursor: string | null;
  asOf: string;
};
const kinds = {
  TOPUPS: "طلبات الشحن",
  SALES: "مبيعات النقاط",
  VISITS: "الزيارات",
  CANCELLATIONS: "إلغاءات الزيارات",
  WITHDRAWALS: "طلبات السحب",
};
type Kind = keyof typeof kinds;
const states: Record<Kind, string[]> = {
  TOPUPS: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  SALES: ["RECORDED"],
  VISITS: ["ACTIVE", "EXPIRED", "CANCELLED"],
  CANCELLATIONS: ["CANCELLED"],
  WITHDRAWALS: [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "PAID",
    "DISPUTED",
  ],
};
const stateName = (s: string) =>
  ({
    PENDING: "قيد المراجعة",
    APPROVED: "معتمد",
    REJECTED: "مرفوض",
    CANCELLED: "ملغى",
    RECORDED: "مسجل",
    ACTIVE: "قائم",
    EXPIRED: "منتهي",
    REQUESTED: "بانتظار المراجعة",
    PAID: "تم التحويل",
    DISPUTED: "معترض عليه",
  })[s] ?? s;
const money = (value: string) =>
  value.startsWith("-") ? `-${decimal(value.slice(1))}` : decimal(value);
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function Reports({ admin }: { admin: boolean }) {
  const gyms = usePage<Gym>("reports/gyms"),
    [gymId, setGymId] = useState(""),
    [branchId, setBranchId] = useState(""),
    [from, setFrom] = useState(() => today().slice(0, 8) + "01"),
    [to, setTo] = useState(today),
    [kind, setKind] = useState<Kind>("VISITS"),
    [status, setStatus] = useState("");
  const branches = usePage<Branch>(
      gymId ? `reports/gyms/${gymId}/branches` : null,
    ),
    visibleBranches = branches.rows.filter((b) => b.gymId === gymId),
    gym = gyms.rows.find((g) => g.id === gymId),
    needsBranch = !admin && !gym?.canFinance;
  const [summary, setSummary] = useState<Summary | null>(null),
    [rows, setRows] = useState<Page | null>(null),
    [applied, setApplied] = useState<{ base: string; detail: string } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  useEffect(() => {
    if (!admin && !gymId && gyms.rows[0]) setGymId(gyms.rows[0].id);
  }, [admin, gymId, gyms.rows]);
  useEffect(() => {
    if (
      needsBranch &&
      visibleBranches.length &&
      !visibleBranches.some((b) => b.id === branchId)
    )
      setBranchId(visibleBranches[0]!.id);
  }, [needsBranch, visibleBranches, branchId]);
  const purchases = admin || Boolean(gym?.canFinance);
  const finance = purchases && !branchId;
  const actualKind =
    (kind === "WITHDRAWALS" && !finance) || (kind === "TOPUPS" && !purchases)
      ? "VISITS"
      : kind;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const current = ++version.current;
    const base = new URLSearchParams({
      from,
      to,
      ...(gymId ? { gymId } : {}),
      ...(branchId ? { branchId } : {}),
    }).toString();
    const detail =
      base +
      "&" +
      new URLSearchParams({
        kind: actualKind,
        ...(status ? { status } : {}),
      }).toString();
    try {
      const [s, p] = await Promise.all([
        api<Summary>(`reports/summary?${base}`),
        api<Page>(`reports/rows?${detail}&limit=25`),
      ]);
      if (version.current === current) {
        setSummary(s);
        setRows(p);
        setApplied({ base, detail });
      }
    } catch (e) {
      if (version.current === current) setError(message(e));
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  async function more() {
    if (busy || !rows?.nextCursor || !applied) return;
    setBusy(true);
    setError("");
    const current = ++version.current;
    try {
      const p = await api<Page>(
        `reports/rows?${applied.detail}&limit=25&cursor=${rows.nextCursor}`,
      );
      if (version.current === current)
        setRows((old) => ({
          items: [
            ...(old?.items ?? []),
            ...p.items.filter((r) => !old?.items.some((x) => x.id === r.id)),
          ],
          nextCursor: p.nextCursor,
          asOf: p.asOf,
          kind: p.kind,
          filterStatus: p.filterStatus,
        }));
    } catch (e) {
      if (version.current === current) setError(message(e));
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  async function download() {
    if (busy || !applied) return;
    setBusy(true);
    setError("");
    const current = ++version.current;
    try {
      const response = await fetch(
        `/api/backend/reports/export?${applied.detail}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401)
          window.dispatchEvent(new Event("session-expired"));
        throw new ApiError(body.code ?? "SERVICE_UNAVAILABLE", response.status);
      }
      const blob = await response.blob();
      if (version.current !== current) return;
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "gym-report.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (version.current === current) setError(message(error));
    } finally {
      if (version.current === current) setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <h2>اختار الفترة</h2>
            <p className="muted">اعرض الملخص أولًا، واستخدم فلاتر الجيم ونوع العملية عند الحاجة.</p>
            <div className="settings-grid">
              <Field
                label="من يوم — بتوقيت القاهرة"
                type="date"
                value={from}
                required
                onChange={(e) => setFrom(e.target.value)}
              />
              <Field
                label="إلى يوم — شامل"
                type="date"
                value={to}
                required
                min={from}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <details className="report-filters" open={!admin || undefined}><summary>تحديد الجيم والفرع ونوع العملية والحالة</summary><div className="settings-grid">
              <label className="field">
                الجيم
                <select
                  value={gymId}
                  required={!admin}
                  onChange={(e) => {
                    setGymId(e.target.value);
                    setBranchId("");
                    setStatus("");
                  }}
                >
                  {admin ? (
                    <option value="">كل الجيمات والمنصة</option>
                  ) : (
                    <option value="" disabled>
                      اختر الجيم
                    </option>
                  )}
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
                  value={branchId}
                  disabled={!gymId}
                  required={needsBranch}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setStatus("");
                  }}
                >
                  <option value="" disabled={needsBranch}>
                    {needsBranch ? "اختر فرعًا مكلّفًا به" : "كل الفروع"}
                  </option>
                  {visibleBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                تفاصيل العملية
                <select
                  value={actualKind}
                  onChange={(e) => {
                    setKind(e.target.value as Kind);
                    setStatus("");
                  }}
                >
                  {Object.entries(kinds)
                    .filter(
                      ([key]) =>
                        (key !== "WITHDRAWALS" || finance) &&
                        (key !== "TOPUPS" || purchases),
                    )
                    .map(([key, name]) => (
                      <option value={key} key={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                حالة السجل الحالية
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="">كل الحالات</option>
                  {states[actualKind].map((s) => (
                    <option key={s} value={s}>
                      {stateName(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            </details>
            <p className="muted">
              حد الفترة ٣٦٦ يومًا. فلتر نوع العملية والحالة يخص الجدول والتصدير؛
              ملخص الفترة يشمل كل الحركات.
            </p>
            <button
              className="primary"
              disabled={
                gyms.loading ||
                branches.loading ||
                (!admin && !gymId) ||
                (needsBranch && !branchId)
              }
            >
              {busy ? <Busy /> : "عرض التقرير"}
            </button>
          </fieldset>
        </form>
        <Notice text={gyms.error || branches.error} />
        <More list={gyms} />
        {gymId && <More list={branches} />}
      </section>
      <Notice text={error} />
      {summary?.platformFinance && <section className="platform-finance"><h2>الصورة المالية للمنصة — كل الفترات</h2><FinanceSnapshot data={summary.platformFinance} asOf={summary.asOf}/></section>}
      {summary && (
        <>
          <div className="section-toolbar">
            <h2>حركة الفترة المعروضة</h2>
            <small>
              من {summary.period.from} إلى {summary.period.to} · لقطة{" "}
              {date(summary.asOf)}
            </small>
          </div>
          <div className="settings-grid">
            {[
              ...(summary.topups
                ? [
                    [
                      "شحن معتمد — تحصيل المنصة",
                      `${money(summary.topups.amountPiasters)} ج.م`,
                      `${summary.topups.points} نقطة أُصدرت وقت الاعتماد`,
                    ],
                  ]
                : []),
              [
                "مبيعات الفرع للمتدربين",
                `${money(summary.sales.amountPiasters)} ج.م`,
                `${summary.sales.points} نقطة · ${summary.sales.count} عملية`,
              ],
              [
                "زيارات مسجلة",
                summary.visits.count,
                `${summary.visits.points} نقطة · مستحق ${money(summary.visits.amountPiasters)} ج.م`,
              ],
              [
                "إلغاءات خلال الفترة",
                summary.cancellations.count,
                `${summary.cancellations.points} نقطة مردودة · عكس ${money(summary.cancellations.amountPiasters)} ج.م`,
              ],
              [
                "صافي حركة مستحقات الزيارات",
                `${money(summary.netVisitReceivablesPiasters)} ج.م`,
                `${summary.netVisitPoints} نقطة صافي استهلاك`,
              ],
              ...(summary.paidWithdrawals
                ? [
                    [
                      "تحويلات سحب سُجلت في الفترة",
                      `${money(summary.paidWithdrawals.amountPiasters)} ج.م`,
                      `${summary.paidWithdrawals.count} تحويل، يشمل المعترض عليه`,
                    ],
                  ]
                : []),
            ].map(([label, value, hint]) => (
              <section className="card" key={label}>
                <p className="muted">{label}</p>
                <h2 dir="auto">{value}</h2>
                <small>{hint}</small>
              </section>
            ))}
          </div>
          <section className="card">
            <h2>الأرصدة الحالية وقت اللقطة</h2>
            <p className="muted">
              ليست إقفالًا لنهاية الفترة. تحصيل المنصة ومبيعات الجيم والمستحقات
              أرقام مختلفة ولا تمثل ربحًا محسوبًا.
            </p>
            <p>
              مخزون الفروع: <strong>{summary.currentStockPoints} نقطة</strong>
            </p>
            {summary.currentBalances ? (
              <div className="settings-grid">
                {[
                  ["GYM_AVAILABLE", "متاح للسحب"],
                  ["GYM_RESERVED", "محجوز للسحب"],
                  ["GYM_PAID", "مدفوع سابقًا"],
                  ["GYM_DISPUTED", "محجوز لنزاع"],
                ].map(([type, label]) => (
                  <div className="subtle-box" key={type}>
                    <span>{label}</span>
                    <h3>
                      {money(
                        summary.currentBalances!.find((r) => r.type === type)
                          ?.balancePiasters ?? "0",
                      )}{" "}
                      ج.م
                    </h3>
                  </div>
                ))}
              </div>
            ) : (
              <p className="subtle-box">
                محفظة المستحقات والسحب موحدة للجيم. عرض الفرع لا يوزع الرصيد
                النقدي أو يتيح مالية الجيم العامة للموظف.
              </p>
            )}
          </section>
          <section className="card">
            <h2>طلبات تحتاج متابعة الآن</h2>
            <p className="muted">
              قائمة المتابعة الحالية في النطاق المختار، مستقلة عن تاريخ التقرير.
            </p>
            <div className="settings-grid">
              {summary.alerts.topups && (
                <p>
                  شحن قيد المراجعة:{" "}
                  <strong>{summary.alerts.topups.count}</strong>
                  {summary.alerts.topups.oldestAt && (
                    <small>
                      {" "}
                      · الأقدم {date(summary.alerts.topups.oldestAt)}
                    </small>
                  )}
                </p>
              )}
              <p>
                تصحيح/إلغاء قيد المراجعة:{" "}
                <strong>{summary.alerts.reviews.count}</strong>
                {summary.alerts.reviews.oldestAt && (
                  <small>
                    {" "}
                    · الأقدم {date(summary.alerts.reviews.oldestAt)}
                  </small>
                )}
              </p>
              {summary.alerts.withdrawals && (
                <>
                  <p>
                    سحب بانتظار المراجعة: {summary.alerts.withdrawals.requested}
                  </p>
                  <p>
                    سحب مقبول بانتظار التحويل:{" "}
                    {summary.alerts.withdrawals.approved}
                  </p>
                  <p>
                    سحب تجاوز المهلة:{" "}
                    <strong>{summary.alerts.withdrawals.overdue}</strong>
                  </p>
                  <p>
                    اعتراضات تحويل مدفوع: {summary.alerts.withdrawals.disputed}
                  </p>
                </>
              )}
            </div>
          </section>
          {summary.reconciliation && (
            <section className="card">
              <h2>مطابقة الدفتر العام</h2>
              <p>
                فرق تجميع النقاط: {summary.reconciliation.pointDifference} · فرق
                تجميع المال: {summary.reconciliation.moneyDifference} قرش
              </p>
              <div className="settings-grid">
                {summary.reconciliation.points.map((p) => (
                  <p key={p.type}>
                    {{
                      ISSUANCE: "حساب الإصدار (سالب)",
                      TRAINEE_WALLET: "محافظ المتدربين",
                      BRANCH_INVENTORY: "مخزون الفروع",
                      REDEEMED: "نقاط مستهلكة",
                      EXPIRED: "نقاط سُوّيت كمنتهية",
                    }[p.type] ?? p.type}
                    : {p.balance} نقطة
                  </p>
                ))}
              </div>
              <p className="muted">
                المحافظ المنتهية غير المسوّاة تظل التزامًا في الدفتر؛ ليست
                نقاطًا قابلة للإنفاق.
              </p>
            </section>
          )}
        </>
      )}
      {rows && applied ? (
        <section className="card">
          <div className="section-toolbar">
            <h2>
              تفاصيل {kinds[rows.kind]}{" "}
              {rows.filterStatus ? `· ${stateName(rows.filterStatus)}` : ""}
            </h2>
            <button
              className="secondary compact"
              disabled={busy}
              onClick={() => void download()}
            >
              تنزيل CSV — حتى ٥٠٠٠ سجل
            </button>
          </div>
          <p className="muted">
            التنزيل يتبع الفلاتر التي عُرضت، ويشمل كل السجلات المطابقة لا الصفحة
            الحالية فقط. مرجع الموظف/المستخدم هو معرف الحساب.
          </p>
          {!rows.items.length ? (
            <Empty title="لا توجد سجلات في النطاق المختار" />
          ) : (
            <div className="table-scroll">
              <table className="mobile-records">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>الجيم / الفرع</th>
                    <th>الحالة</th>
                    <th>النقاط</th>
                    <th>القيمة بالجنيه</th>
                    <th>المراجع</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.items.map((r) => (
                    <tr key={r.id}>
                      <td data-label="التاريخ">{date(r.eventAt)}</td>
                      <td data-label="الجيم / الفرع">
                        {r.gymName ?? "شحن متدرب مباشر"}
                        {r.branchName && ` / ${r.branchName}`}
                      </td>
                      <td data-label="الحالة">{stateName(r.status)}</td>
                      <td data-label="النقاط">{r.points ?? "—"}</td>
                      <td data-label="القيمة بالجنيه">{money(r.amountPiasters)}</td>
                      <td data-label="المراجع">
                        <RecordReference value={r.referenceId} />
                        {r.actorId && (
                          <RecordReference value={r.actorId} label="مرجع الحساب" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows.nextCursor && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void more()}
            >
              {busy ? <Busy /> : "تحميل المزيد"}
            </button>
          )}
        </section>
      ) : (
        !busy && (
          <section className="card">
            <Empty title="اختر النطاق واعرض التقرير" />
          </section>
        )
      )}
    </>
  );
}
