"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Clock, Phone, Search } from "lucide-react";
import { api, date, message } from "../lib/client";
import { branchMap, branchPhone } from "../lib/branch-links";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
type Branch = {
  id: string;
  name: string;
  address: string;
  governorate: string;
  city: string;
  contactPhone: string | null;
  openingHours: string | null;
  latitude: string;
  longitude: string;
  visitPricePoints: number;
  sessionMinutes: number;
  pricingVersion: number;
  gym: { id: string; name: string; description: string };
};
type Page = { items: Branch[]; nextCursor: string | null; asOf: string };
export function BranchDirectory() {
  const [q, setQ] = useState(""),
    [governorate, setGovernorate] = useState(""),
    [city, setCity] = useState(""),
    [applied, setApplied] = useState(""),
    [result, setResult] = useState<Page | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Branch | null>(null);
  const generation = useRef(0);
  async function load(query: string, cursor?: string) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const p = await api<Page>(
        `directory/branches?${query}${cursor ? `&cursor=${cursor}` : ""}`,
      );
      if (current !== generation.current) return;
      setResult((old) => ({
        ...p,
        items: cursor
          ? [
              ...(old?.items ?? []),
              ...p.items.filter((b) => !old?.items.some((x) => x.id === b.id)),
            ]
          : p.items,
      }));
      setApplied(query);
    } catch (e) {
      if (current === generation.current) setError(message(e));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load("limit=12");
    return () => {
      generation.current++;
    };
  }, []);
  function search(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const query = new URLSearchParams({
      limit: "12",
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(governorate.trim() ? { governorate: governorate.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
    }).toString();
    setResult(null);
    void load(query);
  }
  const filters = new URLSearchParams(applied);
  return (
    <>
      <section className="card">
        <h2>اكتشف الجيمات والفروع</h2>
        <p className="muted">
          الفروع الفعالة ذات السعر المعتمد والموقع المكتمل. افتح التفاصيل قبل
          التوجّه؛ المواعيد يحددها الجيم.
        </p>
        <form onSubmit={search}>
          <fieldset disabled={busy}>
            <div className="form-grid">
              <Field
                label="اسم الجيم أو الفرع"
                value={q}
                maxLength={80}
                onChange={(e) => setQ(e.target.value)}
              />
              <Field
                label="المحافظة"
                value={governorate}
                maxLength={80}
                onChange={(e) => setGovernorate(e.target.value)}
                placeholder="اسم المحافظة كاملًا"
              />
              <Field
                label="المدينة"
                value={city}
                maxLength={80}
                onChange={(e) => setCity(e.target.value)}
                placeholder="اسم المدينة كاملًا"
              />
            </div>
            <button className="primary">
              {busy ? (
                <Busy />
              ) : (
                <>
                  <Search size={17} />
                  بحث
                </>
              )}
            </button>
          </fieldset>
        </form>
      </section>
      <Notice text={error} />
      {result && (
        <div className="section-toolbar">
          <p className="muted">
            نتائج البحث:{" "}
            {[filters.get("q"), filters.get("governorate"), filters.get("city")]
              .filter(Boolean)
              .join(" · ") || "كل الفروع"}{" "}
            · {result.items.length} فرعًا معروضًا
          </p>
          <button
            className="secondary compact"
            disabled={busy}
            onClick={() => void load(applied)}
          >
            تحديث النتائج
          </button>
        </div>
      )}
      {busy && !result ? (
        <section className="card">
          <Busy />
        </section>
      ) : result && !result.items.length ? (
        <section className="card">
          <Empty title="لا توجد فروع مطابقة">
            جرّب اسمًا آخر أو احذف فلتر المحافظة أو المدينة.
          </Empty>
        </section>
      ) : null}
      <div className="settings-grid">
        {result?.items.map((b) => (
          <section className="card" key={b.id}>
            <p className="eyebrow">{b.gym.name}</p>
            <h2>{b.name}</h2>
            <p>
              <MapPin size={16} /> {b.governorate} · {b.city}
            </p>
            <p>{b.address}</p>
            <div className="subtle-box">
              <strong>{b.visitPricePoints} نقطة للزيارة</strong>
              <p>
                <Clock size={16} /> مدة السيشن {b.sessionMinutes} دقيقة
              </p>
            </div>
            <button className="primary full" onClick={() => setSelected(b)}>
              تفاصيل الفرع والموقع
            </button>
          </section>
        ))}
      </div>
      {result?.nextCursor && (
        <button
          className="secondary full"
          disabled={busy}
          onClick={() => void load(applied, result.nextCursor!)}
        >
          {busy ? <Busy /> : "تحميل فروع إضافية"}
        </button>
      )}
      {selected && (
        <BranchDetails
          key={selected.id}
          initial={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function BranchDetails({
  initial,
  onClose,
}: {
  initial: Branch;
  onClose: () => void;
}) {
  const [branch, setBranch] = useState<Branch | null>(null),
    [asOf, setAsOf] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ branch: Branch; asOf: string }>(`directory/branches/${initial.id}`)
      .then((r) => {
        if (active) {
          setBranch(r.branch);
          setAsOf(r.asOf);
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
  }, [initial.id]);
  const map = branch ? branchMap(branch.latitude, branch.longitude) : null,
    phone = branchPhone(branch?.contactPhone ?? null);
  return (
    <Modal title={initial.name} onClose={onClose}>
      <Notice text={error} />
      {loading ? (
        <Busy />
      ) : branch ? (
        <>
          <p className="eyebrow">{branch.gym.name}</p>
          {branch.gym.description && <p>{branch.gym.description}</p>}
          <h3>{branch.name}</h3>
          <p>
            {branch.governorate} · {branch.city}
          </p>
          <p>{branch.address}</p>
          <div className="settings-grid">
            <div className="subtle-box">
              <strong>{branch.visitPricePoints} نقطة</strong>
              <p>تكلفة الزيارة</p>
            </div>
            <div className="subtle-box">
              <strong>{branch.sessionMinutes} دقيقة</strong>
              <p>مدة السيشن</p>
            </div>
          </div>
          <h3>مواعيد العمل</h3>
          <p className="directory-hours">
            {branch.openingHours ||
              "لم يحدد الجيم مواعيد العمل بعد؛ تأكد منه قبل التوجّه."}
          </p>
          {branch.contactPhone && (
            <p>
              رقم تواصل الجيم:{" "}
              {phone ? (
                <a href={phone} dir="ltr">
                  <Phone size={16} />
                  {branch.contactPhone}
                </a>
              ) : (
                <span dir="ltr">{branch.contactPhone}</span>
              )}
            </p>
          )}
          {map && (
            <a
              className="primary full"
              href={map}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
            >
              <MapPin size={17} />
              فتح موقع الفرع على الخريطة
            </a>
          )}
          <p className="muted">
            الخريطة تفتح في موقع خارجي. عرض الفرع لا يحجز زيارة ولا يخصم نقاطًا.
            السعر النهائي وحالة الفرع يُراجعان عند تسجيل الزيارة مع الكاشير.
          </p>
          <small>
            آخر تحقق: {date(asOf)} · نسخة السعر {branch.pricingVersion}
          </small>
        </>
      ) : (
        <Empty title="تفاصيل الفرع غير متاحة حاليًا">
          قد يكون الفرع توقف أو تغيرت بياناته؛ حدّث نتائج الدليل.
        </Empty>
      )}
    </Modal>
  );
}
