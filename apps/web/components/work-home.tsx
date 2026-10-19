"use client";
import { PlatformHero } from "./platform-identity";
import { Building2, QrCode, Coins, Package, FileText, ArrowLeft } from "lucide-react";
import { RoleSummary } from "./updates";
import { roleName } from "../lib/navigation";
export type WorkDestination = "point-wallet" | "gyms" | "cashier" | "purchases" | "inventory" | "reports" | "withdrawals" | "operation-reviews";
export type CashierTask = "visit" | "sale" | "history";
export function WorkHome({role,name,onNavigate}:{role:string;name:string;onNavigate:(destination:WorkDestination,task?:CashierTask)=>void}){
 const owner=role==="GYM_OWNER",cashier=role==="CASHIER";
 const tasks: {title:string;description:string;destination:WorkDestination;task?:CashierTask;icon:typeof Building2}[]=owner?[
  {title:"محفظتي وإرسال النقاط",description:"شوف رصيد جيمك وابعت للمتدرب برقم الموبايل.",destination:"point-wallet",icon:Coins},
  {title:"تسجيل زيارة",description:"امسح رمز المتدرب وأكد حضوره في الفرع.",destination:"cashier",task:"visit",icon:QrCode},
  {title:"الجيم والفروع",description:"جهّز بيانات جيمك، الفروع والموظفين.",destination:"gyms" as const,icon:Building2},
  {title:"اشحن نقاط الفرع",description:"اختار الفرع وارفع إيصال شحن مخزونه.",destination:"purchases" as const,icon:Coins},
  {title:"رصيد الفروع",description:"شوف النقاط المتاحة وحركة المخزون.",destination:"inventory" as const,icon:Package},
  {title:"مستحقاتي والسحب",description:"تابع مستحقات زيارات الجيم وطلبات السحب.",destination:"withdrawals" as const,icon:Coins},
 ]:cashier?[
  {title:"دخّل متدرب",description:"افتح الكاميرا، امسح رمزه وأكد الزيارة.",destination:"cashier" as const,task:"visit" as const,icon:QrCode},
  {title:"بيع نقاط لمتدرب",description:"حدد المتدرب والكمية وأكد استلام الفلوس.",destination:"cashier" as const,task:"sale" as const,icon:Coins},
  {title:"سجل الفرع",description:"راجع الزيارات والمبيعات المسجلة.",destination:"cashier" as const,task:"history" as const,icon:FileText},
 ]:[
  {title:"تسجيل زيارة",description:"امسح رمز المتدرب وأكد حضوره في فرعك.",destination:"cashier",task:"visit",icon:QrCode},
  {title:"شحن متدرب",description:"اشحن من رصيد الفرع بعد تأكيد استلام المبلغ.",destination:"cashier",task:"sale",icon:Coins},
  {title:"متابعة الفرع",description:"راجع الزيارات والمبيعات المسجلة.",destination:"cashier" as const,task:"history" as const,icon:FileText},
  {title:"رصيد النقاط",description:"تابع رصيد الفرع وحركة النقاط.",destination:"inventory" as const,icon:Package},
  {title:"بيانات الفروع",description:"افتح الفروع والبيانات المتاحة لحسابك.",destination:"gyms" as const,icon:Building2},
 ];
 return <section className="work-home"><PlatformHero eyebrow={roleName(role)} title={"أهلًا يا "+name.split(" ")[0]}>يوم جديد، شغل أسهل. اختار مهمتك وابدأ من هنا.</PlatformHero><RoleSummary onNavigate={destination=>onNavigate(destination as WorkDestination)}/><div className="work-task-grid">{tasks.map((task,index)=><button key={task.title} className={`work-task ${index===0?"featured":""}`} onClick={()=>onNavigate(task.destination,task.task)}><span className="work-task-icon"><task.icon size={25}/></span><strong>{task.title}</strong><span>{task.description}</span><ArrowLeft size={18}/></button>)}</div><button className="text-button work-report" onClick={()=>onNavigate("reports")}><FileText size={17}/>افتح التقارير والمتابعة<ArrowLeft size={16}/></button></section>;
}

