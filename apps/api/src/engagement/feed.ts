import type { Prisma, PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireActor } from '../auth/authorization.js';
import { parse } from '../gyms/validation.js';
import { period } from '../reports/validation.js';
import { walletView } from '../wallet/validation.js';
export async function scopeIds(tx:Prisma.TransactionClient,id:string){
 const gyms=await tx.gym.findMany({where:{ownerId:id,ownerAcceptedAt:{not:null}},select:{id:true}});
 const branches=await tx.branch.findMany({where:{OR:[{gym:{ownerId:id,ownerAcceptedAt:{not:null}}},{staff:{some:{userId:id,active:true}},gym:{status:'ACTIVE',ownerAcceptedAt:{not:null},owner:{isActive:true}}}]},select:{id:true}});
 return {gymIds:gyms.map(g=>g.id),branchIds:branches.map(b=>b.id)};
}
export type FeedItem={id:string;title:string;description:string;at:Date;destination:string;referenceId?:string};
const names:Record<string,string>={PENDING:'بانتظار المراجعة',APPROVED:'مقبول',REJECTED:'مرفوض',REQUESTED:'طلب جديد',PAID:'تم التحويل',DISPUTED:'يوجد اعتراض',CANCELLED:'ملغى',OPEN:'مفتوح',WAITING_USER:'بانتظار رد العميل',WAITING_ADMIN:'بانتظار رد الإدارة',CLOSED:'مغلق'};
export async function notificationFeed(db:PrismaClient,id:string){return db.$transaction(async tx=>{
 const actor=await requireActor(tx,id),admin=actor.role==='PLATFORM_ADMIN',trainee=actor.role==='TRAINEE',{gymIds,branchIds}=await scopeIds(tx,id);
 const events:FeedItem[]=[];const add=(kind:string,key:string,state:string,title:string,at:Date,destination:string,description='')=>events.push({id:`${kind}:${key}:${state}`,title,description,at,destination,referenceId:key});
 const topups=await tx.topupRequest.findMany({where:admin?{status:'PENDING'}:{requestorUserId:id},orderBy:{createdAt:'desc'},take:50,select:{id:true,status:true,points:true,createdAt:true,reviewedAt:true,reviewReason:true}});
 for(const t of topups)add('topup',t.id,t.status,`شحن ${t.points} نقطة · ${names[t.status]??t.status}`,t.reviewedAt??t.createdAt,admin?'reviews':trainee?'topup':'purchases',admin?'يوجد طلب شحن يحتاج قرارك':t.reviewReason??'تابع حالة الطلب');
 const withdrawals=await tx.withdrawalRequest.findMany({where:admin?{status:{in:['REQUESTED','APPROVED','DISPUTED']}}:{gymId:{in:gymIds}},orderBy:{requestedAt:'desc'},take:50,select:{id:true,status:true,requestedAt:true,acceptedAt:true,paidAt:true,closedAt:true,dueAt:true}});
 for(const w of withdrawals)add('withdrawal',w.id,w.status+(w.status==='APPROVED'&&w.dueAt&&w.dueAt<new Date()?':OVERDUE':''),'طلب سحب · '+names[w.status],w.closedAt??w.paidAt??w.acceptedAt??w.requestedAt,'withdrawals',w.status==='APPROVED'&&w.dueAt&&w.dueAt<new Date()?'تجاوز موعد التنفيذ؛ يحتاج متابعة':'تابع تفاصيل الطلب والمستحقات');
 const reviews=await tx.operationReview.findMany({where:admin?{status:'PENDING'}:{requestorId:id},orderBy:{createdAt:'desc'},take:50});
 for(const r of reviews)add('review',r.id,r.status,'مراجعة عملية · '+names[r.status],r.reviewedAt??r.createdAt,trainee?'support':'operation-reviews',r.reviewReason??'طلب مراجعة مسجل');
 const prices=await tx.branchPricingRequest.findMany({where:admin?{status:'PENDING'}:{OR:[{requestedById:id},{branch:{gymId:{in:gymIds}}}]},orderBy:{createdAt:'desc'},take:50,include:{branch:{select:{name:true}}}});
 for(const p of prices)add('price',p.id,p.status,`سعر ${p.branch.name} · ${names[p.status]}`,p.reviewedAt??p.createdAt,admin?'branch-prices':'gyms');
 const holds=(admin||gymIds.length)?await tx.financialHold.findMany({where:admin?{}:{gymId:{in:gymIds}},orderBy:{createdAt:'desc'},take:25}):[];
 for(const h of holds)add('hold',h.id,h.state,h.state==='OPEN'?'مبلغ زيارة محجوز للمراجعة':'تم فك حجز مبلغ زيارة',h.releasedAt??h.createdAt,'disputes',h.reason);
 const dispatches=await tx.pointDispatch.findMany({where:admin?{kind:'ADMIN_TOPUP'}:trainee?{recipientId:id}:{gymId:{in:gymIds}},orderBy:{createdAt:'desc'},take:25});
 for(const d of dispatches)add('dispatch',d.id,'RECORDED',`${d.kind==='ADMIN_TOPUP'?'شحن مباشر':'بيع من محفظة الجيم'} · ${d.points} نقطة`,d.createdAt,admin?'direct-topup':trainee?'visits':'point-wallet',trainee?'تمت إضافة النقاط لمحفظتك':d.recipientLabel);
 const tickets=await tx.supportTicket.findMany({where:admin?{status:{not:'CLOSED'}}:{userId:id},orderBy:{updatedAt:'desc'},take:50});
 for(const t of tickets)add('support',t.id,t.status+':'+t.updatedAt.toISOString(),'الدعم · '+names[t.status],t.updatedAt,'support',t.subject);
 if(trainee){
  const visits=await tx.visit.findMany({where:{traineeId:id},orderBy:{startedAt:'desc'},take:25,include:{branch:{select:{name:true}}}});
  for(const v of visits)add('visit',v.id,v.status,`${v.status==='CANCELLED'?'إلغاء زيارة':'زيارة'} ${v.branch.name}`,v.cancelledAt??v.startedAt,'visits',`${v.pointsCharged} نقطة`);
  const sales=await tx.pointSale.findMany({where:{traineeId:id},orderBy:{createdAt:'desc'},take:25});
  for(const s of sales)add('sale',s.id,'RECORDED',`استلمت ${s.points} نقطة من فرع`,s.createdAt,'visits','عملية شراء نقاط مسجلة');
  const wallet=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:id}}});
  if(wallet?.balance && wallet.expiresAt){const days=Math.ceil((wallet.expiresAt.getTime()-Date.now())/86400000);const threshold=days<=0?0:days<=1?1:days<=7?7:days<=15?15:null;
   if(threshold!==null)events.push({id:`expiry:${wallet.expiresAt.toISOString()}:${threshold}`,title:threshold===0?'رصيدك المنتهي يحتاج مراجعة':`صلاحية نقاطك خلال ${Math.max(1,days)} يوم`,description:'راجع المحفظة. التنبيه لا يحذف نقاطًا ولا يغيّر سياسة الرصيد.',at:new Date(),destination:'wallet'});
  }
 } else if(!admin && branchIds.length){const zero=await tx.pointAccount.findMany({where:{type:'BRANCH_INVENTORY',branchId:{in:branchIds},balance:0},include:{branch:{select:{name:true}}},take:25});for(const z of zero)events.push({id:`stock:${z.id}:empty`,title:`مخزون ${z.branch?.name??'الفرع'} صفر`,description:'لا يمكن بيع نقاط من هذا المخزون حتى شحنه.',at:new Date(),destination:actor.role==='GYM_OWNER'?'purchases':actor.role==='CASHIER'?'cashier':'inventory'});}
 events.sort((a,b)=>b.at.getTime()-a.at.getTime()||a.id.localeCompare(b.id));
 const items=events.slice(0,100),reads=await tx.notificationRead.findMany({where:{userId:id,eventId:{in:items.map(e=>e.id)}},select:{eventId:true}}),seen=new Set(reads.map(r=>r.eventId));
 return {asOf:new Date(),items:items.map(e=>({...e,read:seen.has(e.id)})),unread:items.filter(e=>!seen.has(e.id)).length,limited:events.length>100};
 },{isolationLevel:'RepeatableRead',timeout:20000});}
