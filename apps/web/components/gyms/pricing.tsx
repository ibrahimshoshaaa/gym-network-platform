"use client";
import { useState } from "react";
import { RefreshCw, FileCheck2 } from "lucide-react";
import { date } from "../../lib/client";
import { Busy, Empty, Modal, Notice } from "../ui";
import {
  More,
  Mutation,
  Reason,
  Status,
  usePage,
  type Pricing,
} from "./shared";
export function PriceReviews() {
  const list = usePage<Pricing>("admin/price-change-requests"),
    [selected, setSelected] = useState<Pricing | null>(null),
    [success, setSuccess] = useState("");
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          اعتماد السعر لا يفعّل الفرع تلقائيًا؛ تفعيل الفرع خطوة منفصلة.
        </p>
        <button
          className="secondary compact"
          disabled={list.loading}
          onClick={() => void list.refresh()}
        >
          <RefreshCw size={16} />
          تحديث الطلبات
        </button>
      </div>
      <Notice text={list.error} />
      <Notice text={success} success />
      <section className="card table-card">
        <div className="table-heading">
          <h2>طلبات أسعار الزيارات</h2>
          <span className="badge pending">قيد المراجعة</span>
        </div>
        {list.loading && !list.rows.length ? (
          <div className="loading-block">
            <Busy />
          </div>
        ) : !list.rows.length && !list.error ? (
          <Empty title="لا توجد طلبات أسعار معلقة">
            طلبات الفروع الجديدة وتغيير الأسعار ستظهر هنا.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>الجيم والفرع</th>
                  <th>سعر الزيارة</th>
                  <th>مدة الجلسة</th>
                  <th>حالة الجيم</th>
                  <th>القرار</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.branch?.gym.name}</strong>
                      <small>{row.branch?.name}</small>
                    </td>
                    <td>
                      {row.visitPricePoints} نقطة
                      <small>
                        {row.baseVersion
                          ? `السابق: ${row.previousPricePoints}`
                          : "سعر أولي للفرع"}
                      </small>
                    </td>
                    <td>
                      {row.sessionMinutes} دقيقة
                      <small>
                        {row.baseVersion
                          ? `السابق: ${row.previousSessionMinutes}`
                          : "مدة مقترحة"}
                      </small>
                    </td>
                    <td>
                      <Status value={row.branch?.gym.status ?? "PENDING"} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(row)}
                      >
                        <FileCheck2 size={16} />
                        مراجعة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <More list={list} />
      </section>
      {selected && (
        <Mutation<Pricing>
          title="مراجعة سعر الزيارة"
          path={`admin/price-change-requests/${selected.id}/review`}
          onClose={() => setSelected(null)}
          onDone={(result) => {
            setSelected(null);
            setSuccess(
              result.status === "APPROVED"
                ? "تم اعتماد السعر. يمكنك تفعيل الفرع من إدارة الجيمات بعد اكتمال بياناته."
                : "تم رفض طلب السعر، ولم يتغير السعر المعتمد سابقًا.",
            );
            void list.refresh();
          }}
          build={(form) => ({
            decision: form.get("decision"),
            reason: form.get("reason"),
          })}
          label="تسجيل القرار"
        >
          <div className="subtle-box price-proposal">
            <strong>
              {selected.branch?.gym.name} · {selected.branch?.name}
            </strong>
            <p>
              {selected.visitPricePoints} نقطة للزيارة ·{" "}
              {selected.sessionMinutes} دقيقة
            </p>
            <p>سبب الطلب: {selected.reason}</p>
          </div>
          {selected.branch?.gym.status !== "ACTIVE" && (
            <Notice text="الجيم غير نشط حاليًا. فعّله من إدارة الجيمات قبل مراجعة السعر." />
          )}
          <div className="field">
            <label htmlFor="price-review-decision">القرار</label>
            <select
              name="decision"
              id="price-review-decision"
              required
              defaultValue=""
            >
              <option value="">اختر القرار</option>
              <option value="APPROVED">اعتماد السعر والمدة</option>
              <option value="REJECTED">رفض الطلب</option>
            </select>
          </div>
          <Reason />
        </Mutation>
      )}
    </>
  );
}
export function PriceHistory({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const list = usePage<Pricing>(path);
  return (
    <Modal title="سجل أسعار الزيارة" onClose={onClose}>
      <Notice text={list.error} />
      {list.loading && !list.rows.length ? (
        <Busy />
      ) : !list.rows.length && !list.error ? (
        <Empty title="لا توجد طلبات أسعار" />
      ) : (
        <div className="timeline">
          {list.rows.map((row) => (
            <article key={row.id}>
              <div className="section-toolbar">
                <strong>
                  {row.visitPricePoints} نقطة · {row.sessionMinutes} دقيقة
                </strong>
                <Status value={row.status} />
              </div>
              <small>{date(row.createdAt)}</small>
              <p>{row.reason}</p>
              {row.reviewReason && (
                <p className="muted">ملاحظة المراجعة: {row.reviewReason}</p>
              )}
            </article>
          ))}
        </div>
      )}
      <More list={list} />
    </Modal>
  );
}
