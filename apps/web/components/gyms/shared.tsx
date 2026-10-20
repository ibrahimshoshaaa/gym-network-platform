"use client";
import { invitationLink } from "../../lib/invitation-link";
import { LocationPicker } from "./location-picker";
import { requiredLocation } from "../../lib/location-point";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Copy, Check } from "lucide-react";
import { api, send, message, date, type Page } from "../../lib/client";
import { Busy, Field, Modal, Notice } from "../ui";
export type Gym = {
  canDelegate?:boolean;
  updatedAt: string;
  id: string;
  name: string;
  description: string | null;
  contactPhone: string | null;
  status: string;
  ownerAcceptedAt: string | null;
  owner?: {
    displayName: string;
    email: string;
    phoneE164: string;
    isActive: boolean;
  };
};
export type Branch = {
  updatedAt: string;
  pricingRequests?: Pricing[];
  id: string;
  name: string;
  status: string;
  address: string;
  governorate: string;
  city: string;
  latitude: string | null;
  longitude: string | null;
  contactPhone: string | null;
  openingHours: string | null;
  visitPricePoints: number;
  sessionMinutes: number;
  pricingVersion: number;
  priceApprovedAt: string | null;
  pointAccounts: { balance: number }[];
};
export type Invite = {
  userId:string;
  id: string;
  type: string;
  role: string;
  branchId: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  user: { displayName: string; email: string; phoneE164: string };
  branch: { name: string } | null;
};
export type NewInvite = { id: string; token: string; expiresAt: string };
export type Staff = {
  canDelegate?:boolean;branchId:string;
  id: string;
  role: string;
  active: boolean;
  branch: { name: string };
  user: { id:string;displayName: string; email: string; phoneE164: string };
};
export type Pricing = {
  id: string;
  branchId: string;
  status: string;
  visitPricePoints: number;
  sessionMinutes: number;
  previousPricePoints: number;
  previousSessionMinutes: number;
  baseVersion: number;
  reason: string;
  reviewReason: string | null;
  createdAt: string;
  branch?: { name: string; gymId?:string; gym: { name: string; status: string } };
};
export const statusText = (status: string) =>
  ({
    PENDING: "قيد المراجعة",
    ACTIVE: "نشط",
    SUSPENDED: "موقوف",
    REJECTED: "مرفوض",
    APPROVED: "معتمد",
  })[status] ?? status;
