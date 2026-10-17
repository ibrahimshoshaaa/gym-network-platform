"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, RefreshCw, ScanLine, Coins, CheckCircle2 } from "lucide-react";
import { FinancialCommand } from "../lib/financial-command";
import { QRCodeSVG } from "qrcode.react";
import { api, send, message, decimal, minorUnits, date } from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
import { More, usePage } from "./gyms/shared";
type Branch = { id: string; name: string; gymName: string; canSell: boolean };
type Sale = {
  id: string;
  traineeLabel: string;
  phoneLast4: string;
  points: number;
  chargePiasters: string;
  createdAt: string;
};
type Visit = {
  id: string;
  pointsCharged: number;
  settlementPiasters: string;
  startedAt: string;
  expiresAt: string;
  status: string;
};
type Preview = {
  traineeLabel: string;
  phoneLast4: string;
  points: number;
  balance: number | null;
  sessionMinutes: number;
  pricingVersion: number;
  branchPricingVersion: number;
  alreadyActive: boolean;
  visit: Visit | null;
};
type SaleQuote = {
  points: number;
  chargePiasters: string;
  pricingVersion: number;
  stock: number;
  traineeLabel: string;
  phoneLast4: string;
};
function useCommand() {
  const command = useRef<FinancialCommand | null>(null);
  if (!command.current) command.current = new FinancialCommand();
  const [uncertain, setUncertain] = useState(false);
  async function call<T>(path: string, body: unknown): Promise<T> {
    try {
      return await command.current!.run<T>(path, body);
    } catch (e) {
      if (command.current!.uncertain)
        throw new Error(
          "نتيجة الطلب غير مؤكدة. اضغط التأكيد لإعادة نفس الطلب بأمان، ولا تحصّل المبلغ مرة ثانية أو تبدأ طلبًا جديدًا قبل مراجعة السجل.",
        );
      throw e;
    } finally {
      setUncertain(command.current!.uncertain);
    }
  }
  return { call, uncertain };
}
export function Cashier() {
  const [branches, setBranches] = useState<Branch[]>([]),
    [branch, setBranch] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<{ items: Branch[] }>("operations/branches");
      setBranches(data.items);
      setBranch((old) =>
        data.items.some((b) => b.id === old) ? old : (data.items[0]?.id ?? ""),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          البيع وتأكيد الزيارة متاحان للكاشير المكلّف بالفرع فقط.
        </p>
        <button
          className="secondary compact"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          تحديث الفروع
        </button>
      </div>
      <Notice text={error} />
      {loading ? (
        <section className="card">
          <Busy />
        </section>
      ) : !branches.length ? (
        <section className="card">
          <Empty title="لا توجد تكليفات تشغيل نشطة">
            اطلب من صاحب الجيم ربط حسابك بفرع نشط؛ الملكية وحدها لا تمنح صلاحية
            الكاشير.
          </Empty>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="field">
              <label htmlFor="cashier-branch">الفرع الحالي</label>
              <select
                id="cashier-branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.gymName} · {b.name}
                  </option>
                ))}
              </select>
            </div>
            <small className="muted">تظهر أول 100 صلاحية فرع نشطة.</small>
          </section>
          {branch && (
            <BranchOperations
              key={branch}
              branch={branches.find((b) => b.id === branch)!}
            />
          )}
        </>
      )}
    </>
  );
}
function BranchOperations({ branch }: { branch: Branch }) {
  const [tab, setTab] = useState("sale"),
    [stock, setStock] = useState<number | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api<{ stock: number }>(`operations/branches/${branch.id}/summary`)
      .then((r) => {
        if (active) setStock(r.stock);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [branch.id, revision]);
  return (
    <>
      <div className="management-tabs operation-tabs">
        <button
          aria-pressed={tab === "sale"}
          className={tab === "sale" ? "active" : ""}
          onClick={() => setTab("sale")}
        >
          <Coins size={16} />
          بيع نقاط
        </button>
        <button
          aria-pressed={tab === "visit"}
          className={tab === "visit" ? "active" : ""}
          onClick={() => setTab("visit")}
        >
          <ScanLine size={16} />
          تسجيل زيارة
        </button>
        <button
          aria-pressed={tab === "history"}
          className={tab === "history" ? "active" : ""}
          onClick={() => setTab("history")}
        >
          سجل الفرع
        </button>
      </div>
      <Notice text={error} />
      <p className="muted stock-line">
        مخزون الفرع: <strong>{stock ?? "—"} نقطة</strong>
      </p>
      {!branch.canSell && tab !== "history" ? (
        <section className="card">
          <Empty title="العمليات للكاشير فقط">
            يمكنك عرض سجل الفرع من تبويب السجل.
          </Empty>
        </section>
      ) : tab === "sale" ? (
        <SaleForm
          branchId={branch.id}
          onDone={() => setRevision((n) => n + 1)}
        />
      ) : tab === "visit" ? (
        <VisitForm branchId={branch.id} />
      ) : (
        <OperationHistory branchId={branch.id} />
      )}
    </>
  );
}
function SaleForm({
  branchId,
  onDone,
}: {
  branchId: string;
  onDone: () => void;
}) {
  const [person, setPerson] = useState<{
      id: string;
      label: string;
      phoneLast4: string;
    } | null>(null),
    [quote, setQuote] = useState<SaleQuote | null>(null),
    [points, setPoints] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const { call, uncertain } = useCommand();
  async function lookup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || uncertain) return;
    setBusy(true);
    setError("");
    setPerson(null);
    setQuote(null);
    const form = e.currentTarget;
    try {
      setPerson(
        await api(
          `cashier/branches/${branchId}/trainee-lookup`,
          send({ phone: new FormData(form).get("phone") }),
        ),
      );
      form.reset();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function calculate(e: FormEvent) {
    e.preventDefault();
    if (busy || uncertain || !person) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      setQuote(
        await api(
          `cashier/branches/${branchId}/sale-quotes`,
          send({ traineeId: person.id, points: Number(points) }),
        ),
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !person || !quote) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const body = {
        traineeId: person.id,
        points: quote.points,
        pricingVersion: quote.pricingVersion,
        receivedAmountPiasters: minorUnits(String(form.get("amount"))),
        fundsReceived: form.get("received") === "on",
      };
      const result = await call<Sale>(
        `cashier/branches/${branchId}/sales`,
        body,
      );
      setSuccess(`تم تحويل ${result.points} نقطة. مرجع البيع: ${result.id}`);
      setPerson(null);
      setQuote(null);
      setPoints("");
      onDone();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Notice text={error} />
      <Notice text={success} success />
      <div className="settings-grid">
        <section className="card">
          <h2>تحديد المتدرب</h2>
          <p className="muted">
            اكتب الرقم كاملًا، ثم طابق الاسم والجزء الظاهر من الهاتف.
          </p>
          <form onSubmit={lookup}>
            <fieldset disabled={busy || uncertain}>
              <Field
                label="رقم هاتف المتدرب"
                name="phone"
                type="tel"
                required
                maxLength={40}
                dir="ltr"
              />
              <button className="secondary full">
                {busy ? <Busy /> : "بحث برقم الهاتف"}
              </button>
            </fieldset>
          </form>
          {person && (
            <>
              <div className="subtle-box">
                <strong>{person.label}</strong>
                <p>آخر أربعة أرقام: {person.phoneLast4}</p>
              </div>
              <form onSubmit={calculate}>
                <fieldset disabled={busy || uncertain}>
                  <Field
                    label="عدد النقاط"
                    value={points}
                    type="number"
                    required
                    min={1}
                    max={2147483647}
                    step={1}
                    onChange={(e) => {
                      setPoints(e.target.value);
                      setQuote(null);
                    }}
                  />
                  <button className="primary full">
                    {busy ? <Busy /> : "حساب قيمة البيع"}
                  </button>
                </fieldset>
              </form>
            </>
          )}
        </section>
        <section className="card">
          <h2>التحصيل والتحويل</h2>
          {!quote ? (
            <Empty title="حدد المتدرب والكمية أولًا" />
          ) : (
            <>
              <div className="quote-total">
                <span>المبلغ الذي يحصّله الفرع</span>
                <strong>
                  {decimal(quote.chargePiasters)} <small>ج.م</small>
                </strong>
                <p>
                  {quote.points} نقطة · المخزون {quote.stock}
                </p>
              </div>
              <form onSubmit={confirm}>
                <fieldset disabled={busy}>
                  <Field
                    label="المبلغ المستلم بالجنيه"
                    name="amount"
                    readOnly={uncertain}
                    inputMode="decimal"
                    required
                    dir="ltr"
                  />
                  <label className="check">
                    <input
                      type="checkbox"
                      name="received"
                      disabled={uncertain}
                      required
                    />
                    طابقت المتدرب وتأكدت من استلام المبلغ كاملًا
                  </label>
                  <button
                    className="primary full"
                    disabled={quote.points > quote.stock}
                  >
                    {busy ? (
                      <Busy>جاري تحويل النقاط</Busy>
                    ) : (
                      "تأكيد التحصيل وتحويل النقاط"
                    )}
                  </button>
                </fieldset>
              </form>
              <p className="subtle-box">
                لو حصل انقطاع بعد التأكيد، أعد نفس الطلب أو راجع السجل؛ لا تحصّل
                المبلغ مرة ثانية. إلغاء البيع يحتاج مراجعة صاحب المنصة.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
function VisitForm({ branchId }: { branchId: string }) {
  const [token, setToken] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      visit: Visit;
      alreadyActive: boolean;
    } | null>(null),
    [camera, setCamera] = useState(false);
  const { call, uncertain } = useCommand();
  function scanned(value: string) {
    setToken(value.startsWith("gymqr:") ? value.slice(6) : value);
    setPreview(null);
    setResult(null);
    setCamera(false);
  }
  async function scan(e: FormEvent) {
    e.preventDefault();
    if (busy || uncertain) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setPreview(
        await api(
          `cashier/branches/${branchId}/visit-previews`,
          send({ token }),
        ),
      );
    } catch (e) {
      setError(message(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !preview) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        token,
        pricingVersion: preview.pricingVersion,
        branchPricingVersion: preview.branchPricingVersion,
        presenceConfirmed:
          new FormData(e.currentTarget).get("present") === "on",
      };
      setResult(
        await call<{ visit: Visit; alreadyActive: boolean }>(
          `cashier/branches/${branchId}/visits`,
          body,
        ),
      );
      setPreview(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card visit-card">
      <h2>مسح رمز دخول المتدرب</h2>
      <p className="muted">
        الرمز صالح لدقيقة. التأكيد يتم بعد التحقق من حضور المتدرب فعليًا.
      </p>
      <Notice text={error} />
      {result && (
        <div className="subtle-box" role="status">
          <CheckCircle2 size={24} />
          <h3>
            {result.alreadyActive
              ? "السيشن قائم بالفعل — لم تُخصم نقاط أخرى"
              : "تم تسجيل الزيارة بنجاح"}
          </h3>
          <p>تنتهي الجلسة: {date(result.visit.expiresAt)}</p>
          <small>المرجع: {result.visit.id}</small>
        </div>
      )}
      <button
        className="secondary"
        disabled={busy || uncertain}
        onClick={() => setCamera((old) => !old)}
      >
        <Camera size={18} />
        {camera ? "إغلاق الكاميرا" : "فتح كاميرا QR"}
      </button>
      {camera && <Scanner onValue={scanned} onError={setError} />}
      <form onSubmit={scan}>
        <fieldset disabled={busy}>
          <Field
            label="رمز الدخول"
            name="token"
            readOnly={uncertain}
            value={token}
            onChange={(e) => {
              scanned(e.target.value);
            }}
            maxLength={49}
            required
            dir="ltr"
            autoComplete="off"
            hint="يمكن لصق الرمز من المتدرب عند تعذر استخدام الكاميرا."
          />
          <button className="primary" disabled={uncertain}>
            {busy ? <Busy /> : "التحقق وعرض الزيارة"}
          </button>
        </fieldset>
      </form>
      {preview && (
        <form onSubmit={confirm}>
          <fieldset disabled={busy}>
            <div className="quote-total">
              <span>
                {preview.traineeLabel} · آخر الهاتف {preview.phoneLast4}
              </span>
              <strong>
                {preview.alreadyActive
                  ? "بدون خصم جديد"
                  : `${preview.points} نقطة`}
              </strong>
              <p>
                {preview.sessionMinutes} دقيقة
                {preview.balance !== null
                  ? ` · الرصيد ${preview.balance} نقطة`
                  : ""}
              </p>
            </div>
            <label className="check">
              <input
                name="present"
                disabled={uncertain}
                type="checkbox"
                required
              />
              المتدرب حاضر أمامي وقد طابقت بياناته
            </label>
            <button
              className="primary full"
              disabled={
                !preview.alreadyActive &&
                (preview.balance ?? 0) < preview.points
              }
            >
              {busy ? (
                <Busy>جاري تأكيد الدخول</Busy>
              ) : preview.alreadyActive ? (
                "عرض السيشن القائم"
              ) : (
                "تأكيد الدخول وخصم الزيارة"
              )}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
function Scanner({
  onValue,
  onError,
}: {
  onValue: (value: string) => void;
  onError: (value: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onValue);
  callback.current = onValue;
  useEffect(() => {
    let cancelled = false,
      controls: { stop: () => void } | undefined;
    const stop = () => {
      controls?.stop();
      const stream = video.current?.srcObject;
      if (typeof MediaStream !== "undefined" && stream instanceof MediaStream)
        stream.getTracks().forEach((track) => track.stop());
    };
    import("@zxing/browser")
      .then(async ({ BrowserQRCodeReader }) => {
        if (cancelled) return;
        try {
          const reader = new BrowserQRCodeReader();
          controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" }, audio: false },
            video.current!,
            (result) => {
              if (result && !cancelled) {
                callback.current(result.getText());
                stop();
              }
            },
          );
          if (cancelled) stop();
        } catch {
          if (!cancelled)
            onError(
              "تعذر فتح الكاميرا. استخدم HTTPS واسمح بالوصول للكاميرا، أو الصق الرمز.",
            );
        }
      })
      .catch(() => {
        if (!cancelled)
          onError("تعذر تحميل قارئ الكاميرا. الصق رمز المتدرب وحاول مرة أخرى.");
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [onError]);
  return (
    <video
      className="scanner-video"
      ref={video}
      muted
      playsInline
      aria-label="كاميرا قراءة رمز الدخول"
    />
  );
}
function OperationHistory({ branchId }: { branchId: string }) {
  const sales = usePage<Sale>(`operations/branches/${branchId}/sales`),
    visits = usePage<Visit>(`operations/branches/${branchId}/visits`);
  return (
    <div className="two-columns">
      <section className="card">
        <h2>مبيعات النقاط</h2>
        <Notice text={sales.error} />
        {sales.loading && !sales.rows.length ? (
          <Busy />
        ) : !sales.rows.length ? (
          <Empty title="لا توجد مبيعات" />
        ) : (
          <div className="timeline">
            {sales.rows.map((s) => (
              <article key={s.id}>
                <strong>
                  {s.traineeLabel} · {s.points} نقطة
                </strong>
                <p>
                  {decimal(s.chargePiasters)} ج.م · {date(s.createdAt)}
                </p>
                <small>مرجع: {s.id}</small>
              </article>
            ))}
          </div>
        )}
        <More list={sales} />
      </section>
      <section className="card">
        <h2>الزيارات المسجلة</h2>
        <Notice text={visits.error} />
        {visits.loading && !visits.rows.length ? (
          <Busy />
        ) : !visits.rows.length ? (
          <Empty title="لا توجد زيارات" />
        ) : (
          <div className="timeline">
            {visits.rows.map((v) => (
              <article key={v.id}>
                <strong>
                  {v.pointsCharged} نقطة ·{" "}
                  {v.status === "ACTIVE"
                    ? "سيشن قائم"
                    : v.status === "EXPIRED"
                      ? "انتهت المدة"
                      : "ملغاة"}
                </strong>
                <p>حتى {date(v.expiresAt)}</p>
                <small>مرجع: {v.id}</small>
              </article>
            ))}
          </div>
        )}
        <More list={visits} />
      </section>
    </div>
  );
}
export function TraineeQr() {
  const [qr, setQr] = useState<{
      token: string;
      expiresAt: string;
      serverTime: string;
    } | null>(null),
    [wallet, setWallet] = useState<{
      balance: number;
      expiresAt: string | null;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [left, setLeft] = useState(0);
  const until = useRef(0),
    visits = usePage<Visit>("trainee/visits");
  async function renew() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const [code, balance] = await Promise.all([
        api<{ token: string; expiresAt: string; serverTime: string }>(
          "trainee/qr",
          send({}),
        ),
        api<{ balance: number; expiresAt: string | null }>("trainee/wallet"),
      ]);
      until.current =
        performance.now() +
        Math.max(
          0,
          new Date(code.expiresAt).getTime() -
            new Date(code.serverTime).getTime(),
        );
      setQr(code);
      setWallet(balance);
      setLeft(Math.ceil((until.current - performance.now()) / 1000));
      void visits.refresh();
    } catch (e) {
      setError(message(e));
      setQr(null);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const timer = setInterval(
      () =>
        setLeft(
          Math.max(0, Math.ceil((until.current - performance.now()) / 1000)),
        ),
      500,
    );
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <Notice text={error} />
      <div className="settings-grid">
        <section className="card trainee-code">
          <h2>رمز دخول الجيم</h2>
          <p className="muted">
            اعرض الرمز للكاشير عند حضورك. الرمز لا يحتوي اسمك أو رقمك.
          </p>
          {qr && left > 0 ? (
            <>
              <QRCodeSVG
                value={`gymqr:${qr.token}`}
                size={224}
                level="M"
                title="رمز الدخول المؤقت"
              />
              <p role="status">ينتهي بعد {left} ثانية</p>
              <details>
                <summary>نسخ الرمز عند تعذر الكاميرا</summary>
                <input
                  readOnly
                  value={qr.token}
                  dir="ltr"
                  aria-label="رمز الدخول النصي"
                  autoComplete="off"
                />
              </details>
            </>
          ) : (
            <Empty title={qr ? "انتهت صلاحية الرمز" : "الرمز جاهز للإصدار"}>
              اضغط لعرض رمز جديد قصير الصلاحية.
            </Empty>
          )}
          <button
            className="primary full"
            disabled={busy}
            onClick={() => void renew()}
          >
            {busy ? (
              <Busy />
            ) : qr ? (
              "إصدار رمز جديد وتحديث الرصيد"
            ) : (
              "إظهار رمز الدخول"
            )}
          </button>
          {wallet && (
            <div className="subtle-box">
              <strong>رصيد المحفظة: {wallet.balance} نقطة</strong>
              <p>
                {wallet.expiresAt
                  ? `الصلاحية حتى ${date(wallet.expiresAt)}`
                  : "لا يوجد شحن سابق"}
              </p>
            </div>
          )}
        </section>
        <section className="card">
          <h2>سجل زياراتك</h2>
          <Notice text={visits.error} />
          {visits.loading && !visits.rows.length ? (
            <Busy />
          ) : !visits.rows.length ? (
            <Empty title="لم تسجل زيارات بعد" />
          ) : (
            <div className="timeline">
              {visits.rows.map((v) => (
                <article key={v.id}>
                  <strong>
                    {v.pointsCharged} نقطة ·{" "}
                    {v.status === "ACTIVE"
                      ? "سيشن قائم"
                      : v.status === "EXPIRED"
                        ? "انتهت المدة"
                        : "ملغاة"}
                  </strong>
                  <p>تنتهي: {date(v.expiresAt)}</p>
                  <small>مرجع: {v.id}</small>
                </article>
              ))}
            </div>
          )}
          <More list={visits} />
        </section>
      </div>
    </>
  );
}
