"use client";
import { useState, type FormEvent } from "react";
import { Dumbbell, ArrowLeft, ShieldCheck } from "lucide-react";
import { type Identity, request, send, message } from "../lib/client";
import { Busy, Field, Notice } from "./ui";
export function Login({ onLogin }: { onLogin: (user: Identity) => void }) {
  const [mode, setMode] = useState("admin"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const result = await request<{ user: Identity }>(
        "/api/session",
        send({
          mode,
          identifier: form.get("identifier"),
          token: form.get("token"),
          password: form.get("password"),
        }),
      );
      onLogin(result.user);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Dumbbell size={25} />
          </span>
          <span>
            GYM<span className="brand-light">NETWORK</span>
          </span>
        </div>
        <div className="story-copy">
          <span className="eyebrow light">إدارة أوضح. شبكة أقوى.</span>
          <h1>
            كل فروعك.
            <br />
            في مكان واحد.
          </h1>
          <p>
            نظّم النقاط، تابع طلبات الشحن، وراجع التحويلات بخطوات واضحة من لوحة
            إدارة واحدة.
          </p>
          <div className="story-lines">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="story-footer">
          <ShieldCheck size={18} />
          وصول حسب صلاحيات كل حساب
        </div>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <span className="eyebrow">لوحة التحكم</span>
          <h2>{mode === "invite" ? "تفعيل دعوة حسابك" : "أهلًا برجوعك"}</h2>
          <p className="muted">
            {mode === "invite"
              ? "أدخل رمز الدعوة وحدد كلمة مرور لحسابك الجديد."
              : "سجّل الدخول لمتابعة إدارة المنصة والجيم."}
          </p>
          <div className="field">
            <label htmlFor="login-mode">نوع الدخول</label>
            <select
              id="login-mode"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value);
                setError("");
              }}
            >
              <option value="admin">صاحب المنصة</option>
              <option value="trainee">متدرب</option>
              <option value="staff">صاحب جيم / موظف</option>
              <option value="invite">تفعيل دعوة</option>
            </select>
          </div>
          {mode === "invite" ? (
            <Field
              key="token"
              label="رمز الدعوة"
              name="token"
              required
              minLength={43}
              maxLength={43}
              dir="ltr"
              autoComplete="off"
            />
          ) : (
            <Field
              key="identifier"
              label="البريد الإلكتروني أو رقم الهاتف"
              name="identifier"
              required
              maxLength={254}
              autoComplete="username"
              dir="ltr"
              placeholder="name@example.com"
            />
          )}
          <Field
            label="كلمة المرور"
            name="password"
            type="password"
            required
            maxLength={256}
            autoComplete={
              mode === "invite" ? "new-password" : "current-password"
            }
            hint={
              mode === "invite"
                ? "للحساب الجديد: 15 حرفًا على الأقل. لو عندك حساب بالفعل استخدم كلمة مرورك الحالية."
                : undefined
            }
          />
          <Notice text={error} />
          <button className="primary full" disabled={busy}>
            {busy ? (
              <Busy>جاري تسجيل الدخول</Busy>
            ) : (
              <>
                {mode === "invite" ? "تفعيل الحساب" : "تسجيل الدخول"}
                <ArrowLeft size={18} />
              </>
            )}
          </button>
          <small className="login-note">
            الحسابات الإدارية تُجهّز بواسطة مسؤول المنصة.
          </small>
        </form>
        <footer className="powered">
          Powered by <strong>ShoTech Solutions</strong>
        </footer>
      </section>
    </main>
  );
}