export const roleText = (role: string) =>
  role === "GYM_OWNER"
    ? "صاحب الجيم"
    : role === "CASHIER"
      ? "كاشير"
      : "مدير فرع";
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["ACTIVE", "APPROVED"].includes(value) ? "approved" : value === "PENDING" ? "pending" : ["REJECTED", "SUSPENDED"].includes(value) ? "rejected" : "neutral"}`}
    >
      {statusText(value)}
    </span>
  );
}
export function usePage<T extends { id: string }>(path: string | null) {
  const [rows, setRows] = useState<T[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(Boolean(path)),
    [error, setError] = useState("");
  const version = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const current = ++version.current;
      if (!path) {
        setRows([]);
        setCursor(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const result = await api<Page<T>>(
          `${path}${path.includes("?") ? "&" : "?"}limit=25${next ? `&cursor=${next}` : ""}`,
        );
        if (version.current === current) {
          setRows((old) =>
            next
              ? [
                  ...old,
                  ...result.items.filter(
                    (row) => !old.some((previous) => previous.id === row.id),
                  ),
                ]
              : result.items,
          );
          setCursor(result.nextCursor);
        }
      } catch (e) {
        if (version.current === current) setError(message(e));
      } finally {
        if (version.current === current) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    setRows([]);
    setCursor(null);
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  return {
    rows,
    cursor,
    loading,
    error,
    refresh: () => load(),
    more: () => (cursor ? load(cursor) : Promise.resolve()),
  };
}
export function More({
  list,
}: {
  list: { cursor: string | null; loading: boolean; more: () => Promise<void> };
}) {
  return list.cursor ? (
    <div className="load-more">
      <button
        className="secondary"
        disabled={list.loading}
        onClick={() => void list.more()}
      >
        {list.loading ? <Busy /> : "تحميل المزيد"}
      </button>
    </div>
  ) : null;
}
export function Mutation<T>({
  title,
  path,
  children,
  build,
  onDone,
  onClose,
  method = "POST",
  label = "حفظ",
  danger = false,
}: {
  title: string;
  path: string;
  children: ReactNode;
  build: (form: FormData) => unknown;
  onDone: (result: T) => void;
  onClose: () => void;
  method?: string;
  label?: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<T>(
        path,
        send(build(new FormData(e.currentTarget)), method),
      );
      onDone(result);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} locked={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <fieldset disabled={busy}>
          {children}
          <Notice text={error} />
          <button className={`${danger ? "danger" : "primary"} full`}>
            {busy ? <Busy>جاري تنفيذ الإجراء</Busy> : label}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}
export function Reason() {
  return (
    <div className="field">
      <label htmlFor="action-reason">سبب القرار</label>
      <textarea
        name="reason"
        id="action-reason"
        required
        maxLength={1000}
        rows={3}
      />
    </div>
  );
}
export function ContactFields() {
  return (
    <>
      <Field
        label="الاسم"
        name="displayName"
        required
        minLength={2}
        maxLength={100}
      />
      <Field
        label="البريد الإلكتروني"
        name="email"
        type="email"
        required
        maxLength={254}
        dir="ltr"
      />
      <Field
        label="رقم الهاتف"
        name="phone"
        type="tel"
        required
        maxLength={40}
        dir="ltr"
      />
    </>
  );
}
export const contact = (form: FormData) => ({
  displayName: form.get("displayName"),
  email: form.get("email"),
  phone: form.get("phone"),
});
export function Invitation({
  data,
  onClose,
}: {
  data: NewInvite;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [link, setLink] = useState(""),
    [error, setError] = useState("");
  useEffect(() => { setLink(invitationLink(window.location.origin, data.token)); }, [data.token]);
  return (
    <Modal title="دعوة تفعيل الحساب" onClose={onClose}>
      <p className="muted">
        انسخ الرابط وابعته لصاحب الحساب بشكل خاص. هيفتح على شاشة التفعيل مباشرة، وبعدها يدخل على مهامه.
      </p>
      <div className="field invite-secret">
        <label htmlFor="invite-secret">رابط الدعوة</label>
        <textarea
          id="invite-secret"
          value={link}
          readOnly
          dir="ltr"
          rows={2}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <p className="muted">ينتهي في {date(data.expiresAt)}</p>
      <Notice text={error} />
      <button
        className="primary full"
        disabled={!link}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          } catch {
            setError("تعذر النسخ تلقائيًا؛ حدد الرابط وانسخه من الحقل.");
          }
        }}
      >
        {copied ? (
          <>
            <Check size={17} />
            تم النسخ
          </>
        ) : (
          <>
            <Copy size={17} />
            نسخ رابط الدعوة
          </>
        )}
      </button>
      <small className="muted">
        إصدار رمز جديد يلغي الدعوة السابقة غير المقبولة.
      </small>
    </Modal>
  );
}
export function BranchFields({ branch }: { branch?: Branch }) {
  return (
    <>
      <Field
        label="اسم الفرع"
        name="name"
        required
        maxLength={150}
        defaultValue={branch?.name ?? ""}
      />
      <Field
        label="العنوان بالتفصيل"
        name="address"
        required
        maxLength={500}
        defaultValue={branch?.address ?? ""}
      />
      <div className="form-grid">
        <Field
          label="المحافظة"
          name="governorate"
          required
          maxLength={100}
          defaultValue={branch?.governorate ?? ""}
        />
        <Field
          label="المدينة"
          name="city"
          required
          maxLength={100}
          defaultValue={branch?.city ?? ""}
        />
      </div>
      <LocationPicker latitude={branch?.latitude} longitude={branch?.longitude} />
      <Field
        label="رقم التواصل (اختياري)"
        name="contactPhone"
        type="tel"
        maxLength={40}
        dir="ltr"
        defaultValue={branch?.contactPhone ?? ""}
      />
      <Field
        label="مواعيد العمل (اختياري)"
        name="openingHours"
        maxLength={1000}
        defaultValue={branch?.openingHours ?? ""}
      />
      {!branch && <PriceFields />}
    </>
  );
}
export function PriceFields({ branch }: { branch?: Branch }) {
  return (
    <div className="form-grid">
      <Field
        label="سعر الزيارة بالنقاط"
        name="visitPricePoints"
        type="number"
        required
        min={1}
        max={2147483647}
        step={1}
        defaultValue={branch?.visitPricePoints ?? ""}
      />
      <Field
        label="مدة الجلسة بالدقائق"
        name="sessionMinutes"
        type="number"
        required
        min={1}
        max={2147483647}
        step={1}
        defaultValue={branch?.sessionMinutes ?? ""}
      />
    </div>
  );
}
export function branchBody(form: FormData, editing: boolean) {
  const phone = String(form.get("contactPhone") ?? "").trim();
  const point = requiredLocation(form.get("latitude"), form.get("longitude"));
  return {
    name: form.get("name"),
    address: form.get("address"),
    governorate: form.get("governorate"),
    city: form.get("city"),
    ...point,
    ...(phone
      ? { contactPhone: phone }
      : editing
        ? { contactPhone: null }
        : {}),
    openingHours: form.get("openingHours"),
    ...(!editing
      ? {
          visitPricePoints: Number(form.get("visitPricePoints")),
          sessionMinutes: Number(form.get("sessionMinutes")),
        }
      : {}),
  };
}
