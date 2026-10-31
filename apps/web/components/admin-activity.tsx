"use client";
import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {api,message} from '../lib/client';
import {queueCounts,type AdminSummary} from '../lib/admin-queues';
const Activity=createContext<null|{summary:AdminSummary|null;error:string;loading:boolean;refresh:()=>Promise<void>}>(null);
export const useAdminActivity=()=>useContext(Activity);
export function AdminActivityProvider({children}:{children:ReactNode}){
 const [summary,setSummary]=useState<AdminSummary|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);const generation=useRef(0);
 const refresh=useCallback(async()=>{const g=++generation.current;setLoading(true);try{const data=await api<AdminSummary>('home-summary');if(g===generation.current){setSummary(data);setError('');}}catch(e){if(g===generation.current)setError(message(e));}finally{if(g===generation.current)setLoading(false);}},[]);
 useEffect(()=>{void refresh();const changed=()=>{void refresh();};const visible=()=>{if(document.visibilityState==='visible')void refresh();};const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);window.addEventListener('admin-data-changed',changed);document.addEventListener('visibilitychange',visible);return()=>{generation.current++;clearInterval(timer);window.removeEventListener('admin-data-changed',changed);document.removeEventListener('visibilitychange',visible);};},[refresh]);
 return <Activity.Provider value={{summary,error,loading,refresh}}>{children}</Activity.Provider>;
}
export function PendingCount({destination}:{destination:string}){const activity=useAdminActivity();const count=queueCounts(activity?.summary??null)[destination as keyof ReturnType<typeof queueCounts>];return count?<span className="nav-pending" aria-label={`${count} طلب يحتاج متابعة`}>{count>99?'99+':count}</span>:null;}
