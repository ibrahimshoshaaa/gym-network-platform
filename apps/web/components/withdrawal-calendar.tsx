"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, send, message } from "../lib/client";
import { Busy, Field, Notice } from "./ui";
export type Calendar = {
  id: string;
  version: number;
  workdays: number[];
  holidays: string[];
  countAcceptanceDay: boolean;
  deadlineHour: number;
  deadlineMinute: number;
};
const days = [
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
  "الأحد",
];
export function CalendarPanel() {
  const [calendar, setCalendar] = useState<Calendar | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    let active = true;
    api<{ calendar: Calendar | null }>("admin/withdrawal-calendar")
      .then((r) => {
        if (active) setCalendar(r.calendar);
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<Calendar>(
        "admin/withdrawal-calendar",
        send({
          expectedVersion: calendar?.version ?? 0,
          workdays: f.getAll("day").map(Number),
          holidays: String(f.get("holidays") ?? "")
            .split(/\s+/)
            .filter(Boolean),
          countAcceptanceDay: f.get("include") === "YES",
          deadlineHour: Number(f.get("hour")),
          deadlineMinute: Number(f.get("minute")),
        }),
      );
      setCalendar(result);
      setSuccess("تم حفظ نسخة جديدة. مواعيد الطلبات المقبولة سابقًا محفوظة.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card">
      <summary>
        سياسة مهلة السحب وأيام العمل{" "}
        {calendar ? `· نسخة ${calendar.version}` : "· لم تُضبط بعد"}
      </summary>
      <Notice text={error} />
      <Notice text={success} success />
      {loading ? (
        <Busy />
      ) : (
        <form onSubmit={submit} key={calendar?.version ?? 0}>
          <fieldset disabled={busy}>
            <p className="subtle-box">
              المهلة ٣ أيام عمل من القبول، بتوقيت القاهرة. اختر أيام العمل
              والعطلات وساعة النهاية صراحةً. لا تُضاف عطلات تلقائيًا.
            </p>
            <div className="settings-grid">
              {days.map((day, i) => (
                <label className="check" key={day}>
                  <input
                    type="checkbox"
                    name="day"
                    value={i + 1}
                    defaultChecked={calendar?.workdays.includes(i + 1) ?? false}
                  />
                  {day}
                </label>
              ))}
            </div>
            <label className="field">
              حساب يوم القبول
              <select
                name="include"
                required
                defaultValue={
                  calendar ? (calendar.countAcceptanceDay ? "YES" : "NO") : ""
                }
              >
                <option value="" disabled>
                  اختر القاعدة
                </option>
                <option value="NO">ابدأ العد من يوم العمل التالي</option>
                <option value="YES">
                  احسب يوم القبول إن كان يوم عمل وقبل ساعة النهاية
                </option>
              </select>
            </label>
            <div className="two-columns">
              <Field
                name="hour"
                label="ساعة نهاية المهلة (٠–٢٣)"
                type="number"
                min={0}
                max={23}
                required
                defaultValue={calendar?.deadlineHour}
              />
              <Field
                name="minute"
                label="الدقيقة (٠–٥٩)"
                type="number"
                min={0}
                max={59}
                required
                defaultValue={calendar?.deadlineMinute}
              />
            </div>
            <label className="field">
              تواريخ العطلات (YYYY-MM-DD، تاريخ في كل سطر)
              <textarea
                name="holidays"
                rows={4}
                maxLength={5500}
                dir="ltr"
                defaultValue={calendar?.holidays.join("\n") ?? ""}
              />
            </label>
            <label className="check">
              <input type="checkbox" required />
              راجعت التقويم وقاعدة الحساب قبل تطبيقها على الطلبات القادمة
            </label>
            <button className="primary">
              {busy ? <Busy /> : "حفظ سياسة المهلة"}
            </button>
          </fieldset>
        </form>
      )}
    </details>
  );
}
