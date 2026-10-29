import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, type PrismaClient, type Booking } from '@prisma/client';
import { z } from 'zod';
import { requireActor, requireAdmin, requireBranchAccess } from '../auth/authorization.js';
import { hashToken } from '../auth/sessions.js';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { postInTransaction, serializable } from '../ledger/service.js';
import { allocationSchema, allocatePoints, cancellationDeadline, snapshotPolicy } from './policy.js';

import { requireSessionFits, attendanceEnd, type DailyHours } from './hours.js';
import { validatePresence } from './presence.js';

type Tx = Prisma.TransactionClient;
const uuid = z.string().uuid();
export const createBookingSchema = z.object({
 branchId: uuid, scheduledAt: z.string().datetime({offset:true}).optional(), startNow: z.literal(true).optional(),
 policyVersion: z.number().int().positive(), branchPricingVersion: z.number().int().positive().optional(),
 services: z.array(z.object({id:uuid,version:z.number().int().positive()}).strict()).min(1).max(20).optional(),
 hoursVersion: z.number().int().positive().optional(),
}).strict().refine(v => Boolean(v.scheduledAt) !== Boolean(v.startNow))
 .refine(v => v.services ? Boolean(v.hoursVersion) && new Set(v.services.map(s=>s.id)).size===v.services.length : Boolean(v.branchPricingVersion) && !v.startNow);
export const reasonSchema = z.object({reason:z.string().trim().min(1).max(1000)}).strict();
export const decisionSchema = reasonSchema.extend({allocation:allocationSchema}).strict();
export const scanSchema = z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
export const checkInSchema = z.object({
 branchId:uuid,token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),
 accuracy:z.number().min(0).max(50),capturedAt:z.string().datetime({offset:true}),isMocked:z.literal(false),
}).strict();
const usesServices=(b:Booking)=>Array.isArray(b.serviceSnapshots)&&b.serviceSnapshots.length>0;

