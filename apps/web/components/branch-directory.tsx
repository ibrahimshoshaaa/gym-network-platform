"use client";
import {BookingComposer} from "./bookings";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, Clock, Phone, Search, Navigation, QrCode, ChevronDown as ChevronDownIcon, X, Map, List, ArrowLeft, Circle, Dumbbell } from "lucide-react";
import { api, date, message } from "../lib/client";
import { branchDirections, branchPhone } from "../lib/branch-links";
import { Busy, Empty, Field, Modal, Notice } from "./ui";
import {Fact} from "./portal-ui";
import { BranchMap } from "./branch-map";
export type DirectoryBranch = {
  images?:{id:string;url:string;purpose:string}[];
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
 const [showMap,setShowMap]=useState(false),[minPrice,setMinPrice]=useState(""),[maxPrice,setMaxPrice]=useState("");
 const generation=useRef(0), locationGeneration=useRef(0);
 function query(at:Position|null=position) {
  return new URLSearchParams({limit:"12",...(q.trim()?{q:q.trim()}:{}),...(governorate.trim()?{governorate:governorate.trim()}:{}),...(city.trim()?{city:city.trim()}:{}),...(minPrice?{minPrice}:{}),...(maxPrice?{maxPrice}:{}),...(at?{latitude:String(at.latitude),longitude:String(at.longitude)}:{})}).toString();
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
 return <div className="directory-browser">
  <section className="directory-search" aria-label="البحث عن الجيمات">
   <form onSubmit={search}><fieldset disabled={busy||locating}>
    <div className="directory-search-row"><Search size={21}/><input aria-label="ابحث عن جيم أو منطقة" value={q} maxLength={80} onChange={e=>setQ(e.target.value)} placeholder="اسم الجيم، المدينة أو المنطقة"/><button type="submit" aria-label="بحث عن الجيمات"><ArrowLeft size={23}/></button></div>
   </fieldset></form>
   <div className="directory-location-row"><button className="nearby-button" aria-label="الجيمات الأقرب لمكاني" disabled={busy||locating} onClick={nearest}>{locating?<Busy>بنحدد مكانك</Busy>:<><Navigation size={17}/>{position?"تحديث موقعي":"الأقرب لموقعي"}</>}</button><button className="directory-view-toggle" type="button" aria-label={showMap?"عرض قائمة الجيمات":"اعرض الفروع على الخريطة"} aria-pressed={showMap} disabled={!result?.items.length} onClick={()=>setShowMap(v=>!v)}>{showMap?<List size={23}/>:<Map size={23}/>}</button></div>
   <Notice text={locationError}/>
   <form onSubmit={search}><fieldset disabled={busy||locating}><details className="directory-filters"><summary>تصفية بسعر الزيارة<ChevronDownIcon/></summary><div className="form-grid"><Field label="المحافظة" value={governorate} maxLength={80} onChange={e=>setGovernorate(e.target.value)}/><Field label="المدينة" value={city} maxLength={80} onChange={e=>setCity(e.target.value)}/><Field label="أقل سعر بالنقاط" type="number" value={minPrice} min={1} onChange={e=>setMinPrice(e.target.value)}/><Field label="أعلى سعر بالنقاط" type="number" value={maxPrice} min={Number(minPrice)||1} onChange={e=>setMaxPrice(e.target.value)}/></div><button className="secondary compact">تطبيق التحديد</button><small className="muted">الموقع لترتيب النتائج عند طلبك فقط، ولا يُحفظ في حسابك.</small></details></fieldset></form>
  </section>
  <Notice text={error}/>
  {result&&<div className="section-toolbar"><p className="muted">{new URLSearchParams(applied).has("latitude")?"مرتّبة من الأقرب ليك · المسافة بخط مستقيم تقريبًا":"الفروع المتاحة"} · {result.items.length} فرع</p>{position&&<button className="text-button" disabled={busy||locating} onClick={()=>{setPosition(null);setResult(null);void load(query(null));}}><X size={15}/>إلغاء الموقع</button>}</div>}
  {busy&&!result?<section className="card"><Busy>بنجيب الجيمات</Busy></section>:result&&!result.items.length?<section className="card"><Empty title="مفيش فروع مطابقة حاليًا">جرّب منطقة تانية أو امسح التحديد. الجيم يظهر بعد تفعيل الفرع واعتماد سعره.</Empty><button className="secondary full" onClick={()=>{setQ("");setGovernorate("");setCity("");setPosition(null);setMinPrice("");setMaxPrice("");setResult(null);void load("limit=12");}}>عرض كل الجيمات</button></section>:null}
  {error&&<button className="secondary full" disabled={busy} onClick={()=>void load(applied||query())}>إعادة المحاولة</button>}
  {showMap&&result&&<BranchMap branches={result.items} onSelect={setSelected}/>}
  <div className="directory-grid" hidden={showMap}>{result?.items.map(branch=><DirectoryCard key={branch.id} branch={branch} onOpen={()=>setSelected(branch)}/>)}</div>
  {result?.nextCursor&&<button className="secondary full" disabled={busy||locating} onClick={()=>void load(applied,result.nextCursor!)}>{busy?<Busy/>:"جيمات أكتر"}</button>}
  {selected&&<BranchDetails key={selected.id} initial={selected} onClose={()=>setSelected(null)} onShowQr={onShowQr}/>}
 </div>;
}
export function DirectoryCard({branch:b,onOpen}:{branch:DirectoryBranch;onOpen:()=>void}) {
 const image=b.images?.find(i=>i.purpose==='LOGO')??b.images?.[0];
 return <article className="card directory-card">
  <button className="directory-card-open" onClick={onOpen} aria-label={`تفاصيل ${b.gym.name} · ${b.name}`}>
   <div className="directory-identity"><span className="directory-thumbnail">{image?<img src={image.url} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>:null}<Dumbbell size={26}/></span><div><h3>{b.gym.name}</h3><p className="directory-branch-name">{b.name}</p><p className="directory-region">{b.city} · {b.governorate}</p></div></div>
   <div className="directory-price"><span className="directory-price-chip"><Circle size={14}/>{b.visitPricePoints} نقطة / زيارة</span><span><Clock size={14}/>{b.sessionMinutes} دقيقة</span>{b.distanceKm!==undefined&&<span><Navigation size={14}/>{b.distanceKm<1?`${Math.round(b.distanceKm*1000)} متر`:`${b.distanceKm.toFixed(1)} كم`}</span>}</div>
   <div className="directory-card-footer"><strong>تفاصيل الجيم والاتجاهات</strong><ArrowLeft size={18}/></div>
  </button>
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
  const [bookingLocked,setBookingLocked]=useState(false);
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
    <Modal title="تفاصيل الجيم" onClose={onClose} locked={bookingLocked}>
      <Notice text={error} />
      {loading ? (
        <Busy />
      ) : branch ? (
        <>
          <DirectoryCard branch={branch} onOpen={()=>{}}/>
          <h2>عن المكان</h2><section className="card"><p>{branch.gym.description}</p><Fact label="العنوان">{branch.address}</Fact>{branch.openingHours&&<Fact label="مواعيد العمل">{branch.openingHours}</Fact>}{branch.contactPhone&&<p>{phone?<a className="text-button" href={phone} dir="ltr"><Phone size={18}/>{branch.contactPhone}</a>:<span dir="ltr">{branch.contactPhone}</span>}</p>}</section>
          <h2>الموقع</h2><div className="native-detail-map"><BranchMap branches={[branch]} onSelect={()=>{}}/></div>
          {map&&<a className="primary full" href={map} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><MapPin size={20}/>افتح الاتجاهات</a>}
          <BookingComposer branch={branch} onLocked={setBookingLocked} onDone={()=>{onClose();onShowQr?.();}}/>
          {branch.images?.slice(1).map(i=><img key={i.id} className="native-place-photo" src={i.url} alt="صورة من الفرع" loading="lazy"/>)}

        </>
      ) : (
        <Empty title="تفاصيل الفرع غير متاحة حاليًا">
          قد يكون الفرع توقف أو تغيرت بياناته؛ حدّث نتائج الدليل.
        </Empty>
      )}
    </Modal>
  );
}


