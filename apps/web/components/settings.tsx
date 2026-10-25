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
              ? "بيانات الحسابات التي يحوّل عليها المتدربون."
              : "باقات بكميات نقاط محددة، وأسعارها تُحسب من إعداداتك الحالية."}
        </p>
        {refresh}
      </div>
      <Notice text={error} />
      <Notice text={success} success />
      {section === "pricing" && <div className="settings-grid"><section className="card"><h2>تسعير النقاط وتسوية الزيارات</h2><form key={policy?.version??0} onSubmit={e=>void save(e,'admin/pricing-policies',form=>({expectedVersion:policy?.version??0,pointPricePiasters:minorUnits(String(form.get('price'))),redemptionBps:Number(minorUnits(String(form.get('redemption'))))}))}><fieldset disabled={busy}><Field label="سعر النقطة للمتدرب بالجنيه" name="price" inputMode="decimal" required defaultValue={policy?decimal(policy.pointPricePiasters):''}/><Field label="نسبة مستحقات الجيم من الزيارة (%)" name="redemption" inputMode="decimal" required defaultValue={policy?decimal(policy.redemptionBps):''}/><p>الجيم يستحق قيمة الزيارات وتسوياتها فقط. بيع وشحن النقاط من صاحب المنصة.</p><button className="primary">{busy?<Busy/>:'حفظ التسعير'}</button></fieldset></form></section>
      <section className="card"><h2>النقاط الترحيبية</h2><p>هدية للمتدرب الجديد عند التسجيل مرة واحدة. التفعيل لا يضيف نقاطًا للحسابات القديمة.</p><form key={`welcome:${settings.welcomePoints?.version??0}`} onSubmit={e=>void save(e,'admin/welcome-points',form=>({expectedVersion:settings.welcomePoints?.version??0,enabled:form.get('enabled')==='on',points:Number(form.get('points'))}),'PUT')}><fieldset disabled={busy}><label className="check"><input type="checkbox" name="enabled" defaultChecked={settings.welcomePoints?.enabled??false}/>تفعيل النقاط الترحيبية للمستخدمين الجدد</label><Field label="عدد النقاط الترحيبية" name="points" type="number" min={0} max={100000} step={1} required defaultValue={settings.welcomePoints?.points??0}/><button className="primary">{busy?<Busy/>:'حفظ النقاط الترحيبية'}</button></fieldset></form></section></div>}
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
                      إتاحة الطريقة للمتدربين
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
<input type="hidden" name="kind" value="TRAINEE"/>
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
                        متدربون
                      </p>
                      <span
                        className={`badge ${pack.enabled ? "approved" : "neutral"}`}
                      >
                        {pack.enabled ? "متاحة" : "متوقفة"}
                      </span>
                    </div>
                    <button
                      aria-label={`تعديل ${pack.label}`}
                      className="secondary compact"
                      disabled={busy}
                      onClick={() => setEditing(pack)}
                    >
                      <Pencil size={18} /> تعديل
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
