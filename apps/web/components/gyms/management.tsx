"use client";
import {StaffDelegation} from "../staff-delegation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Plus,
  RefreshCw,
  Pencil,
  Users,
  Mail,
  History,
  CirclePause,
  CircleCheck,
} from "lucide-react";
import { api, date, decimal, message } from "../../lib/client";
import { Busy, Empty, Field, Notice } from "../ui";
import {
  BranchFields,
  ContactFields,
  Invitation,
  More,
  Mutation,
  PriceFields,
  Reason,
  Status,
  branchBody,
  contact,
  roleText,
  usePage,
  type Gym,
  type Branch,
  type Staff,
  type Invite,
  type NewInvite,
} from "./shared";
import { useListTools } from "../list-tools";
import { BusinessMedia } from "./business-media";
import { BranchSetup } from "./branch-setup";
import { PriceHistory } from "./pricing";
export function GymManagement({ admin,initialGym }: { admin: boolean;initialGym?:string|null }) {
  const list = usePage<Gym>(admin ? "admin/gyms" : "gyms"),
    [selected, setSelected] = useState<string | null>(initialGym??null),
    [creating, setCreating] = useState(false),
    [invitation, setInvitation] = useState<NewInvite | null>(null),
    [success, setSuccess] = useState("");
  const filtered = useListTools(list.rows, g => [g.name,g.contactPhone,g.owner?.displayName,g.owner?.email,g.owner?.phoneE164].filter(Boolean).join(" "), g => g.status, {PENDING:"قيد المراجعة",ACTIVE:"نشط",SUSPENDED:"موقوف",REJECTED:"مرفوض"});
  if (selected)
    return (
      <GymDetails
        key={selected}
        id={selected}
        admin={admin}
        onBack={() => {
          setSelected(null);
          void list.refresh();
        }}
      />
    );
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          {admin
            ? "إضافة الجيمات ودعوة أصحابها، ثم تفعيل الجيمات والفروع."
            : "إدارة بيانات الجيمات والفروع وأسعار الزيارات وصلاحيات الموظفين."}
        </p>
        <div className="actions">
          <button
            className="secondary compact"
            disabled={list.loading}
            onClick={() => void list.refresh()}
          >
            <RefreshCw size={16} />
            تحديث
          </button>
          {admin && (
            <button
              className="primary compact"
              onClick={() => setCreating(true)}
            >
              <Plus size={17} />
              إضافة جيم
            </button>
          )}
        </div>
      </div>
      <Notice text={list.error} />
      <Notice text={success} success />
      {filtered.controls}
      <section className="card table-card">
        <div className="table-heading">
          <h2>{admin ? "الجيمات على المنصة" : "الجيمات الخاصة بك"}</h2>
          <span className="muted">{list.rows.length} جيم محمّل</span>
        </div>
        {list.loading && !list.rows.length ? (
          <div className="loading-block">
            <Busy />
          </div>
        ) : !list.rows.length && !list.error ? (
          <Empty
            title={
              admin ? "ابدأ بإضافة أول جيم" : "لا توجد جيمات مرتبطة بحسابك"
            }
          >
            {admin
              ? "أضف بيانات الجيم وبيانات صاحبه لإصدار دعوة التفعيل."
              : "تأكد من قبول دعوة صاحب المنصة؛ الموظفون يديرون مهام الفرع حسب صلاحياتهم."}
          </Empty>
        ) : (
          <div className="gym-card-list">{filtered.visible.map(gym => <article key={gym.id} className="gym-list-item">
            <div className="section-toolbar"><h3>{gym.name}</h3><Status value={gym.status}/></div>
            {admin && <p className="muted">صاحب الجيم: {gym.owner?.displayName} · <span dir="ltr">{gym.owner?.email}</span></p>}
            <p className="muted">{gym.ownerAcceptedAt ? "صاحب الجيم قبل الدعوة" : "في انتظار قبول دعوة صاحب الجيم"}</p>
            {admin && gym.status === "PENDING" && gym.ownerAcceptedAt && <p className="subtle-box">راجع الجيم وفروعه وأسعار الزيارات واعتمدهم من نفس الشاشة.</p>}
            <button className="primary full" onClick={() => { setSelected(gym.id); window.scrollTo({top:0,behavior:"auto"}); }}><Building2 size={18}/>{admin && gym.status === "PENDING" && gym.ownerAcceptedAt ? "مراجعة الجيم والفروع" : "الفروع وتفاصيل الجيم"}</button>
          </article>)}</div>
        )}
        <More list={list} />
      </section>
      {creating && (
        <Mutation<{ invitation?: NewInvite }>
          title="إضافة جيم ودعوة صاحبه"
          path="admin/gyms"
          onClose={() => setCreating(false)}
          onDone={(result) => {
            setCreating(false);
            setInvitation(result.invitation ?? null);
            setSuccess(
              "تم إنشاء الجيم قيد المراجعة. يلزم قبول دعوة صاحبه قبل التفعيل.",
            );
            void list.refresh();
          }}
          build={(form) => ({
            name: form.get("gymName"),
            description: form.get("description"),
            owner: contact(form),
          })}
          label="إنشاء الجيم وإصدار الدعوة"
        >
          <Field label="اسم الجيم" name="gymName" required maxLength={150} />
          <Field
            label="وصف مختصر (اختياري)"
            name="description"
            maxLength={2000}
          />
          <h3 className="form-divider">بيانات صاحب الجيم</h3>
          <ContactFields />
          <p className="subtle-box">
            لو عنده حساب بالفعل، استخدم نفس بريده ورقمه. سيقبل الدعوة بكلمة
            مروره الحالية؛ الحساب الجديد يحدد كلمة مرور خاصة به.
          </p>
        </Mutation>
      )}
      {invitation && (
        <Invitation data={invitation} onClose={() => setInvitation(null)} />
      )}
    </>
  );
}
type Action =
  | { kind: "gymStatus"; status: string }
  | { kind: "branchStatus"; branch: Branch; status: string }
  | { kind: "createBranch" }
  | { kind: "editBranch"; branch: Branch }
  | { kind: "editGym" }
  | { kind: "price"; branch: Branch }
  | { kind: "inviteStaff"; branch: Branch }
  | { kind: "staffStatus"; staff: Staff }
  | { kind: "revoke"; invite: Invite }
  | { kind: "ownerInvite" }
  | { kind: "reissueStaff"; invite: Invite };
