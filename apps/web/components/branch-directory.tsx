"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Clock, Phone, Search, Navigation, QrCode, SlidersHorizontal, X } from "lucide-react";
import { api, date, message } from "../lib/client";
import { branchDirections, branchPhone } from "../lib/branch-links";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
export type DirectoryBranch = {
  distanceKm?: number;
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
type Page = { items: DirectoryBranch[]; nextCursor: string | null; asOf: string };

type Position = { latitude: number; longitude: number };
export function BranchDirectory({onShowQr}:{onShowQr?:()=>void}) {
 const [q,setQ]=useState(""),[governorate,setGovernorate]=useState(""),[city,setCity]=useState(""),[applied,setApplied]=useState(""),[result,setResult]=useState<Page|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState<DirectoryBranch|null>(null),[position,setPosition]=useState<Position|null>(null),[locating,setLocating]=useState(false),[locationError,setLocationError]=useState("");
 const generation=useRef(0), locationGeneration=useRef(0);
 function query(at:Position|null=position) {
  return new URLSearchParams({limit:"12",...(q.trim()?{q:q.trim()}:{}),...(governorate.trim()?{governorate:governorate.trim()}:{}),...(city.trim()?{city:city.trim()}:{}),...(at?{latitude:String(at.latitude),longitude:String(at.longitude)}:{})}).toString();
 }
 async function load(value:string,cursor?:string) {
  const current=++generation.current;setBusy(true);setError("");setApplied(value);
  try{const p=await api<Page>(`directory/branches?${value}${cursor?"&cursor="+cursor:""}`);if(current!==generation.current)return;
   setResult(old=>({...p,items:cursor?[...(old?.items??[]),...p.items.filter(b=>!old?.items.some(x=>x.id===b.id))]:p.items}));setApplied(value);
  }catch(e){if(current===generation.current)setError(message(e));}finally{if(current===generation.current)setBusy(false);}
 }
 useEffect(()=>{void load("limit=12");return()=>{generation.current++;locationGeneration.current++;};},[]);
 function search(e:FormEvent){e.preventDefault();if(busy||locating)return;setResult(null);void load(query());}
 function nearest(){
  if(busy||locating)return;
  if(!navigator.geolocation){setLocationError("الموقع مش متاح على جهازك. ابحث باسم المنطقة أو الجيم.");return;}
  const current=++locationGeneration.current;setLocating(true);setLocationError("");
  navigator.geolocation.getCurrentPosition(p=>{
   if(current!==locationGeneration.current)return;
   const at={latitude:p.coords.latitude,longitude:p.coords.longitude};setPosition(at);setLocating(false);setResult(null);void load(query(at));
  },e=>{if(current!==locationGeneration.current)return;setLocating(false);setLocationError(e.code===1?"السماح بالموقع مقفول. تقدر تبحث باسم منطقتك، أو تسمح بالموقع من إعدادات المتصفح.":"تعذر تحديد موقعك. جرّب مرة تانية أو ابحث باسم منطقتك.");},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});
 }
 return <>
  <section className="card directory-search">
   <h2>اختار جيم تمرينتك</h2><p className="muted">شوف سعر الزيارة والمكان، وافتح الطريق للجيم المناسب.</p>
   <button className="primary full nearby-button" disabled={busy||locating} onClick={nearest}>{locating?<Busy>بنحدد مكانك</Busy>:<><Navigation size={20}/>{position?"تحديث الأقرب لمكاني":"الجيمات الأقرب لمكاني"}</>}</button>
   <small className="muted">الموقع يُستخدم لترتيب النتائج لما تضغط الزر، ومش بيتحفظ في حسابك.</small>
   <Notice text={locationError}/>
   <form onSubmit={search}><fieldset disabled={busy||locating}>
    <div className="directory-search-row"><Field label="ابحث عن جيم أو منطقة" value={q} maxLength={80} onChange={e=>setQ(e.target.value)} placeholder="اسم الجيم، المدينة أو المنطقة"/><button className="secondary" aria-label="بحث عن الجيمات"><Search size={20}/></button></div>
    <details className="directory-filters"><summary><SlidersHorizontal size={16}/>تحديد المحافظة والمدينة</summary><div className="form-grid"><Field label="المحافظة" value={governorate} maxLength={80} onChange={e=>setGovernorate(e.target.value)}/><Field label="المدينة" value={city} maxLength={80} onChange={e=>setCity(e.target.value)}/></div><button className="secondary compact">تطبيق التحديد</button></details>
   </fieldset></form>
  </section>
  <Notice text={error}/>
  {result&&<div className="section-toolbar"><p className="muted">{new URLSearchParams(applied).has("latitude")?"مرتّبة من الأقرب ليك · المسافة بخط مستقيم تقريبًا":"الفروع المتاحة"} · {result.items.length} فرع</p>{position&&<button className="text-button" disabled={busy||locating} onClick={()=>{setPosition(null);setResult(null);void load(query(null));}}><X size={15}/>إلغاء الموقع</button>}</div>}
  {busy&&!result?<section className="card"><Busy>بنجيب الجيمات</Busy></section>:result&&!result.items.length?<section className="card"><Empty title="مفيش فروع مطابقة حاليًا">جرّب منطقة تانية أو امسح التحديد. الجيم يظهر بعد تفعيل الفرع واعتماد سعره.</Empty><button className="secondary full" onClick={()=>{setQ("");setGovernorate("");setCity("");setPosition(null);setResult(null);void load("limit=12");}}>عرض كل الجيمات</button></section>:null}
  {error&&<button className="secondary full" disabled={busy} onClick={()=>void load(applied||query())}>إعادة المحاولة</button>}
  <div className="directory-grid">{result?.items.map(branch=><DirectoryCard key={branch.id} branch={branch} onOpen={()=>setSelected(branch)}/>)}</div>
  {result?.nextCursor&&<button className="secondary full" disabled={busy||locating} onClick={()=>void load(applied,result.nextCursor!)}>{busy?<Busy/>:"جيمات أكتر"}</button>}
  {selected&&<BranchDetails key={selected.id} initial={selected} onClose={()=>setSelected(null)} onShowQr={onShowQr}/>}
 </>;
}
export function DirectoryCard({branch:b,onOpen}:{branch:DirectoryBranch;onOpen:()=>void}) {
 const directions=branchDirections(b.latitude,b.longitude);
 return <article className="card directory-card">
  <div className="section-toolbar"><span className="eyebrow">{b.gym.name}</span>{b.distanceKm!==undefined&&<span className="distance-badge"><Navigation size={14}/>{b.distanceKm<1?`${Math.round(b.distanceKm*1000)} متر`:`${b.distanceKm.toFixed(1)} كم`}</span>}</div>
  <h3>{b.name}</h3><p className="muted"><MapPin size={16}/>{b.city} · {b.governorate}</p><p className="directory-address">{b.address}</p>
  <div className="directory-price"><strong>{b.visitPricePoints}<small> نقطة / زيارة</small></strong><span><Clock size={15}/>{b.sessionMinutes} دقيقة</span></div>
  <div className="directory-actions"><button className="secondary" onClick={onOpen}>التفاصيل والمواعيد</button>{directions&&<a className="primary" href={directions} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Navigation size={17}/>الاتجاهات</a>}</div>
 </article>;
}
function BranchDetails({
  initial,
  onClose,
  onShowQr,
}: {
  initial: DirectoryBranch;
  onClose: () => void;
  onShowQr?: () => void;
}) {
  const [branch, setBranch] = useState<DirectoryBranch | null>(null),
    [asOf, setAsOf] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ branch: DirectoryBranch; asOf: string }>(`directory/branches/${initial.id}`)
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
  const map = branch ? branchDirections(branch.latitude, branch.longitude) : null,
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
              ابدأ الطريق للجيم
            </a>
          )}
          {onShowQr && <button className="secondary full" onClick={onShowQr}><QrCode size={18}/>وصلت الجيم؟ افتح رمز الدخول</button>}
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

