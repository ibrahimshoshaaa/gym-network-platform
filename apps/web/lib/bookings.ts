export type Allocation = { traineeBps: number; gymBps: number; platformBps: number };
export type BookingPolicy = { graceMinutes: number; mode: "MANUAL" } | { graceMinutes: number; mode: "AUTOMATIC"; allocation: Allocation };
export type PublishedPolicy = { id: string; version: number; policy: BookingPolicy };
export type Booking = {
 id:string; branchId:string; traineeId:string; scheduledAt:string; deadlineAt:string; points:number;
 status:string; policySnapshot:BookingPolicy; absenceReason:string|null; decisionReason:string|null;
 traineePoints:number|null; gymPoints:number|null; platformPoints:number|null;
 branch?:{name:string;gym:{name:string}}; traineeName?:string;
};
export const bookingStatus=(s:string)=>({RESERVED:"حجز مؤكد · نقاط محجوزة",PENDING_REVIEW:"بانتظار قرار الإدارة",ATTENDED:"تم الحضور",CANCELLED:"تم الإلغاء ورد النقاط",RESOLVED:"تمت تسوية عدم الحضور"}[s]??s);
export function policySummary(p:BookingPolicy){
 if(p.mode==="MANUAL")return "بعد المهلة تظل النقاط معلقة لحين مراجعة الإدارة لسبب عدم الحضور وتحديد توزيعها.";
 const a=p.allocation;return "بعد المهلة: "+[[a.traineeBps,"للمتدرب"],[a.gymBps,"للجيم"],[a.platformBps,"للمنصة"]].filter(([v])=>Number(v)>0).map(([v,label])=>Number(v)/100+"% "+label).join(" · ")+".";
}
export function bookingToken(value:string){
 const raw=value.trim();return raw.startsWith("gymbooking:")&&/^[A-Za-z0-9_-]{43}$/.test(raw.slice(11))?raw.slice(11):null;
}
export function bookingWindow(b:Pick<Booking,"status"|"scheduledAt"|"deadlineAt">,now:number){
 return b.status==="RESERVED"&&now>=Date.parse(b.scheduledAt)&&now<=Date.parse(b.deadlineAt);
}
