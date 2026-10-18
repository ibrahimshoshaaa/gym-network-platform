"use client";
import { useId, useState } from "react";
import { filterRecords } from "../lib/list-filter";
export function useListTools<T>(rows: readonly T[], text: (row:T)=>string, state?: (row:T)=>string, labels: Record<string,string> = {}) {
 const [query,setQuery]=useState(""), [status,setStatus]=useState("");
 const id=useId();
 const visible=filterRecords(rows,query,status,text,state??(()=>""));
 const options=state ? [...new Set(rows.map(state))].filter(Boolean) : [];
 const active=Boolean(query || status);
 return {visible, controls:<div className="list-tools">
  <div className="list-tools-fields"><label className="field" htmlFor={id}>بحث في القائمة<input id={id} type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="اسم أو رقم أو مرجع الطلب"/></label>
  {state && <label className="field" htmlFor={id+"-status"}>الحالة<select id={id+"-status"} value={status} onChange={e=>setStatus(e.target.value)}><option value="">كل الحالات</option>{[...new Set([...options,...(status?[status]:[])])].map(value=><option key={value} value={value}>{labels[value]??value}</option>)}</select></label>}
  {active && <button className="secondary compact" onClick={()=>{setQuery("");setStatus("");}}>مسح الفلاتر</button>}</div>
  <p className="muted" role="status">{visible.length} من {rows.length} سجل محمّل · البحث والفلترة في السجلات المحمّلة فقط</p>
  {active && !visible.length && <p className="subtle-box">لا توجد نتائج مطابقة. غيّر البحث أو حمّل سجلات إضافية إن كانت متاحة.</p>}
 </div>};
}
