"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  Save,
  CreditCard,
  Wallet,
  Plus,
  Pencil,
  RefreshCw,
  Coins,
  Percent,
} from "lucide-react";
import {
  api,
  send,
  message,
  decimal,
  minorUnits,
  type Settings,
  type Package,
  type PaymentMethod,
} from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
export function SettingsPanel({
  section,
}: {
  section: "pricing" | "payments" | "packages";
}) {
  const [settings, setSettings] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Package | null>(null);
  async function load() {
    setError("");
    try {
      setSettings(await api<Settings>("admin/topup-settings"));
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    let active = true;
    api<Settings>("admin/topup-settings")
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(
    e: FormEvent<HTMLFormElement>,
    path: string,
    build: (form: FormData) => unknown,
    method = "POST",
  ) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const body = build(new FormData(e.currentTarget));
      await api(path, send(body, method));
      setSettings(await api<Settings>("admin/topup-settings"));
      setEditing(null);
      setSuccess("تم حفظ التغييرات بنجاح.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const refresh = (
    <button
      className="secondary compact"
      onClick={() => {
        setSuccess("");
        void load();
      }}
      disabled={busy}
    >
      <RefreshCw size={16} />
      تحديث البيانات
    </button>
  );
  if (!settings)
    return (
      <section className="card">
        <Notice text={error} />
        {error ? refresh : <Busy />}
      </section>
    );
  const policy = settings.policy;
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          {section === "pricing"
            ? "حدد قيم النقاط والنسب التي تستخدمها العمليات الجديدة."
            : section === "payments"
              ? "بيانات الحسابات التي يحوّل عليها المتدربون وأصحاب الجيمات."
              : "باقات بكميات نقاط محددة، وأسعارها تُحسب من إعداداتك الحالية."}
        </p>
        {refresh}
      </div>
      <Notice text={error} />
      <Notice text={success} success />
      {section === "pricing" && (
        <div className="settings-grid">
          <section className="card">
            <div className="card-heading">
              <div className="card-icon">
                <Coins size={21} />
              </div>
              <div>
                <h2>تسعير النقاط</h2>
                <p>نسخة الإعدادات {policy?.version ?? "لم تُحدّد بعد"}</p>
              </div>
            </div>
            <form
              key={policy?.version ?? 0}
              onSubmit={(e) =>
                void save(e, "admin/pricing-policies", (form) => {
                  const discount = Number(
                      minorUnits(String(form.get("discount")), true),
                    ),
                    redemption = Number(
                      minorUnits(String(form.get("redemption"))),
                    );
                  if (discount > 9999 || redemption > 10000)
                    throw new Error(
                      "الخصم أقل من 100%، ونسبة بيع الجيم أكبر من 0% وحتى 100%.",
                    );
                  return {
                    expectedVersion: policy?.version ?? 0,
                    pointPricePiasters: minorUnits(String(form.get("price"))),
                    gymDiscountBps: discount,
                    redemptionBps: redemption,
                  };
                })
              }
            >
              <fieldset disabled={busy}>
                <Field
                  label="سعر النقطة بالجنيه"
                  name="price"
                  inputMode="decimal"
                  required
                  dir="ltr"
                  defaultValue={
                    policy ? decimal(policy.pointPricePiasters) : ""
                  }
                  hint="القيمة الأساسية للنقطة قبل خصم شراء الجيم."
                />
                <div className="form-grid">
                  <Field
                    label="خصم شراء الجيم (%)"
                    name="discount"
                    inputMode="decimal"
                    required
                    dir="ltr"
                    defaultValue={policy ? decimal(policy.gymDiscountBps) : ""}
                  />
                  <Field
                    label="نسبة بيع الجيم لصاحب المنصة (%)"
                    name="redemption"
                    inputMode="decimal"
                    required
                    dir="ltr"
                    defaultValue={policy ? decimal(policy.redemptionBps) : ""}
                  />
                </div>
                <button className="primary">
                  {busy ? (
                    <Busy>جاري الحفظ</Busy>
                  ) : (
                    <>
                      <Save size={17} />
                      حفظ الأسعار والنسب
                    </>
                  )}
                </button>
              </fieldset>
            </form>
          </section>
          <aside className="card explanation">
            <span className="eyebrow">كيف تُحسب القيم؟</span>
            <h2>كل نسبة لها دور واضح</h2>
            <div>
              <span className="mini-icon">
                <Coins size={18} />
              </span>
              <h3>سعر النقطة</h3>
              <p>القيمة التي يبدأ منها حساب شحن المحفظة وشراء مخزون الفروع.</p>
            </div>
            <div>
              <span className="mini-icon">
                <Percent size={18} />
              </span>
              <h3>خصم الشراء</h3>
              <p>يُخصم من قيمة النقاط عندما يشتري الجيم مخزونًا لأحد فروعه.</p>
            </div>
            <div>
              <span className="mini-icon">
                <Wallet size={18} />
              </span>
              <h3>بيع الجيم لصاحب المنصة</h3>
              <p>
                النسبة المستحقة للجيم من قيمة النقاط المستهلكة في الزيارات.
                تشغيل الزيارات والتسوية يأتي في المرحلة التالية.
              </p>
            </div>
            <p className="subtle-box">
              التعديل يخص العمليات الجديدة. الطلبات السابقة تحتفظ بالقيم
              المحفوظة فيها.
            </p>
          </aside>
        </div>
      )}
      {section === "payments" && (
        <div className="two-columns">
          {(["INSTAPAY", "WALLET"] as const).map((type) => {
            const method = settings.paymentMethods.find((m) => m.type === type);
            return (
              <section className="card" key={type}>
                <div className="card-heading">
                  <div className="card-icon">
                    {type === "INSTAPAY" ? (
                      <CreditCard size={22} />
                    ) : (
                      <Wallet size={22} />
                    )}
                  </div>
                  <div>
                    <h2>
                      {type === "INSTAPAY"
                        ? "إنستا باي"
                        : "المحفظة الإلكترونية"}
                    </h2>
                    <p>
                      {method?.enabled ? "متاحة للتحويل" : "غير متاحة حاليًا"}
                    </p>
                  </div>
                  <span
                    className={`badge ${method?.enabled ? "approved" : "neutral"}`}
                  >
                    {method?.enabled ? "مفعّلة" : "متوقفة"}
                  </span>
                </div>
                <form
                  key={method?.version ?? 0}
                  onSubmit={(e) =>
                    void save(
                      e,
                      `admin/payment-methods/${type}`,
                      (form) => ({
                        expectedVersion: method?.version ?? 0,
                        account: form.get("account"),
                        accountName: form.get("accountName"),
                        enabled: form.get("enabled") === "on",
                      }),
                      "PUT",
                    )
                  }
                >
                  <fieldset disabled={busy}>
                    <Field
                      label={
                        type === "INSTAPAY"
                          ? "رقم الهاتف أو عنوان حساب إنستا باي"
                          : "رقم المحفظة"
                      }
                      name="account"
                      required
                      minLength={3}
                      maxLength={150}
                      dir="ltr"
                      defaultValue={method?.account ?? ""}
                    />
                    <Field
                      label="اسم صاحب الحساب"
                      name="accountName"
                      required
                      minLength={2}
                      maxLength={150}
                      defaultValue={method?.accountName ?? ""}
                    />
                    <label className="check">
                      <input
                        type="checkbox"
                        name="enabled"
                        defaultChecked={method?.enabled ?? false}
                      />
                      إتاحة الطريقة للعملاء وأصحاب الجيمات
                    </label>
                    <button className="primary">
                      {busy ? (
                        <Busy>جاري الحفظ</Busy>
                      ) : (
                        <>
                          <Save size={17} />
                          حفظ بيانات الحساب
                        </>
                      )}
                    </button>
                  </fieldset>
                </form>
              </section>
            );
          })}
        </div>
      )}
      {section === "packages" && (
        <div className="settings-grid">
          <section className="card">
            <div className="card-heading">
              <div className="card-icon">
                <Plus size={21} />
              </div>
              <div>
                <h2>{editing ? "تعديل الباقة" : "إضافة باقة نقاط"}</h2>
                <p>كمية نقاط؛ والسعر يتبع إعدادات التسعير</p>
              </div>
            </div>
            <form
              key={editing ? `${editing.id}:${editing.version}` : "new"}
              onSubmit={(e) =>
                void save(
                  e,
                  editing
                    ? `admin/topup-packages/${editing.id}`
                    : "admin/topup-packages",
                  (form) => ({
                    expectedVersion: editing?.version ?? 0,
                    label: form.get("label"),
                    kind: form.get("kind"),
                    points: Number(form.get("points")),
                    enabled: form.get("enabled") === "on",
                  }),
                  editing ? "PUT" : "POST",
                )
              }
            >
              <fieldset disabled={busy}>
                <Field
                  label="اسم الباقة"
                  name="label"
                  required
                  maxLength={100}
                  defaultValue={editing?.label ?? ""}
                />
                <div className="field">
                  <label htmlFor="package-kind">مخصصة لـ</label>
                  <select
                    name="kind"
                    id="package-kind"
                    defaultValue={editing?.kind ?? "TRAINEE"}
                  >
                    <option value="TRAINEE">المتدربين</option>
                    <option value="BRANCH_STOCK">مخزون فروع الجيمات</option>
                  </select>
                </div>
                <Field
                  label="عدد النقاط"
                  name="points"
                  type="number"
                  required
                  min={1}
                  max={2147483647}
                  step={1}
                  defaultValue={editing?.points ?? ""}
                />
                <label className="check">
                  <input
                    name="enabled"
                    type="checkbox"
                    defaultChecked={editing?.enabled ?? true}
                  />
                  الباقة متاحة
                </label>
                <div className="actions">
                  <button className="primary">
                    {busy ? (
                      <Busy>جاري الحفظ</Busy>
                    ) : (
                      <>
                        <Save size={17} />
                        حفظ الباقة
                      </>
                    )}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setEditing(null)}
                    >
                      إلغاء التعديل
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          </section>
          <section className="card">
            <h2>الباقات الحالية</h2>
            <p className="muted">تظهر أول 100 باقة.</p>
            {!settings.packages.length ? (
              <Empty title="لسه مفيش باقات">
                أضف باقة لتسهيل اختيار عدد النقاط.
              </Empty>
            ) : (
              <div className="package-list">
                {settings.packages.map((pack) => (
                  <article key={pack.id}>
                    <div>
                      <h3>{pack.label}</h3>
                      <p>
                        {pack.points} نقطة ·{" "}
                        {pack.kind === "TRAINEE" ? "متدربون" : "مخزون فروع"}
                      </p>
                      <span
                        className={`badge ${pack.enabled ? "approved" : "neutral"}`}
                      >
                        {pack.enabled ? "متاحة" : "متوقفة"}
                      </span>
                    </div>
                    <button
                      aria-label={`تعديل ${pack.label}`}
                      className="icon-button"
                      disabled={busy}
                      onClick={() => setEditing(pack)}
                    >
                      <Pencil size={18} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
