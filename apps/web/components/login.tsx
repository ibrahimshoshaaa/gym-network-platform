"use client";
import { useState, type FormEvent } from "react";
import { Dumbbell, ArrowLeft, ShieldCheck, UserPlus } from "lucide-react";
import { type Identity, request, send, message } from "../lib/client";
import { Busy, Field, Notice } from "./ui";

export function Login({ onLogin }: { onLogin: (user: Identity) => void }) {
  const [mode, setMode] = useState("trainee");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (creating && form.get("password") !== form.get("confirm"))
        throw new Error("تأكيد كلمة المرور غير مطابق.");
      const body = creating ? {
        displayName: form.get("displayName"), email: form.get("email"),
        phone: form.get("phone"), password: form.get("password"),
      } : { mode, identifier: form.get("identifier"), token: form.get("token"), password: form.get("password") };
      const result = await request<{ user: Identity }>(
        creating ? "/api/register" : "/api/session", send(body),
      );
      onLogin(result.user);
    } catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  function changeView(create: boolean) {
    setCreating(create); setMode("trainee"); setError("");
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand"><span className="brand-icon"><Dumbbell size={25} /></span><span>GYM<span className="brand-light">NETWORK</span></span></div>
        <div className="story-copy">
          <span className="eyebrow light">رصيد واحد. اختيارات أكتر.</span>
          <h1>تمرّن في جيمك.<br />واكتشف غيره.</h1>
          <p>اعمل حسابك، اشحن نقاطك، واختار من الجيمات المشاركة. رمز دخولك ومحفظتك وزياراتك في مكان واحد.</p>
          <div className="story-lines"><span /><span /><span /></div>
        </div>
        <div className="story-footer"><ShieldCheck size={18} />حسابك ونقاطك تحت إيدك</div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit} key={creating ? "register" : mode}>
          <span className="eyebrow">GYM NETWORK</span>
          <h2>{creating ? "ابدأ رحلتك معانا" : mode === "invite" ? "تفعيل دعوة حسابك" : "أهلًا برجوعك"}</h2>
          <p className="muted">{creating ? "أنشئ حساب متدرب، ومحفظتك هتكون جاهزة فورًا." : mode === "trainee" ? "ادخل لمحفظتك وشوف الجيمات ورمز الدخول." : mode === "invite" ? "أدخل رمز الدعوة وحدد كلمة مرور لحسابك." : "سجّل الدخول إلى مساحة الإدارة الخاصة بحسابك."}</p>
          <div className="auth-switch" aria-label="الدخول أو إنشاء حساب">
            <button type="button" className={!creating ? "active" : ""} aria-pressed={!creating} disabled={busy} onClick={() => changeView(false)}>تسجيل الدخول</button>
            <button type="button" className={creating ? "active" : ""} aria-pressed={creating} disabled={busy} onClick={() => changeView(true)}>إنشاء حساب متدرب</button>
          </div>
          <fieldset disabled={busy}>
            {creating ? <>
              <Field label="الاسم" name="displayName" required minLength={2} maxLength={100} autoComplete="name" placeholder="اسمك بالكامل" />
              <Field label="رقم الموبايل" name="phone" type="tel" required maxLength={40} autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" />
              <Field label="البريد الإلكتروني" name="email" type="email" required maxLength={254} autoComplete="email" dir="ltr" placeholder="name@example.com" />
            </> : <>
              <div className="field">
                <label htmlFor="login-mode">نوع الدخول</label>
                <select id="login-mode" value={mode} onChange={e => { setMode(e.target.value); setError(""); }}>
                  <option value="trainee">متدرب</option><option value="admin">صاحب المنصة</option><option value="staff">صاحب جيم / موظف</option><option value="invite">تفعيل دعوة</option>
                </select>
              </div>
              {mode === "invite" ? <Field label="رمز الدعوة" name="token" required minLength={43} maxLength={43} dir="ltr" autoComplete="off" /> : <Field label="البريد الإلكتروني أو رقم الهاتف" name="identifier" required maxLength={254} autoComplete="username" dir="ltr" placeholder="البريد أو رقم الموبايل" />}
            </>}
            <Field label="كلمة المرور" name="password" type="password" required minLength={creating ? 15 : undefined} maxLength={creating ? 128 : 256} autoComplete={creating || mode === "invite" ? "new-password" : "current-password"} hint={creating || mode === "invite" ? "للحساب الجديد: 15 حرفًا على الأقل. ممكن تستخدم جملة سهلة تفتكرها." : undefined} />
            {creating && <Field label="تأكيد كلمة المرور" name="confirm" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />}
            <Notice text={error} />
            <button className="primary full">
              {busy ? <Busy>{creating ? "جاري إنشاء حسابك" : "جاري تسجيل الدخول"}</Busy> : <>{creating ? <UserPlus size={18} /> : <ArrowLeft size={18} />}{creating ? "إنشاء حسابي وفتح المحفظة" : mode === "invite" ? "تفعيل الحساب" : "تسجيل الدخول"}</>}
            </button>
          </fieldset>
          <small className="login-note">{creating ? "هذا التسجيل للمتدربين فقط. حسابات إدارة الجيم تُفعّل بدعوة من الإدارة." : "جديد معانا؟ اختار «إنشاء حساب متدرب» علشان تبدأ."}</small>
        </form>
        <footer className="powered">Powered by <strong>ShoTech Solutions</strong></footer>
      </section>
    </main>
  );
}