function GymDetails({
  id,
  admin,
  onBack,
}: {
  id: string;
  admin: boolean;
  onBack: () => void;
}) {
  const prefix = admin ? `admin/gyms/${id}` : `gyms/${id}`;
  const [gym, setGym] = useState<Gym | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("branches"),
    [action, setAction] = useState<Action | null>(null),
    [invitation, setInvitation] = useState<NewInvite | null>(null),
    [history, setHistory] = useState<Branch | null>(null),
    [success, setSuccess] = useState("");
  const [delegating,setDelegating]=useState<{user:{id:string;displayName:string};branchId:string}|null>(null);
  const [receivables, setReceivables] = useState<
    { type: string; balancePiasters: string }[]
  >([]);
  const branches = usePage<Branch>(`${prefix}/branches`),
    staff = usePage<Staff>(admin ? null : `gyms/${id}/staff`),
    invites = usePage<Invite>(`${prefix}/invitations`);
  const readGym = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profile, money] = await Promise.all([
        api<Gym>(prefix),
        api<{ accounts: { type: string; balancePiasters: string }[] }>(
          `${prefix}/receivables`,
        ),
      ]);
      setGym(profile);
      setReceivables(money.accounts);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [prefix]);
  useEffect(() => {
    void readGym();
  }, [readGym]);
  function refresh() {
    void readGym();
    void branches.refresh();
    void staff.refresh();
    void invites.refresh();
  }
  function done(result?: NewInvite | { invitation: NewInvite }) {
    setAction(null);
    setSuccess("تم تسجيل التغيير بنجاح.");
    if (result && "token" in result) setInvitation(result);
    else if (result && "invitation" in result) setInvitation(result.invitation);
    refresh();
  }
  const editable =
      !admin && Boolean(gym && ["PENDING", "ACTIVE"].includes(gym.status)),
    active = gym?.status === "ACTIVE";
  return (
    <>
      {delegating&&<StaffDelegation gymId={id} userId={delegating.user.id} branchId={delegating.branchId} name={delegating.user.displayName} onClose={()=>setDelegating(null)}/>}
      <div className="section-toolbar">
        <button className="text-button" onClick={onBack}>
          <ArrowRight size={17} />
          رجوع للجيمات
        </button>
        <button
          className="secondary compact"
          disabled={loading || branches.loading}
          onClick={refresh}
        >
          <RefreshCw size={16} />
          تحديث البيانات
        </button>
      </div>
      <Notice text={error} />
      <Notice text={success} success />
      {!gym ? (
        <section className="card">{loading && <Busy />}</section>
      ) : (
        <>
          <section className="card gym-profile">
            <div className="card-heading">
              <div className="card-icon">
                <Building2 size={23} />
              </div>
              <div>
                <h2>{gym.name}</h2>
                <p>{gym.description || "إدارة الجيم والفروع"}</p>
              </div>
              <Status value={gym.status} />
            </div>
            {admin && gym.owner && (
              <div className="owner-summary">
                <strong>{gym.owner.displayName}</strong>
                <span dir="ltr">{gym.owner.email}</span>
                <span dir="ltr">{gym.owner.phoneE164}</span>
                <span
                  className={`badge ${gym.ownerAcceptedAt ? "approved" : "pending"}`}
                >
                  {gym.ownerAcceptedAt
                    ? "تم قبول الدعوة"
                    : "الدعوة لم تُقبل بعد"}
                </span>
              </div>
            )}
            <div className="owner-summary">
              <strong>
                المستحق المتاح للجيم:{" "}
                {decimal(
                  receivables.find((a) => a.type === "GYM_AVAILABLE")
                    ?.balancePiasters ?? "0",
                )}{" "}
                ج.م
              </strong>
              <small>
                تابع مستحقات الزيارات وصرفها من السحب والتسويات.
              </small>
            </div>
            <div className="actions">
              {admin ? (
                <>
                  {(gym.status === "SUSPENDED" || (gym.status === "PENDING" && !branches.rows.length)) && (
                    <button
                      className="primary compact"
                      disabled={!gym.ownerAcceptedAt || !gym.owner?.isActive}
                      onClick={() =>
                        setAction({ kind: "gymStatus", status: "ACTIVE" })
                      }
                    >
                      <CircleCheck size={17} />
                      تفعيل الجيم
                    </button>
                  )}
                  {gym.status === "ACTIVE" && (
                    <button
                      className="secondary compact"
                      onClick={() =>
                        setAction({ kind: "gymStatus", status: "SUSPENDED" })
                      }
                    >
                      <CirclePause size={17} />
                      إيقاف الجيم
                    </button>
                  )}
                  {gym.status === "PENDING" && (
                    <button
                      className="secondary compact"
                      onClick={() =>
                        setAction({ kind: "gymStatus", status: "REJECTED" })
                      }
                    >
                      رفض الجيم
                    </button>
                  )}
                  {!gym.ownerAcceptedAt &&
                    ["PENDING", "ACTIVE"].includes(gym.status) && (
                      <button
                        className="secondary compact"
                        onClick={() => setAction({ kind: "ownerInvite" })}
                      >
                        <Mail size={17} />
                        إصدار دعوة جديدة للصاحب
                      </button>
                    )}
                </>
              ) : (
                <button
                  className="secondary compact"
                  disabled={!editable}
                  onClick={() => setAction({ kind: "editGym" })}
                >
                  <Pencil size={16} />
                  تعديل بيانات الجيم
                </button>
              )}
            </div>
            {admin && !gym.ownerAcceptedAt && (
              <p className="field-hint">
                التفعيل متاح بعد قبول صاحب الجيم للدعوة.
              </p>
            )}
            {!admin && !editable && (
              <p className="field-hint">
                البيانات للعرض فقط لأن الجيم غير متاح للتعديل حاليًا.
              </p>
            )}
          </section>
          {admin&&<section className="setup-progress" aria-label="خطوات اعتماد الجيم"><div className={gym.ownerAcceptedAt?'complete':''}><strong>١ · دعوة صاحب الجيم</strong><span>{gym.ownerAcceptedAt?'تم قبول الدعوة':'بانتظار صاحب الجيم'}</span></div><div className={gym.status==='ACTIVE'?'complete':''}><strong>٢ · تفعيل الجيم</strong><span>{gym.status==='ACTIVE'?'الجيم مفعّل':'يتم مع اعتماد أول فرع'}</span></div><div><strong>٣ · اعتماد الفروع</strong><span>راجع الموقع والنقاط والمدة، ثم اعتمد الفرع من هنا</span></div></section>}
          <div className="management-tabs" aria-label="إدارة الجيم">
            {[
              ["branches", "الفروع"],
              ["photos", "اللوجو والصور"],
              ...(!admin ? [["staff", "الموظفون"]] : []),
              ["invites", "الدعوات"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={tab === key}
                id={`tab-${key}`}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key!)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "photos" && <BusinessMedia gymId={id} branches={branches.rows} more={Boolean(branches.cursor)} onMore={()=>void branches.more()}/>}
          {tab === "branches" && (
            <section
              id="management-branches"
              aria-labelledby="tab-branches"
              className="card table-card"
            >
              <div className="table-heading">
                <h2>{admin ? "مراجعة الفروع وتفعيلها" : "فروع الجيم"}</h2>
                {!admin && (
                  <button
                    className="primary compact"
                    disabled={!editable}
                    onClick={() => setAction({ kind: "createBranch" })}
                  >
                    <Plus size={16} />
                    إضافة فرع
                  </button>
                )}
              </div>
              <div className="list-notice">
                <Notice text={branches.error} />
              </div>
              {branches.loading && !branches.rows.length ? (
                <div className="loading-block">
                  <Busy />
                </div>
              ) : !branches.rows.length && !branches.error ? (
                <Empty title="لا توجد فروع بعد">
                  {admin
                    ? "صاحب الجيم يضيف الفرع ويقترح سعر الزيارة، ثم تراجع السعر وتفعّل الفرع."
                    : "أضف بيانات الفرع وسعر الزيارة المقترح لبدء مراجعته."}
                </Empty>
              ) : admin ? (<div className="branch-setup-list">{branches.rows.map(branch=><BranchSetup key={branch.id} gym={gym} branch={branch} onDone={result=>{setSuccess(result==='rejected'?'تم رفض مقترح السعر، وحالة تشغيل الفرع لم تتغير.':'تم اعتماد البيانات وتحديث حالة الجيم والفرع.');refresh();}} onSuspend={()=>setAction({kind:'branchStatus',branch,status:'SUSPENDED'})} onResume={()=>setAction({kind:'branchStatus',branch,status:'ACTIVE'})}/>)}</div>) : (
                <div className="table-scroll">
                  <table className="mobile-records">
                    <thead>
                      <tr>
                        <th>الفرع</th>
                        <th>الحالة</th>
                        <th>سعر الزيارة</th>
                        <th>الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branches.rows.map((branch) => {
                        const ready =
                          active &&
                          gym.ownerAcceptedAt &&
                          gym.owner?.isActive &&
                          branch.pricingVersion > 0 &&
                          branch.priceApprovedAt &&
                          branch.latitude !== null &&
                          branch.longitude !== null &&
                          branch.address &&
                          branch.city &&
                          branch.governorate;
                        return (
                          <tr key={branch.id}>
                            <td data-label="الفرع">
                              <strong>{branch.name}</strong>
                              <small>
                                {branch.governorate} · {branch.city}
                              </small>
                              <small>{branch.address}</small>
                            </td>
                            <td data-label="الحالة">
                              <Status value={branch.status} />
                            </td>
                            <td data-label="سعر الزيارة">
                              {branch.visitPricePoints} نقطة
                              <small>
                                {branch.sessionMinutes} دقيقة ·{" "}
                                {branch.pricingVersion
                                  ? "سعر معتمد"
                                  : "السعر غير معتمد"}
                              </small>
                            </td>
                            <td data-label="الإجراءات">
                              <div className="row-actions">
                                {admin ? (
                                  <>
                                    {branch.status !== "ACTIVE" && (
                                      <button
                                        className="text-button"
                                        disabled={!ready}
                                        title={
                                          !ready
                                            ? "يلزم تفعيل الجيم واعتماد السعر واكتمال بيانات الفرع"
                                            : undefined
                                        }
                                        onClick={() =>
                                          setAction({
                                            kind: "branchStatus",
                                            branch,
                                            status: "ACTIVE",
                                          })
                                        }
                                      >
                                        تفعيل الفرع
                                      </button>
                                    )}
                                    {branch.status === "ACTIVE" && (
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          setAction({
                                            kind: "branchStatus",
                                            branch,
                                            status: "SUSPENDED",
                                          })
                                        }
                                      >
                                        إيقاف الفرع
                                      </button>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="text-button"
                                      disabled={!editable}
                                      onClick={() =>
                                        setAction({
                                          kind: "editBranch",
                                          branch,
                                        })
                                      }
                                    >
                                      <Pencil size={14} />
                                      تعديل
                                    </button>
                                    <button
                                      className="text-button"
                                      disabled={!editable}
                                      onClick={() =>
                                        setAction({ kind: "price", branch })
                                      }
                                    >
                                      طلب تغيير السعر
                                    </button>
                                    <button
                                      className="text-button"
                                      onClick={() => setHistory(branch)}
                                    >
                                      <History size={14} />
                                      سجل الأسعار
                                    </button>
                                    <button
                                      className="text-button"
                                      disabled={
                                        !active || branch.status === "SUSPENDED"
                                      }
                                      onClick={() =>
                                        setAction({
                                          kind: "inviteStaff",
                                          branch,
                                        })
                                      }
                                    >
                                      <Users size={14} />
                                      دعوة موظف
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <More list={branches} />
            </section>
          )}
          {tab === "staff" && !admin && (
            <section
              id="management-staff"
              aria-labelledby="tab-staff"
              className="card table-card"
            >
              <div className="table-heading">
                <h2>صلاحيات الموظفين</h2>
                <span className="muted">الدعوات الجديدة من قائمة الفروع</span>
              </div>
              <div className="list-notice">
                <Notice text={staff.error} />
              </div>
              {staff.loading && !staff.rows.length ? (
                <div className="loading-block">
                  <Busy />
                </div>
              ) : !staff.rows.length && !staff.error ? (
                <Empty title="لا توجد صلاحيات موظفين مسجلة">
                  ادعُ كاشيرًا أو مديرًا من إجراءات الفرع؛ سيظهر هنا بعد قبول
                  دعوته.
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table className="mobile-records">
                    <thead>
                      <tr>
                        <th>الموظف</th>
                        <th>الفرع</th>
                        <th>الدور</th>
                        <th>الصلاحية</th>
                        <th>الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staff.rows.map((person) => (
                        <tr key={person.id}>
                          <td data-label="الموظف">
                            <strong>{person.user.displayName}</strong>
                            <small dir="ltr">{person.user.email}</small>
                          </td>
                          <td data-label="الفرع">{person.branch.name}</td>
                          <td data-label="الدور">{roleText(person.role)}</td>
                          <td data-label="الصلاحية">
                            <span
                              className={`badge ${person.active ? "approved" : "neutral"}`}
                            >
                              {person.active ? "مفعّلة" : "موقوفة"}
                            </span>
                          </td>
                          <td data-label="الإجراء">
                            {person.role==="BRANCH_MANAGER"&&person.canDelegate&&<button className="text-button" onClick={()=>setDelegating(person)}>تفويض الصلاحيات</button>}
                            <button
                              className="text-button"
                              disabled={!editable}
                              onClick={() =>
                                setAction({
                                  kind: "staffStatus",
                                  staff: person,
                                })
                              }
                            >
                              {person.active
                                ? "إيقاف الصلاحية"
                                : "تفعيل الصلاحية"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <More list={staff} />
            </section>
          )}
          {tab === "invites" && (
            <section
              id="management-invites"
              aria-labelledby="tab-invites"
              className="card table-card"
            >
              <div className="table-heading">
                <h2>{admin ? "دعوات صاحب الجيم" : "سجل الدعوات"}</h2>
                <span className="muted">الرموز لا تظهر في السجل</span>
              </div>
              <div className="list-notice">
                <Notice text={invites.error} />
              </div>
              {invites.loading && !invites.rows.length ? (
                <div className="loading-block">
                  <Busy />
                </div>
              ) : !invites.rows.length && !invites.error ? (
                <Empty title="لا توجد دعوات" />
              ) : (
                <div className="table-scroll">
                  <table className="mobile-records">
                    <thead>
                      <tr>
                        <th>صاحب الدعوة</th>
                        <th>الدور والفرع</th>
                        <th>الحالة</th>
                        <th>تنتهي في</th>
                        <th>الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.rows.map((invite) => {
                        const expired =
                          new Date(invite.expiresAt) <= new Date();
                        return (
                          <tr key={invite.id}>
                            <td data-label="صاحب الدعوة">
                              <strong>{invite.user.displayName}</strong>
                              <small dir="ltr">{invite.user.email}</small>
                            </td>
                            <td data-label="الدور والفرع">
                              {roleText(invite.role)}
                              <small>{invite.branch?.name ?? "الجيم"}</small>
                            </td>
                            <td data-label="الحالة">
                              <span
                                className={`badge ${invite.acceptedAt ? "approved" : invite.revokedAt || expired ? "neutral" : "pending"}`}
                              >
                                {invite.acceptedAt
                                  ? "مقبولة"
                                  : invite.revokedAt
                                    ? "ملغاة"
                                    : expired
                                      ? "منتهية"
                                      : "بانتظار القبول"}
                              </span>
                            </td>
                            <td className="date-cell" data-label="تنتهي في">
                              {date(invite.expiresAt)}
                            </td>
                            <td data-label="الإجراءات">
                              <div className="row-actions">
                                {gym?.canDelegate&&invite.role==='BRANCH_MANAGER'&&invite.branchId&&!invite.revokedAt&&!expired&&<button className="text-button" onClick={()=>setDelegating({user:{id:invite.userId,displayName:invite.user.displayName},branchId:invite.branchId!})}>تحديد صلاحيات المدير</button>}
                                {!invite.acceptedAt &&
                                  !invite.revokedAt &&
                                  (admin || invite.type === "STAFF") && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        setAction({ kind: "revoke", invite })
                                      }
                                    >
                                      إلغاء الدعوة
                                    </button>
                                  )}
                                {!admin &&
                                  invite.type === "STAFF" &&
                                  !invite.acceptedAt &&
                                  active && (
                                    <button
                                      className="text-button"
                                      onClick={() =>
                                        setAction({
                                          kind: "reissueStaff",
                                          invite,
                                        })
                                      }
                                    >
                                      إصدار رمز جديد
                                    </button>
                                  )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <More list={invites} />
            </section>
          )}
          {action?.kind === "gymStatus" && (
            <Mutation
              title={
                action.status === "ACTIVE"
                  ? "تفعيل الجيم"
                  : action.status === "REJECTED"
                    ? "رفض الجيم"
                    : "إيقاف الجيم"
              }
              path={`admin/gyms/${id}/status`}
              method="PATCH"
              onClose={() => setAction(null)}
              onDone={() => done()}
              danger={action.status !== "ACTIVE"}
              build={(form) => ({
                status: action.status,
                reason: form.get("reason"),
              })}
              label="تسجيل القرار"
            >
              <p className="subtle-box">
                سيتم تغيير حالة «{gym.name}» إلى «
                {action.status === "ACTIVE"
                  ? "نشط"
                  : action.status === "REJECTED"
                    ? "مرفوض"
                    : "موقوف"}
                ». حالة الفروع تُدار بشكل مستقل.
              </p>
              <Reason />
            </Mutation>
          )}
          {action?.kind === "branchStatus" && (
            <Mutation
              title={action.status === "ACTIVE" ? "تفعيل الفرع" : "إيقاف الفرع"}
              path={`admin/branches/${action.branch.id}/status`}
              method="PATCH"
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={(form) => ({
                status: action.status,
                reason: form.get("reason"),
              })}
              danger={action.status !== "ACTIVE"}
              label="تأكيد تغيير الحالة"
            >
              <p className="subtle-box">
                الفرع: {action.branch.name}. التفعيل يتطلب جيمًا نشطًا وسعرًا
                معتمدًا وبيانات موقع مكتملة.
              </p>
              <Reason />
            </Mutation>
          )}
          {action?.kind === "ownerInvite" && (
            <Mutation<NewInvite>
              title="إصدار دعوة جديدة لصاحب الجيم"
              path={`admin/gyms/${id}/owner-invitations`}
              onClose={() => setAction(null)}
              onDone={done}
              build={() => ({})}
              label="إصدار الرمز"
            >
              <p className="subtle-box">
                سيُلغى أي رمز سابق لم يُستخدم لصاحب هذا الجيم. شارك الرمز الجديد
                معه فقط.
              </p>
            </Mutation>
          )}
          {action?.kind === "editGym" && (
            <Mutation
              title="تعديل بيانات الجيم"
              path={`gyms/${id}`}
              method="PATCH"
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={(form) => ({
                name: form.get("name"),
                description: form.get("description"),
                contactPhone: String(form.get("contactPhone")).trim() || null,
              })}
            >
              <Field
                label="اسم الجيم"
                name="name"
                required
                maxLength={150}
                defaultValue={gym.name}
              />
              <Field
                label="الوصف"
                name="description"
                maxLength={2000}
                defaultValue={gym.description ?? ""}
              />
              <Field
                label="رقم التواصل (اختياري)"
                name="contactPhone"
                type="tel"
                dir="ltr"
                maxLength={40}
                defaultValue={gym.contactPhone ?? ""}
              />
            </Mutation>
          )}
          {(action?.kind === "createBranch" ||
            action?.kind === "editBranch") && (
            <Mutation
              title={
                action.kind === "createBranch"
                  ? "إضافة فرع جديد"
                  : "تعديل بيانات الفرع"
              }
              path={
                action.kind === "createBranch"
                  ? `gyms/${id}/branches`
                  : `gyms/${id}/branches/${action.branch.id}`
              }
              method={action.kind === "createBranch" ? "POST" : "PATCH"}
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={(form) => branchBody(form, action.kind === "editBranch")}
            >
              <BranchFields
                branch={
                  action.kind === "editBranch" ? action.branch : undefined
                }
              />
              {action.kind === "createBranch" && (
                <p className="subtle-box">
                  الفرع يبدأ بسعر زيارة مقترح. صاحب المنصة يراجع السعر ثم
                  يفعّل الفرع.
                </p>
              )}
            </Mutation>
          )}
          {action?.kind === "price" && (
            <Mutation
              title="طلب تغيير سعر الزيارة"
              path={`gyms/${id}/branches/${action.branch.id}/price-change-requests`}
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={(form) => ({
                visitPricePoints: Number(form.get("visitPricePoints")),
                sessionMinutes: Number(form.get("sessionMinutes")),
                reason: form.get("reason"),
              })}
              label="إرسال طلب المراجعة"
            >
              <p className="subtle-box">
                الفرع: {action.branch.name}. السعر الحالي يظل مطبقًا حتى اعتماد
                التغيير.
              </p>
              <PriceFields branch={action.branch} />
              <Reason />
            </Mutation>
          )}
          {action?.kind === "inviteStaff" && (
            <Mutation<{ invitation: NewInvite }>
              title={`دعوة موظف · ${action.branch.name}`}
              path={`gyms/${id}/staff-invitations`}
              onClose={() => setAction(null)}
              onDone={done}
              build={(form) => ({
                branchId: action.branch.id,
                role: form.get("role"),
                contact: contact(form),
              })}
              label="إصدار دعوة الموظف"
            >
              <div className="field">
                <label htmlFor="staff-role">الدور في هذا الفرع</label>
                <select name="role" id="staff-role">
                  <option value="CASHIER">كاشير</option>
                  <option value="BRANCH_MANAGER">مدير فرع</option>
                </select>
              </div>
              <ContactFields />
            </Mutation>
          )}
          {action?.kind === "staffStatus" && (
            <Mutation
              title={
                action.staff.active
                  ? "إيقاف صلاحية الموظف"
                  : "تفعيل صلاحية الموظف"
              }
              path={`gyms/${id}/staff/${action.staff.id}`}
              method="PATCH"
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={() => ({ active: !action.staff.active })}
              danger={action.staff.active}
              label="تأكيد تغيير الصلاحية"
            >
              <p className="subtle-box">
                {action.staff.user.displayName} · {roleText(action.staff.role)}{" "}
                · {action.staff.branch.name}. التغيير يخص صلاحية هذا الدور في
                هذا الفرع فقط.
              </p>
            </Mutation>
          )}
          {action?.kind === "revoke" && (
            <Mutation
              title="إلغاء الدعوة"
              path={`invitations/${action.invite.id}/revoke`}
              onClose={() => setAction(null)}
              onDone={() => done()}
              build={() => ({})}
              danger
              label="إلغاء الدعوة"
            >
              <p className="subtle-box">
                سيصبح رمز دعوة {action.invite.user.displayName} غير صالح
                للاستخدام.
              </p>
            </Mutation>
          )}
          {action?.kind === "reissueStaff" && (
            <Mutation<{ invitation: NewInvite }>
              title="إصدار دعوة جديدة للموظف"
              path={`gyms/${id}/staff-invitations`}
              onClose={() => setAction(null)}
              onDone={done}
              build={() => ({
                branchId: action.invite.branchId,
                role: action.invite.role,
                contact: {
                  displayName: action.invite.user.displayName,
                  email: action.invite.user.email,
                  phone: action.invite.user.phoneE164,
                },
              })}
              label="إصدار رمز جديد"
            >
              <p className="subtle-box">
                سيُلغى أي رمز سابق غير مستخدم لنفس الفرع والدور. الموظف:{" "}
                {action.invite.user.displayName}.
              </p>
            </Mutation>
          )}
        </>
      )}
      {invitation && (
        <Invitation data={invitation} onClose={() => setInvitation(null)} />
      )}
      {history && (
        <PriceHistory
          path={`gyms/${id}/branches/${history.id}/pricing-history`}
          onClose={() => setHistory(null)}
        />
      )}
    </>
  );
}