export async function readNotifications(db:PrismaClient,id:string,input:unknown){const d=parse(z.object({ids:z.array(z.string().min(1).max(200)).max(100)}).strict(),input);const feed=await notificationFeed(db,id),allowed=new Set(feed.items.map(e=>e.id));await db.notificationRead.createMany({data:d.ids.filter(key=>allowed.has(key)).map(eventId=>({userId:id,eventId})),skipDuplicates:true});return {read:true};}
export async function homeSummary(db:PrismaClient,id:string){return db.$transaction(async tx=>{
 const actor=await requireActor(tx,id),admin=actor.role==='PLATFORM_ADMIN',{gymIds,branchIds}=await scopeIds(tx,id),now=new Date();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),range=period({from:today,to:today});
 const cards:{label:string;value:string;destination:string;unit?:string}[]=[];
 const add=(label:string,value:number|string,destination:string,unit?:string)=>cards.push({label,value:String(value),destination,...(unit?{unit}:{})});
 if(admin){
  add('شحن ينتظر المراجعة',await tx.topupRequest.count({where:{status:'PENDING'}}),'reviews');
  add('سحب ينتظر المراجعة',await tx.withdrawalRequest.count({where:{status:'REQUESTED'}}),'withdrawals');
  add('تحويلات متأخرة',await tx.withdrawalRequest.count({where:{status:'APPROVED',dueAt:{lt:now}}}),'withdrawals');
  add('طلبات أسعار',await tx.branchPricingRequest.count({where:{status:'PENDING'}}),'branch-prices');
  add('طلبات تصحيح',await tx.operationReview.count({where:{status:'PENDING'}}),'operation-reviews');
  add('طلبات دعم مفتوحة',await tx.supportTicket.count({where:{status:{not:'CLOSED'}}}),'support');
  add('جيمات تنتظر التفعيل',await tx.gym.count({where:{status:'PENDING',ownerAcceptedAt:{not:null}}}),'gyms');
  add('جيمات نشطة',await tx.gym.count({where:{status:'ACTIVE'}}),'gyms');
  add('فروع نشطة',await tx.branch.count({where:{status:'ACTIVE',gym:{status:'ACTIVE',owner:{isActive:true},ownerAcceptedAt:{not:null}},priceApprovedAt:{not:null}}}),'gyms');
  add('متدربون نشطون',await tx.user.count({where:{role:'TRAINEE',isActive:true}}),'users');
 } else if(actor.role==='TRAINEE'){
  const wallet=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:id}}});if(wallet)add('رصيد متاح',walletView(wallet,now).spendablePoints,'wallet','نقطة');
  add('طلبات شحن معلقة',await tx.topupRequest.count({where:{requestorUserId:id,status:'PENDING'}}),'topup');
 } else {
  add('فروعك',branchIds.length,'gyms');
  add('زيارات اليوم',await tx.visit.count({where:{branchId:{in:branchIds},...(actor.role==='CASHIER'?{cashierId:id}:{}),startedAt:{gte:range.start,lt:range.end}}}),'cashier');
  add('جلسات نشطة',await tx.visit.count({where:{branchId:{in:branchIds},...(actor.role==='CASHIER'?{cashierId:id}:{}),status:'ACTIVE',expiresAt:{gt:now}}}),'cashier');
  add('نقاط بيعت اليوم',Number((await tx.pointDispatch.aggregate({where:{kind:'GYM_SALE',gymId:{in:gymIds},createdAt:{gte:range.start,lt:range.end}},_sum:{points:true}}))._sum.points??0)+((await tx.pointSale.aggregate({where:{branchId:{in:branchIds},...(actor.role==='CASHIER'?{cashierId:id}:{}),createdAt:{gte:range.start,lt:range.end}},_sum:{points:true}}))._sum.points??0),actor.role==='GYM_OWNER'?'point-wallet':'cashier','نقطة');
  add('مخزون الفروع',(await tx.pointAccount.aggregate({where:{type:'BRANCH_INVENTORY',branchId:{in:branchIds}},_sum:{balance:true}}))._sum.balance??0,actor.role==='CASHIER'?'cashier':'inventory','نقطة');
 }
 if(admin||actor.role==='GYM_OWNER'){
  const balances=await tx.moneyAccount.groupBy({by:['type'],where:{branchId:null,...(!admin?{gymId:{in:gymIds}}:{gymId:{not:null}})},_sum:{balancePiasters:true}});
  for(const [type,label] of [['GYM_AVAILABLE','مستحقات متاحة'],['GYM_RESERVED','محجوز للسحب'],['GYM_DISPUTED','محجوز للنزاعات'],['GYM_PAID','مدفوع للجيمات']] as const)add(label,(balances.find(b=>b.type===type)?._sum.balancePiasters??0n).toString(),'withdrawals','piasters');
 }
 return {asOf:now,today,cards};
 },{isolationLevel:'RepeatableRead',timeout:20000});}