export function branchEntryQr(db:PrismaClient,actorId:string,branchId:string,input:unknown,rotate=false){
 parse(uuid,branchId);
 const expectedVersion=rotate?parse(z.object({expectedVersion:z.number().int().positive()}).strict(),input).expectedVersion:undefined;
 if(!rotate)parse(z.object({}).strict(),input);
 return serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid FOR UPDATE`;
  let branch=await requireBranchAccess(tx,actorId,branchId,rotate?'CANCEL_VISIT':'OPERATE_BRANCH');
  if(rotate&&branch.entryQrVersion!==expectedVersion)throw new DomainError('STALE_SETTINGS');
  if(!branch.entryQrToken||rotate){
   const updated=await tx.branch.update({where:{id:branchId},data:{entryQrToken:randomBytes(32).toString('base64url'),entryQrVersion:{increment:1}}});
   branch={...branch,...updated};
   await audit(tx,actorId,rotate?'BRANCH_ENTRY_QR_ROTATED':'BRANCH_ENTRY_QR_CREATED',branchId,'Fixed reception QR; attendance still requires an owned booking and fresh nearby location');
  }
  return {branchId,name:branch.name,version:branch.entryQrVersion,payload:`gymbranch:${branchId}:${branch.entryQrToken}`};
 });
}

export function checkInBooking(db:PrismaClient,actorId:string,id:string,input:unknown){
 parse(uuid,id);const data=parse(checkInSchema,input);
 return serializable(db,async tx=>{
  await trainee(tx,actorId);
  const b=await lockBooking(tx,id);
  if(b.traineeId!==actorId)throw new DomainError('ACCESS_DENIED');
  if(b.branchId!==data.branchId)throw new DomainError('QR_WRONG_BRANCH');
  // A safe replay returns the completed attendance without moving either ledger.
  if(b.status==='ATTENDED')return bookingView(b);
  const now=new Date();
  if(b.status!=='RESERVED'||now>=b.deadlineAt)throw new DomainError('INVALID_STATE');
  // Serialize QR rotation and location/status edits with attendance validation.
  await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${b.branchId}::uuid FOR UPDATE`;
  const branch=await tx.branch.findUnique({where:{id:b.branchId},include:{gym:{include:{owner:{select:{isActive:true}}}}}});
  if(!branch||branch.status!=='ACTIVE'||branch.gym.status!=='ACTIVE'||!branch.gym.ownerAcceptedAt||!branch.gym.owner.isActive)throw new DomainError('BRANCH_NOT_READY');
  if(!branch.entryQrToken||!timingSafeEqual(Buffer.from(branch.entryQrToken),Buffer.from(data.token)))throw new DomainError('QR_INVALID');
  if(branch.latitude==null||branch.longitude==null)throw new DomainError('BRANCH_LOCATION_REQUIRED');
  validatePresence(data,{latitude:Number(branch.latitude),longitude:Number(branch.longitude)},now);
  return bookingView(await settle(tx,b,actorId,{traineeBps:0,gymBps:10000,platformBps:0},'ATTENDED','Trainee scanned fixed branch QR with a fresh nearby location'));
 });
}
const digest = (v:unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function bookingView(b:Booking) {
 const {qrHash, qrSessionId, walletId, holdAccountId, requestHash, idempotencyKey, unitPricePiasters, ...view}=b;
 return {...view,unitPricePiasters:unitPricePiasters.toString()};
}
async function lockBooking(tx:Tx,id:string) {
 await tx.$queryRaw`SELECT id FROM "Booking" WHERE id=${id}::uuid FOR UPDATE`;
 const b=await tx.booking.findUnique({where:{id}});
 if(!b)throw new DomainError('NOT_FOUND');
 return b;
}
async function trainee(tx:Tx,id:string) {
 const user=await requireActor(tx,id);
 if(user.role!=='TRAINEE')throw new DomainError('ACCESS_DENIED');
}
export function createBooking(db:PrismaClient,actorId:string,key:string,input:unknown) {
 const data=parse(createBookingSchema,input);parse(uuid,key);
 if(data.services)data.services.sort((a,b)=>a.id.localeCompare(b.id));
 const idempotencyKey='booking:'+actorId+':'+key,requestHash=digest(data);
 return serializable(db,async tx=>{
  await trainee(tx,actorId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
  const old=await tx.booking.findUnique({where:{idempotencyKey}});
  if(old){if(old.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT');return bookingView(old);}
  const now=new Date(),scheduledAt=data.startNow?now:new Date(data.scheduledAt!);
  if(!data.startNow&&scheduledAt<=now)throw new DomainError('INVALID_INPUT');
  const branch=await tx.branch.findUnique({where:{id:data.branchId},include:{gym:{include:{owner:true}}}});
  if(!branch||branch.status!=='ACTIVE'||branch.gym.status!=='ACTIVE'||!branch.gym.ownerAcceptedAt||!branch.gym.owner.isActive||(!data.services&&!branch.priceApprovedAt))throw new DomainError('BRANCH_NOT_READY');
  const p=await tx.bookingPolicy.findFirst({orderBy:{version:'desc'}});
  const pricing=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'}});
  if(!p||!pricing)throw new DomainError('PRICING_NOT_CONFIGURED');
  if(p.version!==data.policyVersion||(!data.services&&branch.pricingVersion!==data.branchPricingVersion))throw new DomainError('STALE_SETTINGS');
  let points=branch.visitPricePoints,sessionMinutes=branch.sessionMinutes;
  let serviceSnapshots:Prisma.InputJsonValue=[];
  let hoursSnapshot:DailyHours|undefined,scheduledClosesAt:Date|undefined;
  if(data.services){
   if(branch.bookingOpenMinute==null||branch.bookingCloseMinute==null)throw new DomainError('BOOKING_HOURS_NOT_CONFIGURED');
   if(branch.bookingHoursVersion!==data.hoursVersion)throw new DomainError('STALE_SETTINGS');
   // Sorted row locks serialize price approval/availability changes with snapshot capture.
   for(const selected of data.services)await tx.$queryRaw`SELECT id FROM "BranchService" WHERE id=${selected.id}::uuid FOR UPDATE`;
   const services=await tx.branchService.findMany({where:{id:{in:data.services.map(s=>s.id)},branchId:branch.id,active:true,approvedAt:{not:null}}});
   if(services.length!==data.services.length)throw new DomainError('BOOKING_SERVICE_UNAVAILABLE');
   for(const selected of data.services)if(services.find(s=>s.id===selected.id)!.version!==selected.version)throw new DomainError('STALE_SETTINGS');
   points=services.reduce((sum,s)=>sum+s.points!,0);sessionMinutes=services.reduce((sum,s)=>sum+s.durationMinutes!,0);
   if(points>1000000||sessionMinutes>1440)throw new DomainError('INVALID_INPUT');
   serviceSnapshots=services.sort((a,b)=>a.id.localeCompare(b.id)).map(s=>({id:s.id,name:s.name,points:s.points!,durationMinutes:s.durationMinutes!,version:s.version}));
   hoursSnapshot={openMinute:branch.bookingOpenMinute,closeMinute:branch.bookingCloseMinute};
   scheduledClosesAt=requireSessionFits(scheduledAt,sessionMinutes,hoursSnapshot).closesAt;
   for(const service of services)if(service.openMinute!=null && service.closeMinute!=null)requireSessionFits(scheduledAt,sessionMinutes,{openMinute:service.openMinute,closeMinute:service.closeMinute});
  }else if(await tx.branchService.count({where:{branchId:branch.id}})){
   // An old client may not bypass the service catalog using the former branch price.
   throw new DomainError('SERVICE_SELECTION_REQUIRED');
  }
  const wallet=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:actorId}}});
  if(!wallet)throw new DomainError('ACCOUNT_NOT_FOUND');
  if(!wallet.expiresAt||wallet.expiresAt<=now)throw new DomainError('WALLET_EXPIRY_REVIEW_REQUIRED');
  const hold=await tx.pointAccount.upsert({where:{type_ownerUserId:{type:'BOOKING_HOLD',ownerUserId:actorId}},create:{type:'BOOKING_HOLD',ownerUserId:actorId},update:{}});
  const id=randomUUID(),policySnapshot=snapshotPolicy(p.configuration);
  const posted=await postInTransaction(tx,{actorId,idempotencyKey,referenceId:id,reason:'Reserve points for scheduled booking',points:{kind:'BOOKING_RESERVE',entries:[{accountId:wallet.id,delta:-BigInt(points)},{accountId:hold.id,delta:BigInt(points)}]}});
  const b=await tx.booking.create({data:{id,traineeId:actorId,branchId:branch.id,policyId:p.id,policySnapshot,scheduledAt,deadlineAt:cancellationDeadline(scheduledAt,policySnapshot),points,sessionMinutes,serviceSnapshots,...(hoursSnapshot?{hoursSnapshot,scheduledClosesAt}:{}),pricingPolicyId:pricing.id,unitPricePiasters:pricing.pointPricePiasters,redemptionBps:pricing.redemptionBps,branchPricingVersion:branch.pricingVersion,walletId:wallet.id,holdAccountId:hold.id,idempotencyKey,requestHash,reserveTransactionId:posted.pointTransactionId!}});
  await audit(tx,actorId,'BOOKING_CREATED',id,'Scheduled visit; points held and no gym receivable created');
  return bookingView(b);
 });
}
async function settle(tx:Tx,b:Booking,actorId:string,allocation:unknown,status:'ATTENDED'|'CANCELLED'|'RESOLVED',reason:string) {
 const split=allocatePoints(b.points,allocation),now=new Date();
 await tx.$executeRaw`INSERT INTO "PointAccount"(id,type) VALUES (${randomUUID()}::uuid,'REDEEMED') ON CONFLICT DO NOTHING`;
 const redeemed=await tx.pointAccount.findFirstOrThrow({where:{type:'REDEEMED'}});
 const entries=[{accountId:b.holdAccountId,delta:-BigInt(b.points)}];
 if(split.traineePoints)entries.push({accountId:b.walletId,delta:BigInt(split.traineePoints)});
 if(split.gymPoints+split.platformPoints)entries.push({accountId:redeemed.id,delta:BigInt(split.gymPoints+split.platformPoints)});
 // Platform-retained points are consumed; only the gym share creates a gym liability.
 const amount=(BigInt(split.gymPoints)*b.unitPricePiasters*BigInt(b.redemptionBps)+9999n)/10000n;
 if(amount>9223372036854775807n)throw new DomainError('INVALID_INPUT');
 let money;
 const branch=await tx.branch.findUniqueOrThrow({where:{id:b.branchId}});
 if(amount>0n){
  await tx.$executeRaw`INSERT INTO "MoneyAccount"(id,type) VALUES (${randomUUID()}::uuid,'PLATFORM_OFFSET') ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`INSERT INTO "MoneyAccount"(id,type,"gymId") VALUES (${randomUUID()}::uuid,'GYM_AVAILABLE',${branch.gymId}::uuid) ON CONFLICT DO NOTHING`;
  const offset=await tx.moneyAccount.findFirstOrThrow({where:{type:'PLATFORM_OFFSET'}});
  const available=await tx.moneyAccount.findFirstOrThrow({where:{type:'GYM_AVAILABLE',gymId:branch.gymId,branchId:null}});
  money={kind:'VISIT_SETTLEMENT' as const,entries:[{accountId:offset.id,delta:-amount},{accountId:available.id,delta:amount}]};
 }
 const posted=await postInTransaction(tx,{actorId,idempotencyKey:'booking-resolution:'+b.id,referenceId:b.id,reason,points:{kind:'BOOKING_SETTLE',entries},money});
 let visitId:string|undefined;
 if(status==='ATTENDED'){
  let endsAt=new Date(now.getTime()+b.sessionMinutes*60000);
  if(b.hoursSnapshot){
   endsAt=attendanceEnd(now,b.sessionMinutes,b.hoursSnapshot as unknown as DailyHours,b.scheduledClosesAt);
  }
  await tx.visit.updateMany({where:{traineeId:b.traineeId,branchId:b.branchId,status:'ACTIVE',expiresAt:{lte:now}},data:{status:'EXPIRED'}});
  if(await tx.visit.findFirst({where:{traineeId:b.traineeId,branchId:b.branchId,status:'ACTIVE'}}))throw new DomainError('INVALID_STATE');
  const visit=await tx.visit.create({data:{traineeId:b.traineeId,branchId:b.branchId,cashierId:actorId,pointsCharged:b.points,settlementPiasters:amount,policyId:b.pricingPolicyId,unitPricePiasters:b.unitPricePiasters,redemptionBps:b.redemptionBps,branchPricingVersion:b.branchPricingVersion,startedAt:now,expiresAt:endsAt,pointTransactionId:posted.pointTransactionId!,moneyTransactionId:posted.moneyTransactionId!}});
  visitId=visit.id;
 }
 const updated=await tx.booking.update({where:{id:b.id},data:{status,...split,resolutionTransactionId:posted.pointTransactionId,moneyTransactionId:posted.moneyTransactionId,visitId,decisionReason:reason,decidedById:actorId,decidedAt:now,qrHash:null,qrExpiresAt:null,qrSessionId:null}});
 await audit(tx,actorId,'BOOKING_'+status,b.id,reason);
 return updated;
}
async function expire(tx:Tx,b:Booking,actorId:string){
 if(b.status!=='RESERVED'||b.deadlineAt>new Date())return b;
 const policy=snapshotPolicy(b.policySnapshot);
 if(policy.mode==='AUTOMATIC')return settle(tx,b,actorId,policy.allocation,'RESOLVED','Automatic no-show policy');
 const updated=await tx.booking.update({where:{id:b.id},data:{status:'PENDING_REVIEW',qrHash:null,qrExpiresAt:null,qrSessionId:null}});
 await audit(tx,actorId,'BOOKING_PENDING_REVIEW',b.id,'Grace period ended; funds remain held for administrator review');
 return updated;
}
export function cancelBooking(db:PrismaClient,actorId:string,id:string,input:unknown){
 parse(uuid,id);const data=parse(reasonSchema,input);
 return serializable(db,async tx=>{
  await trainee(tx,actorId);let b=await lockBooking(tx,id);
  if(b.traineeId!==actorId)throw new DomainError('ACCESS_DENIED');
  if(b.status==='CANCELLED')return bookingView(b);
  if(!['RESERVED','PENDING_REVIEW'].includes(b.status))throw new DomainError('INVALID_STATE');
  b=await tx.booking.update({where:{id},data:{absenceReason:data.reason}});
  if(b.status==='RESERVED'&&b.deadlineAt>new Date())b=await settle(tx,b,actorId,{traineeBps:10000,gymBps:0,platformBps:0},'CANCELLED',data.reason);
  else b=await expire(tx,b,actorId);
  return bookingView(b);
 });
}
export function decideBooking(db:PrismaClient,actorId:string,id:string,input:unknown){
 parse(uuid,id);const data=parse(decisionSchema,input);
 return serializable(db,async tx=>{
  await requireAdmin(tx,actorId);let b=await lockBooking(tx,id);
  b=await expire(tx,b,actorId);
  if(b.status!=='PENDING_REVIEW')throw new DomainError('INVALID_STATE');
  return bookingView(await settle(tx,b,actorId,data.allocation,'RESOLVED',data.reason));
 });
}
export function issueBookingQr(db:PrismaClient,actorId:string,id:string,bearer:string){
 parse(uuid,id);
 return serializable(db,async tx=>{
  await trainee(tx,actorId);const b=await lockBooking(tx,id);
  if(b.traineeId!==actorId)throw new DomainError('ACCESS_DENIED');
  if(usesServices(b))throw new DomainError('BRANCH_QR_REQUIRED');
  const now=new Date();
  if(b.status!=='RESERVED'||now>=b.deadlineAt)throw new DomainError('INVALID_STATE');
  const session=await tx.authSession.findUnique({where:{tokenHash:hashToken(bearer)}});
  if(!session||session.userId!==actorId||session.revokedAt||session.expiresAt<=now)throw new DomainError('UNAUTHENTICATED');
  const token=randomBytes(32).toString('base64url'),expiresAt=new Date(Math.min(now.getTime()+60000,b.deadlineAt.getTime(),session.expiresAt.getTime()));
  await tx.booking.update({where:{id},data:{qrHash:hashToken(token),qrExpiresAt:expiresAt,qrSessionId:session.id}});
  return {bookingId:id,token,expiresAt,serverTime:now};
 });
}
export function scanBooking(db:PrismaClient,actorId:string,branchId:string,input:unknown){
 parse(uuid,branchId);const data=parse(scanSchema,input);
 return serializable(db,async tx=>{
  await requireBranchAccess(tx,actorId,branchId,'OPERATE_BRANCH');
  const found=await tx.booking.findUnique({where:{qrHash:hashToken(data.token)}});
  if(!found)throw new DomainError('QR_INVALID');
  const b=await lockBooking(tx,found.id),now=new Date();
  if(usesServices(b))throw new DomainError('BRANCH_QR_REQUIRED');
  if(b.qrHash!==hashToken(data.token)||b.branchId!==branchId||b.status!=='RESERVED'||!b.qrExpiresAt||b.qrExpiresAt<now||now>=b.deadlineAt)throw new DomainError('QR_INVALID');
  const session=b.qrSessionId?await tx.authSession.findUnique({where:{id:b.qrSessionId}}):null;
  if(!session||session.userId!==b.traineeId||session.revokedAt||session.expiresAt<=now)throw new DomainError('QR_INVALID');
  await trainee(tx,b.traineeId);
  return bookingView(await settle(tx,b,actorId,{traineeBps:0,gymBps:10000,platformBps:0},'ATTENDED','Gym scanned booking QR and confirmed physical attendance'));
 });
}
export function listBookings(db:PrismaClient,actorId:string,admin:boolean){
 return serializable(db,async tx=>{
  if(admin)await requireAdmin(tx,actorId);else await trainee(tx,actorId);
  const due=await tx.booking.findMany({where:{...(!admin?{traineeId:actorId}:{}),status:'RESERVED',deadlineAt:{lt:new Date()}},orderBy:{deadlineAt:'asc'},take:25});
  for(const row of due)await expire(tx,await lockBooking(tx,row.id),actorId);
  const items=await tx.booking.findMany({where:admin?{status:'PENDING_REVIEW'}:{traineeId:actorId},orderBy:{createdAt:'desc'},take:100});
  const branches=await tx.branch.findMany({where:{id:{in:items.map(b=>b.branchId)}},select:{id:true,name:true,gym:{select:{name:true}}}});
  const people=admin?await tx.user.findMany({where:{id:{in:items.map(b=>b.traineeId)}},select:{id:true,displayName:true}}):[];
  const branchMap=new Map(branches.map(b=>[b.id,b])),peopleMap=new Map(people.map(u=>[u.id,u.displayName]));
  return {items:items.map(b=>({...bookingView(b),branch:branchMap.get(b.branchId),...(admin?{traineeName:peopleMap.get(b.traineeId)}:{})})),processed:due.length,serverTime:new Date()};
 });
}

export function expireScheduledBooking(db:PrismaClient,id:string){
 parse(uuid,id);
 return serializable(db,async tx=>{
  const booking=await lockBooking(tx,id);
  if(booking.status!=='RESERVED')return null;
  if(booking.deadlineAt>new Date())return booking.deadlineAt.toISOString();
  const policy=await tx.bookingPolicy.findUniqueOrThrow({where:{id:booking.policyId},select:{createdById:true}});
  await expire(tx,booking,policy.createdById);
  await audit(tx,policy.createdById,'BOOKING_SCHEDULED_PROCESSING',id,'Durable booking timer applied the saved no-show policy');
  return null;
 });
}
