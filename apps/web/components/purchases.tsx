"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  UploadCloud,
  Copy,
  Check,
  ArrowLeft,
  Building2,
  RefreshCw,
} from "lucide-react";
import {
  api,
  send,
  message,
  decimal,
  minorUnits,
  methodName,
  date,
  type Settings,
  type Page,
  type Topup,
} from "../lib/client";
import { Busy, Empty, Field, Notice } from "./ui";
type Gym = { id: string; name: string; status: string };
type Branch = { id: string; name: string; status: string };
type Quote = {
  points: number;
  chargePiasters: string;
  pricingVersion: number;
  discountBps: number;
  unallocatedPiasters: string;
};
export function Purchases() {
  const [gyms, setGyms] = useState<Gym[]>([]),
    [branches, setBranches] = useState<Branch[]>([]),
    [gym, setGym] = useState(""),
    [branch, setBranch] = useState(""),
    [options, setOptions] = useState<Settings | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [selection, setSelection] = useState("points"),
    [quantity, setQuantity] = useState(""),
    [packId, setPackId] = useState(""),
    [method, setMethod] = useState(""),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoting, setQuoting] = useState(false),
    [uploading, setUploading] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [receiptId, setReceiptId] = useState(""),
    [receiptName, setReceiptName] = useState(""),
    [copied, setCopied] = useState(false),
    [rows, setRows] = useState<Topup[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [listing, setListing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    command = useRef<{ body: string; key: string } | null>(null);
  const busy = submitting || quoting || uploading;
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [access, config, history] = await Promise.all([
        api<{ ownedGyms: Gym[] }>("me/access"),
        api<Settings>("topup-options?kind=BRANCH_STOCK"),
        api<Page<Topup>>("topups?limit=25"),
      ]);
      const active = access.ownedGyms.filter((g) => g.status === "ACTIVE");
      setGyms(active);
      setOptions(config);
      setRows(history.items);
      setCursor(history.nextCursor);
      setGym((old) =>
        active.some((g) => g.id === old) ? old : (active[0]?.id ?? ""),
      );
      setQuote(null);
      setMethod("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    let active = true;
    setBranches([]);
    setBranch("");
    setQuote(null);
    if (gym)
      api<BranchPage>(`gyms/${gym}/branches?limit=100`)
        .then((result) => {
          if (active) {
            const rows = result.items.filter((b) => b.status === "ACTIVE");
            setBranches(rows);
            setBranch(rows[0]?.id ?? "");
          }
        })
        .catch((e) => {
          if (active) setError(message(e));
        });
    return () => {
      active = false;
    };
  }, [gym]);
  type BranchPage = Page<Branch>;
  function getSelection() {
    if (!branch) throw new Error("اختر فرعًا نشطًا أولًا.");
    const base = { kind: "BRANCH_STOCK", receivingBranchId: branch };
    if (selection === "package") {
      const pack = options?.packages.find((p) => p.id === packId);
      if (!pack) throw new Error("اختر الباقة.");
      return { ...base, packageId: pack.id, packageVersion: pack.version };
    }
    if (selection === "amount")
      return { ...base, amountPiasters: minorUnits(quantity) };
    if (
      !/^\d+$/.test(quantity) ||
      !Number.isSafeInteger(Number(quantity)) ||
      Number(quantity) < 1 ||
      Number(quantity) > 2147483647
    )
      throw new Error("اكتب عدد نقاط صحيحًا أكبر من صفر.");
    return { ...base, points: Number(quantity) };
  }
  async function calculate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setQuoting(true);
    setError("");
    setSuccess("");
    try {
      setQuote(await api<Quote>("topup-quotes", send(getSelection())));
    } catch (e) {
      setError(message(e));
      setQuote(null);
    } finally {
      setQuoting(false);
    }
  }
  async function upload(file?: File) {
    if (!file || busy) return;
    setError("");
    setReceiptId("");
    setReceiptName("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5242880
    ) {
      setError("اختار صورة JPG أو PNG أو WebP بحد أقصى 5 ميجابايت.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    try {
      const response = await api<{ id: string }>("receipts", {
        method: "POST",
        headers: { "content-type": file.type },
        body: file,
      });
      setReceiptId(response.id);
      setReceiptName(file.name);
    } catch (e) {
      setError(message(e));
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !quote) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const channel = options?.paymentMethods.find((m) => m.type === method);
      if (!channel || !receiptId)
        throw new Error("اختر طريقة التحويل وارفع الإيصال أولًا.");
      const body = {
        ...getSelection(),
        pricingVersion: quote.pricingVersion,
        paymentMethod: method,
        paymentMethodVersion: channel.version,
        receiptId,
      };
      const canonical = JSON.stringify(body);
      if (!command.current || command.current.body !== canonical)
        command.current = { body: canonical, key: crypto.randomUUID() };
      const result = await api<Topup>("topups", {
        ...send(body),
        headers: {
          "content-type": "application/json",
          "idempotency-key": command.current.key,
        },
      });
      setRows((old) => [result, ...old.filter((r) => r.id !== result.id)]);
      setReceiptId("");
      setReceiptName("");
      setQuote(null);
      command.current = null;
      if (fileRef.current) fileRef.current.value = "";
      setSuccess(
        "تم إرسال الطلب للمراجعة. النقاط ستُضاف لمخزون الفرع بعد موافقة صاحب المنصة.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setSubmitting(false);
    }
  }
  async function more() {
    if (!cursor || listing) return;
    setListing(true);
    try {
      const result = await api<Page<Topup>>(`topups?limit=25&cursor=${cursor}`);
      setRows((old) => [
        ...old,
        ...result.items.filter(
          (item) => !old.some((row) => row.id === item.id),
        ),
      ]);
      setCursor(result.nextCursor);
    } catch (e) {
      setError(message(e));
    } finally {
      setListing(false);
    }
  }
  const channel = options?.paymentMethods.find((m) => m.type === method);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          اشترِ نقاطًا لمخزون أحد فروع الجيم، وتابع حالة المراجعة.
        </p>
        <button
          className="secondary compact"
          disabled={busy || loading}
          onClick={() => void load()}
        >
          <RefreshCw size={16} />
          تحديث البيانات
        </button>
      </div>
      <Notice text={error} />
      <Notice text={success} success />
      {loading ? (
        <section className="card">
          <Busy />
        </section>
      ) : !gyms.length ? (
        <section className="card">
          <Empty title="لا توجد جيمات نشطة مرتبطة بحسابك">
            طلبات شراء النقاط متاحة لصاحب الجيم بعد تفعيل الجيم والفروع.
          </Empty>
        </section>
      ) : !options?.policy || !options.paymentMethods.length ? (
        <section className="card">
          <Empty title="شراء النقاط غير متاح حاليًا">
            تواصل مع صاحب المنصة لاستكمال إعداد الأسعار وحسابات التحويل.
          </Empty>
        </section>
      ) : (
        <div className="settings-grid">
          <section className="card">
            <div className="card-heading">
              <div className="card-icon">
                <Building2 size={22} />
              </div>
              <div>
                <h2>طلب شراء نقاط</h2>
                <p>الخطوة الأولى: حدد الفرع والكمية</p>
              </div>
            </div>
            <form onSubmit={calculate}>
              <fieldset disabled={busy}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="purchase-gym">الجيم</label>
                    <select
                      id="purchase-gym"
                      value={gym}
                      onChange={(e) => {
                        setGym(e.target.value);
                        setQuote(null);
                      }}
                    >
                      {gyms.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="purchase-branch">الفرع</label>
                    <select
                      id="purchase-branch"
                      required
                      value={branch}
                      onChange={(e) => {
                        setBranch(e.target.value);
                        setQuote(null);
                      }}
                    >
                      <option value="">اختر الفرع</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <small className="muted">
                  تظهر الفروع النشطة من أول 100 فرع.
                </small>
                <div className="field">
                  <label htmlFor="selection">طريقة تحديد الكمية</label>
                  <select
                    id="selection"
                    value={selection}
                    onChange={(e) => {
                      setSelection(e.target.value);
                      setQuantity("");
                      setQuote(null);
                    }}
                  >
                    <option value="points">عدد نقاط</option>
                    <option value="amount">مبلغ بالجنيه</option>
                    <option value="package">باقة جاهزة</option>
                  </select>
                </div>
                {selection === "package" ? (
                  <div className="field">
                    <label htmlFor="purchase-package">الباقة</label>
                    <select
                      id="purchase-package"
                      required
                      value={packId}
                      onChange={(e) => {
                        setPackId(e.target.value);
                        setQuote(null);
                      }}
                    >
                      <option value="">اختر باقة</option>
                      {options.packages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label} · {p.points} نقطة
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <Field
                    label={
                      selection === "points" ? "عدد النقاط" : "المبلغ بالجنيه"
                    }
                    required
                    value={quantity}
                    inputMode={selection === "points" ? "numeric" : "decimal"}
                    dir="ltr"
                    onChange={(e) => {
                      setQuantity(e.target.value);
                      setQuote(null);
                    }}
                  />
                )}
                <button className="primary full" disabled={!branch}>
                  {quoting ? (
                    <Busy>جاري حساب القيمة</Busy>
                  ) : (
                    <>
                      حساب قيمة التحويل
                      <ArrowLeft size={17} />
                    </>
                  )}
                </button>
              </fieldset>
            </form>
          </section>
          <section className="card">
            <div className="card-heading">
              <div className="card-icon">
                <UploadCloud size={22} />
              </div>
              <div>
                <h2>التحويل وإرسال الإيصال</h2>
                <p>الخطوة الثانية: حوّل القيمة الموضحة ثم أرسل الطلب</p>
              </div>
            </div>
            {!quote ? (
              <Empty title="ابدأ بحساب قيمة الطلب">
                هنوضح لك الخصم والمبلغ الفعلي المطلوب تحويله.
              </Empty>
            ) : (
              <>
                <div className="quote-total">
                  <span>المبلغ المطلوب تحويله</span>
                  <strong>
                    {decimal(quote.chargePiasters)} <small>ج.م</small>
                  </strong>
                  <p>
                    {quote.points} نقطة · خصم {decimal(quote.discountBps)}%
                  </p>
                </div>
                {quote.unallocatedPiasters !== "0" && (
                  <p className="subtle-box">
                    يتبقى {decimal(quote.unallocatedPiasters)} ج.م من المبلغ
                    المدخل لا يشتري نقطة كاملة. حوّل القيمة المطلوبة أعلاه فقط.
                  </p>
                )}
                <form onSubmit={submit}>
                  <fieldset disabled={busy}>
                    <div className="field">
                      <label htmlFor="payment-channel">طريقة التحويل</label>
                      <select
                        id="payment-channel"
                        required
                        value={method}
                        onChange={(e) => {
                          setMethod(e.target.value);
                          setCopied(false);
                        }}
                      >
                        <option value="">اختر طريقة الدفع</option>
                        {options.paymentMethods.map((m) => (
                          <option value={m.type} key={m.type}>
                            {methodName(m.type)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {channel && (
                      <div className="receiver">
                        <span>حوّل إلى الحساب التالي</span>
                        <div>
                          <strong dir="ltr">{channel.account}</strong>
                          <button
                            className="icon-button"
                            type="button"
                            aria-label="نسخ حساب التحويل"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  channel.account,
                                );
                                setCopied(true);
                              } catch {
                                setError(
                                  "تعذر النسخ تلقائيًا. انسخ الرقم من النص الظاهر.",
                                );
                              }
                            }}
                          >
                            {copied ? <Check size={18} /> : <Copy size={18} />}
                          </button>
                        </div>
                        <p>{channel.accountName}</p>
                        {copied && <small role="status">تم النسخ</small>}
                      </div>
                    )}
                    <div className="upload-box">
                      <UploadCloud size={26} aria-hidden="true" />
                      <label htmlFor="receipt-upload">
                        {receiptName || "ارفع صورة إيصال التحويل"}
                      </label>
                      <input
                        ref={fileRef}
                        id="receipt-upload"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                      <small>JPG / PNG / WebP · حتى 5 ميجابايت</small>
                      {uploading && <Busy>جاري رفع الإيصال</Busy>}
                    </div>
                    <button
                      className="primary full"
                      disabled={!receiptId || !method}
                    >
                      {submitting ? (
                        <Busy>جاري إرسال الطلب</Busy>
                      ) : (
                        "إرسال الطلب للمراجعة"
                      )}
                    </button>
                  </fieldset>
                </form>
              </>
            )}
          </section>
        </div>
      )}
      <section className="card table-card history">
        <div className="table-heading">
          <h2>طلباتك السابقة</h2>
          <span className="muted">النقاط تُضاف بعد الاعتماد</span>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الطلب</th>
                  <th>النقاط</th>
                  <th>القيمة</th>
                  <th>الحالة</th>
                  <th>ملاحظة المراجعة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong dir="ltr">{row.id.slice(0, 8)}</strong>
                      <small>{date(row.createdAt)}</small>
                    </td>
                    <td>{row.points}</td>
                    <td>{decimal(row.chargePiasters)} ج.م</td>
                    <td>
                      <span
                        className={`badge ${row.status === "APPROVED" ? "approved" : row.status === "REJECTED" ? "rejected" : "pending"}`}
                      >
                        {row.status === "APPROVED"
                          ? "معتمد"
                          : row.status === "REJECTED"
                            ? "مرفوض"
                            : "قيد المراجعة"}
                      </span>
                    </td>
                    <td>{row.reviewReason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && (
            <Empty title="لسه مفيش طلبات">
              طلبات شراء النقاط الخاصة بك ستظهر هنا.
            </Empty>
          )
        )}
        {cursor && (
          <div className="load-more">
            <button
              className="secondary"
              disabled={listing}
              onClick={() => void more()}
            >
              {listing ? <Busy /> : "تحميل المزيد"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
