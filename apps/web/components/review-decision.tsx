"use client";
import {useId,useState} from 'react';
import {CheckCircle2,XCircle} from 'lucide-react';

/** Preserve a meaningful audit reason without requiring repetitive typing. */
export function decisionReason(preset:string,note:string){return note.trim()?`${preset} — ${note.trim()}`:preset;}
export function ReviewNote({preset,choices=[],name='reason',disabled=false,maxLength=1000}:{preset:string;choices?:readonly string[];name?:string;disabled?:boolean;maxLength?:number}){
 const [choice,setChoice]=useState(preset),[note,setNote]=useState('');const id=useId();
 return <div className="review-note">
  <input type="hidden" name={name} value={decisionReason(choice,note.slice(0,Math.max(0,maxLength-choice.length-3)))}/>
  {choices.length>0&&<fieldset className="reason-presets" disabled={disabled}><legend>اختار السبب المناسب</legend>{[preset,...choices.filter(c=>c!==preset)].map(c=><button type="button" key={c} className={choice===c?'selected':''} aria-pressed={choice===c} onClick={()=>setChoice(c)}>{c}</button>)}</fieldset>}
  <details className="optional-note"><summary>إضافة ملاحظة (اختياري)</summary><label className="field" htmlFor={id}>ملاحظات إضافية<textarea id={id} value={note} onChange={e=>setNote(e.target.value)} maxLength={Math.max(0,maxLength-choice.length-3)} rows={3} disabled={disabled} placeholder="اكتب توضيحًا إذا احتجت"/></label></details>
 </div>;
}
export function DecisionButtons({value,onChange,approve='الموافقة',reject='رفض الطلب',disabled=false,approveValue='APPROVED',rejectValue='REJECTED'}:{value:string;onChange:(value:string)=>void;approve?:string;reject?:string;disabled?:boolean;approveValue?:string;rejectValue?:string}){
 return <div className="decision-switch" role="group" aria-label="قرار المراجعة"><button type="button" disabled={disabled} aria-pressed={value===approveValue} className={value===approveValue?'active':''} onClick={()=>onChange(approveValue)}><CheckCircle2 size={18}/>{approve}</button><button type="button" disabled={disabled} aria-pressed={value===rejectValue} className={value===rejectValue?'active reject':''} onClick={()=>onChange(rejectValue)}><XCircle size={18}/>{reject}</button></div>;
}
