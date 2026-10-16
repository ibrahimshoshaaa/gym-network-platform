export type Identity = {
  id: string;
  displayName: string;
  role: string;
  email: string;
  phone: string;
};
export type Policy = {
  id: string;
  version: number;
  pointPricePiasters: string;
  gymDiscountBps: number;
  redemptionBps: number;
};
export type PaymentMethod = {
  type: "INSTAPAY" | "WALLET";
  account: string;
  accountName: string;
  enabled?: boolean;
  version: number;
};
export type Package = {
  id: string;
  kind: "TRAINEE" | "BRANCH_STOCK";
  label: string;
  points: number;
  version: number;
  enabled: boolean;
};
export type Settings = {
  policy: Policy | null;
  paymentMethods: PaymentMethod[];
  packages: Package[];
};
export type Topup = {
  id: string;
  kind: string;
  requestorUserId: string;
  requestor?: { displayName: string; email: string; phoneE164: string };
  branch?: { name: string; gym: { name: string } } | null;
  receivingBranchId: string | null;
  points: number;
  chargePiasters: string;
  unitPricePiasters: string | null;
  discountBps: number | null;
  status: string;
  paymentMethod: string;
  paymentAccount: string;
  paymentAccountName: string;
  receiptId: string | null;
  reviewReason: string | null;
  createdAt: string;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
const errors: Record<string, string> = {
  INVALID_CREDENTIALS: "راجع بيانات الدخول وحاول تاني.",
  INVALID_INPUT: "راجع الحقول المطلوبة والقيم المدخلة.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
  ACCESS_DENIED: "الحساب ليس لديه صلاحية لتنفيذ هذه الخطوة.",
  STALE_SETTINGS:
    "الإعدادات اتغيرت. حدّث البيانات وراجع السعر وحساب التحويل قبل المتابعة.",
  SERVICE_UNAVAILABLE: "تعذر الاتصال بالخدمة. حاول مرة أخرى.",
  SERVICE_NOT_CONFIGURED: "الخدمة لم تُجهّز بعد. تواصل مع مسؤول المنصة.",
  RATE_LIMITED: "وصلت للحد المسموح للمحاولات. انتظر قليلًا وحاول مرة أخرى.",
  AUTH_BUSY: "الخدمة مشغولة حاليًا. حاول بعد قليل.",
  STORAGE_NOT_CONFIGURED: "رفع الإيصالات لم يُفعّل بعد. تواصل مع مسؤول المنصة.",
  STORAGE_UNAVAILABLE: "تعذر رفع الإيصال. حاول مرة أخرى.",
  INVALID_RECEIPT: "ارفع صورة واضحة بصيغة JPG أو PNG أو WebP.",
  BODY_TOO_LARGE: "حجم الصورة أكبر من 5 ميجابايت.",
  RECEIPT_ALREADY_USED: "الإيصال مرتبط بطلب آخر أو سبق رفعه من حساب آخر.",
  RECEIPT_ACCESS_DENIED: "لا يمكنك عرض هذا الإيصال.",
  PAYMENT_REFERENCE_USED:
    "مرجع التحويل مستخدم في طلب معتمد بالفعل. راجع التحويل.",
  PAYMENT_AMOUNT_MISMATCH: "المبلغ المستلم لا يطابق قيمة الطلب.",
  INVALID_STATE: "حالة الطلب اتغيرت بالفعل. حدّث القائمة.",
  WALLET_EXPIRY_REVIEW_REQUIRED:
    "رصيد المحفظة المنتهي يحتاج تسوية قبل اعتماد شحن جديد.",
  GYM_INACTIVE: "الجيم غير نشط حاليًا.",
  GYM_ACCESS_DENIED: "لا تملك صلاحية لهذا الجيم.",
  BRANCH_ACCESS_DENIED: "الفرع غير متاح لهذا الحساب.",
  PRICING_NOT_CONFIGURED: "صاحب المنصة لم يحدد أسعار النقاط بعد.",
  PAYMENT_METHOD_UNAVAILABLE: "طريقة التحويل غير متاحة حاليًا.",
  PACKAGE_UNAVAILABLE: "الباقة اتغيرت أو لم تعد متاحة.",
  IDEMPOTENCY_CONFLICT:
    "الطلب السابق له بيانات مختلفة. راجع قائمة طلباتك قبل المحاولة.",
  INVITATION_INVALID: "الدعوة انتهت أو استُخدمت. اطلب دعوة جديدة.",
  LEGACY_REQUEST_REVIEW_REQUIRED: "الطلب القديم يحتاج مراجعة وتسوية منفصلة.",
  NOT_FOUND: "البيانات المطلوبة غير موجودة.",
};
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(errors[code] ?? "تعذر إتمام العملية. حاول مرة أخرى.");
  }
}
export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("SERVICE_UNAVAILABLE", 503);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path.startsWith("/api/backend/"))
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(body.code ?? "SERVICE_UNAVAILABLE", response.status);
  }
  return body as T;
}
export const api = <T>(path: string, init?: RequestInit) =>
  request<T>(`/api/backend/${path}`, init);
export const send = (body: unknown, method = "POST") => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
export const message = (e: unknown) =>
  e instanceof Error ? e.message : "تعذر إتمام العملية.";
export function minorUnits(value: string, allowZero = false) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed))
    throw new Error("اكتب رقمًا صحيحًا أو منزلتين عشريتين بحد أقصى.");
  const [whole, fraction = ""] = trimmed.split(".");
  const n = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (n < (allowZero ? 0n : 1n) || n > 9223372036854775807n)
    throw new Error("القيمة المدخلة خارج النطاق المسموح.");
  return n.toString();
}
export function decimal(value: string | number) {
  const n = BigInt(value),
    fraction = String(n % 100n)
      .padStart(2, "0")
      .replace(/0+$/, "");
  return `${n / 100n}${fraction ? `.${fraction}` : ""}`;
}
export const methodName = (type: string) =>
  type === "INSTAPAY" ? "إنستا باي" : "محفظة إلكترونية";
export const date = (value: string) =>
  new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(value));
