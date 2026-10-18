"use client";
import { useState } from "react";
export function RecordReference({value,label="مرجع العملية"}:{value:string;label?:string}) {
 const [copied,setCopied]=useState(false),[error,setError]=useState(false);
 return <details className="record-reference"><summary><span>{label}</span><code dir="ltr">{value.length>18?`${value.slice(0,8)}…${value.slice(-4)}`:value}</code><span>عرض كامل</span></summary><div className="record-reference-body"><code dir="ltr">{value}</code><button type="button" className="secondary compact" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setError(false);}catch{setError(true);}}}>{copied?"تم النسخ":"نسخ المرجع"}</button>{error&&<span role="status">تعذر النسخ؛ اضغط مطولًا على المرجع لتحديده.</span>}</div></details>;
}
