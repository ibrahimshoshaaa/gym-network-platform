import {consumeAuthLimit} from '../auth/throttle.js';
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyPassword } from '../auth/passwords.js';
import { hashToken } from '../auth/sessions.js';
import { requireAdmin } from '../auth/authorization.js';
import { loginSchema } from '../auth/validation.js';
import { parse } from '../gyms/validation.js';
import { serializable } from '../ledger/service.js';
import { DomainError } from '../domain/errors.js';

type Tx = Prisma.TransactionClient;
export const deletionInput = z.object({currentPassword:z.string().min(1).max(256),confirmation:z.literal('DELETE'),requestKey:z.string().uuid()}).strict();
export const publicDeletionInput = loginSchema.extend({confirmation:z.literal('DELETE'),requestKey:z.string().uuid()}).strict();
export const deletionNotice = 'يُحذف الاسم وبيانات الاتصال وكلمة السر وإنهاء الجلسات والمحتوى الشخصي والصور غير المالية. تُحتفظ بسجلات العمليات والأرصدة والإيصالات المالية وسجلات الأمان اللازمة للمحاسبة وحل النزاعات. لا يُسقط الحذف أي رصيد أو مستحقات. الطلبات التي تحتاج تسوية تُراجع خلال 7 أيام، وقد يستغرق إتمامها أكثر حتى تنتهي التسوية. الصور قد تحتاج وقتًا إضافيًا لإتمام الحذف من مزود التخزين.';
export type Blocker = {code:string;count:number};
export async function deletionBlockers(tx:Tx,userId:string,adminReview=false):Promise<Blocker[]>{
 const u=await tx.user.findUniqueOrThrow({where:{id:userId}}),out:Blocker[]=[];
 const add=(code:string,count:number)=>{if(count)out.push({code,count});};
 const gyms=(await tx.gym.findMany({where:{ownerId:userId},select:{id:true,status:true}}));
 const gids=gyms.map(g=>g.id),bids=(await tx.branch.findMany({where:{gymId:{in:gids}},select:{id:true}})).map(b=>b.id);
 add('UPLOADS',await tx.accountUploadLease.count({where:{userId,expiresAt:{gt:new Date()}}}));
 add('ACCOUNT_REVIEW',!u.isActive&&!adminReview?1:0);
 add('GYM_CLOSURE',gyms.filter(g=>g.status!=='SUSPENDED'&&g.status!=='REJECTED').length);
 add('POINT_BALANCE',await tx.pointAccount.count({where:{OR:[{ownerUserId:userId},{gymId:{in:gids}},{branchId:{in:bids}}],balance:{not:0}}}));
 add('MONEY_BALANCE',await tx.moneyAccount.count({where:{OR:[{gymId:{in:gids}},{branchId:{in:bids}}],type:{in:['GYM_AVAILABLE','GYM_RESERVED','GYM_DISPUTED']},balancePiasters:{not:0n}}}));
 add('BOOKINGS',await tx.booking.count({where:{OR:[{traineeId:userId},{branchId:{in:bids}}],status:{in:['RESERVED','PENDING_REVIEW']}}}));
 add('VISITS',await tx.visit.count({where:{OR:[{traineeId:userId},{branchId:{in:bids}}],status:'ACTIVE',expiresAt:{gt:new Date()}}}));
 add('TOPUPS',await tx.topupRequest.count({where:{OR:[{requestorUserId:userId},{receivingGymId:{in:gids}},{receivingBranchId:{in:bids}}],status:'PENDING'}}));
 add('WITHDRAWALS',await tx.withdrawalRequest.count({where:{OR:[{requestorId:userId},{gymId:{in:gids}}],status:{in:['REQUESTED','APPROVED','DISPUTED']}}}));
 const visits=(await tx.visit.findMany({where:{traineeId:userId},select:{id:true}})).map(v=>v.id);
 const sales=(await tx.pointSale.findMany({where:{traineeId:userId},select:{id:true}})).map(v=>v.id);
 add('DISPUTES',await tx.financialHold.count({where:{OR:[{gymId:{in:gids}},{visitId:{in:visits}}],state:'OPEN'}}));
 add('REVIEWS',await tx.operationReview.count({where:{OR:[{requestorId:userId},{branchId:{in:bids}},{visitId:{in:visits}},{saleId:{in:sales}}],status:'PENDING'}}));
 add('SUPPORT',await tx.supportTicket.count({where:{userId,status:{not:'CLOSED'},category:{in:['REFUND','WITHDRAWAL','TOPUP','VISIT']}}}));
 add('MAINTENANCE',await tx.maintenanceRequest.count({where:{OR:[{createdById:userId},{branchId:{in:bids}}],status:{notIn:['COMPLETED','CANCELLED']}}}));
 add('PROMOTIONS',await tx.promotionRequest.count({where:{AND:[{OR:[{requestedById:userId},{branchId:{in:bids}}]},{OR:[{status:{in:['PENDING','AWAITING_ACCEPTANCE']}},{status:{in:['APPROVED','PAUSED']},endsAt:{gt:new Date()}}]}]}}));
 const unpaid=await tx.$queryRaw<{count:bigint}[]>`SELECT count(*) FROM "GymServiceCharge" c WHERE c."gymId"=ANY(${gids}::uuid[]) AND c."voidedAt" IS NULL AND c."amountPiasters">COALESCE((SELECT sum(x."amountPiasters") FROM "GymChargeCollection" x WHERE x."chargeId"=c.id AND NOT EXISTS(SELECT 1 FROM "GymChargeCollectionReversal" r WHERE r."collectionId"=x.id)),0)`;
 add('SERVICE_CHARGES',Number(unpaid[0]!.count));return out;
}
const select={id:true,status:true,requestedAt:true,reviewDueAt:true,erasedAt:true,completedAt:true} as const;
export async function deletionStatus(db:Tx,userId:string){
 const request=await db.accountDeletion.findUnique({where:{userId},select});
 return {request,notice:deletionNotice,blockers:!request||request.status==='PENDING'?await deletionBlockers(db,userId):[]};
}
export async function deletionReceipt(db:PrismaClient,key:unknown){
 const requestKey=parse(z.string().uuid(),key),row=await db.accountDeletion.findUnique({where:{requestKeyHash:hashToken(requestKey)},select});
 if(!row)throw new DomainError('NOT_FOUND');
 return {request:row,notice:deletionNotice};
}
async function credential(db:PrismaClient,userId:string,password:string){
 const user=await db.user.findUnique({where:{id:userId},include:{password:true}});
 if(!await verifyPassword(password,user?.password?.passwordHash))throw new DomainError('INVALID_CREDENTIALS');
 if(user!.role==='PLATFORM_ADMIN')throw new DomainError('ACCESS_DENIED');
 return user!.password!.passwordHash;
}
export async function publicDeletion(db:PrismaClient,input:unknown){
 const d=parse(publicDeletionInput,input);await consumeAuthLimit(db,'deletion-identity',d.identifier,5,900);const user=await db.user.findFirst({where:d.identifier.includes('@')?{email:d.identifier}:{phoneE164:d.identifier},select:{id:true}});
 if(!user){await verifyPassword(d.password,null);throw new DomainError('INVALID_CREDENTIALS');}
 return requestDeletion(db,user.id,{currentPassword:d.password,confirmation:d.confirmation,requestKey:d.requestKey});
}
export async function publicCancelDeletion(db:PrismaClient,input:unknown){
 const d=parse(loginSchema,input);await consumeAuthLimit(db,'deletion-identity',d.identifier,5,900);
 const user=await db.user.findFirst({where:d.identifier.includes('@')?{email:d.identifier}:{phoneE164:d.identifier},select:{id:true}});
 if(!user){await verifyPassword(d.password,null);throw new DomainError('INVALID_CREDENTIALS');}
 return cancelDeletion(db,user.id,{currentPassword:d.password});
}
export async function requestDeletion(db:PrismaClient,userId:string,input:unknown){
 const d=parse(deletionInput,input),hash=await credential(db,userId,d.currentPassword);
 return serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
  if((await tx.userPassword.findUnique({where:{userId}}))?.passwordHash!==hash)throw new DomainError('INVALID_CREDENTIALS');
  const old=await tx.accountDeletion.findUnique({where:{userId}});
  if(old&&old.status!=='CANCELLED'){
   if(old.status==='PENDING'){await tx.accountDeletion.update({where:{id:old.id},data:{requestKeyHash:hashToken(d.requestKey)}});if(!(await deletionBlockers(tx,userId)).length)await eraseIdentity(tx,userId,old.id);}
   return deletionStatus(tx,userId);
  }
  const data={requestKeyHash:hashToken(d.requestKey),status:'PENDING',requestedAt:new Date(),reviewDueAt:new Date(Date.now()+7*86400000)};
  const row=old?await tx.accountDeletion.update({where:{id:old.id},data}):await tx.accountDeletion.create({data:{userId,...data}});
  await tx.auditLog.create({data:{actorId:userId,action:'ACCOUNT_DELETION_REQUESTED',entityId:row.id,reason:'Account holder confirmed deletion with current password'}});
  if(!(await deletionBlockers(tx,userId)).length)await eraseIdentity(tx,userId,row.id);
  return deletionStatus(tx,userId);
 });
}
export async function cancelDeletion(db:PrismaClient,userId:string,input:unknown){
 const d=parse(z.object({currentPassword:z.string().min(1).max(256)}).strict(),input),hash=await credential(db,userId,d.currentPassword);
 return serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
  if((await tx.userPassword.findUnique({where:{userId}}))?.passwordHash!==hash)throw new DomainError('INVALID_CREDENTIALS');
  const row=await tx.accountDeletion.findUnique({where:{userId}});if(!row||row.status!=='PENDING')throw new DomainError('INVALID_STATE');
  await tx.accountDeletion.update({where:{id:row.id},data:{status:'CANCELLED'}});
  await tx.auditLog.create({data:{actorId:userId,action:'ACCOUNT_DELETION_CANCELLED',entityId:row.id,reason:'Account holder cancelled pending deletion'}});
  return deletionStatus(tx,userId);
 });
}
export async function adminDeletions(db:PrismaClient,actor:string,input:unknown){
 await requireAdmin(db,actor);const q=parse(z.object({cursor:z.string().uuid().optional()}).strict(),input);
 const rows=await db.accountDeletion.findMany({where:{status:{in:['PENDING','ERASING']}},orderBy:{id:'asc'},take:26,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),select:{...select,userId:true}});
 return {items:rows.slice(0,25),nextCursor:rows.length>25?rows[24]!.id:null};
}
export async function processDeletion(db:PrismaClient,actor:string,id:string,input:unknown){
 const d=parse(z.object({password:z.string().min(1).max(256),confirmation:z.literal('DELETE')}).strict(),input);
 await requireAdmin(db,actor);const adminHash=(await db.userPassword.findUnique({where:{userId:actor}}))?.passwordHash;
 if(!await verifyPassword(d.password,adminHash))throw new DomainError('INVALID_CREDENTIALS');
 return serializable(db,async tx=>{
  await requireAdmin(tx,actor);if((await tx.userPassword.findUnique({where:{userId:actor}}))?.passwordHash!==adminHash)throw new DomainError('INVALID_CREDENTIALS');
  const row=await tx.accountDeletion.findUnique({where:{id}});if(!row)throw new DomainError('NOT_FOUND');
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${row.userId}::uuid FOR UPDATE`;
  if(row.status==='PENDING'){
   const blockers=await deletionBlockers(tx,row.userId,true);if(blockers.length)return {...await deletionStatus(tx,row.userId),blockers};
   if((await tx.user.findUniqueOrThrow({where:{id:row.userId}})).role==='PLATFORM_ADMIN')throw new DomainError('ACCESS_DENIED');
   await tx.accountDeletion.update({where:{id},data:{reviewedById:actor}});await eraseIdentity(tx,row.userId,id);
  }else if(!row.erasedAt)throw new DomainError('INVALID_STATE');
  return deletionStatus(tx,row.userId);
 });
}

async function eraseIdentity(tx:Tx,userId:string,deletionId:string){
 const user=await tx.user.findUniqueOrThrow({where:{id:userId}});
 const gids=(await tx.gym.findMany({where:{ownerId:userId},select:{id:true}})).map(g=>g.id);
 const bids=(await tx.branch.findMany({where:{gymId:{in:gids}},select:{id:true}})).map(b=>b.id);
 await tx.accountDeletion.update({where:{id:deletionId},data:{status:'ERASING'}});
 await tx.user.update({where:{id:userId},data:{displayName:'حساب محذوف',phoneE164:'deleted:'+userId,email:null,phoneVerifiedAt:null,emailVerifiedAt:null,isActive:false}});
 // Delete UGC from the database and enqueue every remote object in the same transaction.
 const queue=async(keys:{objectKey:string}[],deliveryType:string)=>{if(keys.length)await tx.accountDeletionAsset.createMany({data:keys.map(k=>({id:randomUUID(),deletionId,objectKey:k.objectKey,deliveryType})),skipDuplicates:true});};
 const abandonedUploads=await tx.accountUploadLease.findMany({where:{userId}});
 for(const lease of abandonedUploads)await queue([lease],lease.deliveryType);
 await tx.accountUploadLease.deleteMany({where:{userId}});
 const marketWhere={OR:[{ownerId:userId},{listing:{sellerId:userId}}]};
 await queue(await tx.marketImage.findMany({where:marketWhere,select:{objectKey:true}}),'upload');
 await tx.marketImage.deleteMany({where:marketWhere});await tx.marketReport.deleteMany({where:{OR:[{reporterId:userId},{listing:{sellerId:userId}}]}});await tx.marketListing.deleteMany({where:{sellerId:userId}});
 const businessWhere={OR:[{ownerId:userId},{gymId:{in:gids}}]};await queue(await tx.businessImage.findMany({where:businessWhere,select:{objectKey:true}}),'upload');await tx.businessImage.deleteMany({where:businessWhere});
 const promotionWhere={OR:[{requestedById:userId},{branchId:{in:bids}}]};
 const promotionImages=await tx.promotionImage.findMany({where:{OR:[{ownerId:userId},{branchId:{in:bids}},{request:promotionWhere}]},select:{id:true,objectKey:true}});
 await tx.promotionRequest.updateMany({where:{AND:[{OR:[promotionWhere,{imageId:{in:promotionImages.map(i=>i.id)}}]},{NOT:{requestedBy:{phoneE164:{startsWith:'deleted:'}}}}]},data:{title:'محتوى محذوف',body:'محتوى محذوف',imageId:null}});
 await queue(promotionImages,'upload');await tx.promotionImage.deleteMany({where:{id:{in:promotionImages.map(i=>i.id)}}});
 const maintenanceWhere={OR:[{createdById:userId},{branchId:{in:bids}}]};
 const maintenanceImages=await tx.maintenanceImage.findMany({where:{OR:[{ownerId:userId},{branchId:{in:bids}},{request:maintenanceWhere}]},select:{id:true,objectKey:true}});
 await queue(maintenanceImages,'upload');await tx.maintenanceImage.deleteMany({where:{id:{in:maintenanceImages.map(i=>i.id)}}});
 // Monetary quotes/approvals and event data remain restricted financial records.
 await tx.maintenanceRequest.updateMany({where:{AND:[maintenanceWhere,{NOT:{createdBy:{phoneE164:{startsWith:'deleted:'}}}}]},data:{equipment:'محتوى محذوف',description:'محتوى محذوف',contactPhone:'',workSummary:'محتوى محذوف'}});
 await tx.$executeRaw`UPDATE "MaintenanceEvent" SET note='محتوى محذوف',data=(SELECT COALESCE(jsonb_object_agg(key,value),'{}'::jsonb) FROM jsonb_each(data) WHERE key IN ('action','estimatedPiasters','approvedPiasters','finalPiasters')) WHERE ("actorId"=${userId}::uuid OR "requestId" IN (SELECT id FROM "MaintenanceRequest" WHERE "createdById"=${userId}::uuid OR "branchId"=ANY(${bids}::uuid[]))) AND NOT EXISTS(SELECT 1 FROM "AccountDeletion" d WHERE d."userId"="MaintenanceEvent"."actorId" AND d."erasedAt" IS NOT NULL)`;
 await tx.visitRating.deleteMany({where:{traineeId:userId}});
 const threadReceipts=(await tx.supportMessage.findMany({where:{ticket:{userId},receiptId:{not:null}},select:{receiptId:true}})).map(m=>m.receiptId!);
 await tx.supportMessage.deleteMany({where:{ticket:{userId}}});await tx.supportTicket.deleteMany({where:{userId}});
 await tx.notificationRead.deleteMany({where:{userId}});
 const unused=await tx.$queryRaw<{id:string;objectKey:string}[]>`SELECT e.id,e."objectKey" FROM "ReceiptEvidence" e WHERE (e."ownerUserId"=${userId}::uuid OR e.id=ANY(${threadReceipts}::uuid[]))
 AND NOT EXISTS(SELECT 1 FROM "TopupRequest" t WHERE t."receiptId"=e.id OR t."receiptObjectKey"=e."objectKey")
 AND NOT EXISTS(SELECT 1 FROM "FinancialEvidenceUse" f WHERE f."receiptId"=e.id)
 AND NOT EXISTS(SELECT 1 FROM "WithdrawalRequest" w WHERE w."proofReceiptId"=e.id)
 AND NOT EXISTS(SELECT 1 FROM "OperationReview" r WHERE r."evidenceId"=e.id)
 AND NOT EXISTS(SELECT 1 FROM "SupportMessage" s WHERE s."receiptId"=e.id)`;
 await queue(unused,'authenticated');await tx.receiptEvidence.deleteMany({where:{id:{in:unused.map(e=>e.id)}}});
 await tx.staffAssignment.updateMany({where:{OR:[{userId},{branchId:{in:bids}}],active:true},data:{active:false}});
 await tx.staffDelegation.updateMany({where:{OR:[{userId},{gymId:{in:gids}}],active:true},data:{active:false,version:{increment:1}}});
 await tx.staffInvitation.updateMany({where:{OR:[{userId},{gymId:{in:gids}}],acceptedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
 await tx.branch.updateMany({where:{id:{in:bids}},data:{status:'SUSPENDED',name:'فرع محذوف',address:'',governorate:'',city:'',contactPhone:null,latitude:null,longitude:null,openingHours:null,entryQrToken:null}});
 await tx.branchService.updateMany({where:{branchId:{in:bids}},data:{active:false}});
 await tx.gym.updateMany({where:{id:{in:gids}},data:{status:'SUSPENDED',name:'جيم محذوف',description:'',contactPhone:null}});
 await tx.gymApplication.deleteMany({where:{ownerId:userId}});
 await tx.qrTicket.deleteMany({where:{userId}});
 await tx.$executeRaw`UPDATE "AuthSession" SET "tokenHash"='deleted:'||id::text,"revokedAt"=CURRENT_TIMESTAMP,"expiresAt"=LEAST("expiresAt",CURRENT_TIMESTAMP) WHERE "userId"=${userId}::uuid`;await tx.userPassword.deleteMany({where:{userId}});
 await tx.accountRecovery.deleteMany({where:{OR:[{userId},{issuedById:userId}]}});
 await tx.phoneOtpChallenge.deleteMany({where:{phone:user.phoneE164}});await tx.phoneTestIdentity.deleteMany({where:{userId}});
 await tx.$executeRaw`UPDATE "Campaign" SET "userIds"=array_remove("userIds",${userId}::uuid),version=version+1 WHERE ${userId}::uuid=ANY("userIds")`;
 const hasAssets=await tx.accountDeletionAsset.count({where:{deletionId,completedAt:null}});
 await tx.accountDeletion.update({where:{id:deletionId},data:{erasedAt:new Date(),...(!hasAssets?{status:'COMPLETED',completedAt:new Date()}: {})}});
 await tx.auditLog.create({data:{actorId:userId,action:'ACCOUNT_IDENTITY_ERASED',entityId:deletionId,reason:'Credentials, contact identity and personal content erased; immutable financial and security records retained'}});
}
