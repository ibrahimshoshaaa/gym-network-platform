import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type Booking } from '@prisma/client';
import { z } from 'zod';
import { requireActor, requireAdmin, requireBranchAccess } from '../auth/authorization.js';
import { hashToken } from '../auth/sessions.js';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { postInTransaction, serializable } from '../ledger/service.js';
import { allocationSchema, allocatePoints, cancellationDeadline, snapshotPolicy } from './policy.js';

type Tx = Prisma.TransactionClient;
const uuid = z.string().uuid();
export const createBookingSchema = z.object({
 branchId: uuid, scheduledAt: z.string().datetime({offset:true}),
 policyVersion: z.number().int().positive(), branchPricingVersion: z.number().int().positive(),
}).strict();
export const reasonSchema = z.object({reason:z.string().trim().min(1).max(1000)}).strict();
export const decisionSchema = reasonSchema.extend({allocation:allocationSchema}).strict();
export const scanSchema = z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict();
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
 const idempotencyKey='booking:'+actorId+':'+key,requestHash=digest(data);
 return serializable(db,async tx=>{
  await trainee(tx,actorId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
  const old=await tx.booking.findUnique({where:{idempotencyKey}});
  if(old){if(old.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT');return bookingView(old);}
  const now=new Date(),scheduledAt=new Date(data.scheduledAt);
  if(scheduledAt<=now)throw new DomainError('INVALID_INPUT');
  const branch=await tx.branch.findUnique({where:{id:data.branchId},include:{gym:{include:{owner:true}}}});
  if(!branch||branch.status!=='ACTIVE'||branch.gym.status!=='ACTIVE'||!branch.gym.ownerAcceptedAt||!branch.gym.owner.isActive||!branch.priceApprovedAt)throw new DomainError('BRANCH_NOT_READY');
  const p=await tx.bookingPolicy.findFirst({orderBy:{version:'desc'}});
  const pricing=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'}});
  if(!p||!pricing)throw new DomainError('PRICING_NOT_CONFIGURED');
  if(p.version!==data.policyVersion||branch.pricingVersion!==data.branchPricingVersion)throw new DomainError('STALE_SETTINGS');
  const wallet=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:actorId}}});
  if(!wallet)throw new DomainError('ACCOUNT_NOT_FOUND');
  if(!wallet.expiresAt||wallet.expiresAt<=now)throw new DomainError('WALLET_EXPIRY_REVIEW_REQUIRED');
  const hold=await tx.pointAccount.upsert({where:{type_ownerUserId:{type:'BOOKING_HOLD',ownerUserId:actorId}},create:{type:'BOOKING_HOLD',ownerUserId:actorId},update:{}});
  const id=randomUUID(),policySnapshot=snapshotPolicy(p.configuration);
  const posted=await postInTransaction(tx,{actorId,idempotencyKey,referenceId:id,reason:'Reserve points for scheduled booking',points:{kind:'BOOKING_RESERVE',entries:[{accountId:wallet.id,delta:-BigInt(branch.visitPricePoints)},{accountId:hold.id,delta:BigInt(branch.visitPricePoints)}]}});
  const b=await tx.booking.create({data:{id,traineeId:actorId,branchId:branch.id,policyId:p.id,policySnapshot,scheduledAt,deadlineAt:cancellationDeadline(scheduledAt,policySnapshot),points:branch.visitPricePoints,sessionMinutes:branch.sessionMinutes,pricingPolicyId:pricing.id,unitPricePiasters:pricing.pointPricePiasters,redemptionBps:pricing.redemptionBps,branchPricingVersion:branch.pricingVersion,walletId:wallet.id,holdAccountId:hold.id,idempotencyKey,requestHash,reserveTransactionId:posted.pointTransactionId!}});
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
  await tx.visit.updateMany({where:{traineeId:b.traineeId,branchId:b.branchId,status:'ACTIVE',expiresAt:{lte:now}},data:{status:'EXPIRED'}});
  if(await tx.visit.findFirst({where:{traineeId:b.traineeId,branchId:b.branchId,status:'ACTIVE'}}))throw new DomainError('INVALID_STATE');
  const visit=await tx.visit.create({data:{traineeId:b.traineeId,branchId:b.branchId,cashierId:actorId,pointsCharged:b.points,settlementPiasters:amount,policyId:b.pricingPolicyId,unitPricePiasters:b.unitPricePiasters,redemptionBps:b.redemptionBps,branchPricingVersion:b.branchPricingVersion,startedAt:now,expiresAt:new Date(now.getTime()+b.sessionMinutes*60000),pointTransactionId:posted.pointTransactionId!,moneyTransactionId:posted.moneyTransactionId!}});
  visitId=visit.id;
 }
 const updated=await tx.booking.update({where:{id:b.id},data:{status,...split,resolutionTransactionId:posted.pointTransactionId,moneyTransactionId:posted.moneyTransactionId,visitId,decisionReason:reason,decidedById:actorId,decidedAt:now,qrHash:null,qrExpiresAt:null,qrSessionId:null}});
 await audit(tx,actorId,'BOOKING_'+status,b.id,reason);
 return updated;
}
async function expire(tx:Tx,b:Booking,actorId:string){
 if(b.status!=='RESERVED'||b.deadlineAt>=new Date())return b;
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
  if(b.status==='RESERVED'&&b.deadlineAt>=new Date())b=await settle(tx,b,actorId,{traineeBps:10000,gymBps:0,platformBps:0},'CANCELLED',data.reason);
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
  const now=new Date();
  if(b.status!=='RESERVED'||now>b.deadlineAt)throw new DomainError('INVALID_STATE');
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
  await requireBranchAccess(tx,actorId,branchId,'SELL_POINTS');
  const found=await tx.booking.findUnique({where:{qrHash:hashToken(data.token)}});
  if(!found)throw new DomainError('QR_INVALID');
  const b=await lockBooking(tx,found.id),now=new Date();
  if(b.qrHash!==hashToken(data.token)||b.branchId!==branchId||b.status!=='RESERVED'||!b.qrExpiresAt||b.qrExpiresAt<now||now>b.deadlineAt)throw new DomainError('QR_INVALID');
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

/** Server-only scheduler. No client session or platform-admin password is needed. */
export async function processDueBookings(db:PrismaClient, limit=25) {
 if(!Number.isInteger(limit)||limit<1||limit>50)throw new DomainError('INVALID_INPUT');
 const cutoff=new Date(), stopAt=Date.now()+40000;
 const due=await db.booking.findMany({where:{status:'RESERVED',deadlineAt:{lt:cutoff}},orderBy:[{deadlineAt:'asc'},{id:'asc'}],take:limit,select:{id:true}});
 let processed=0,failed=0;
 for(const candidate of due){
  if(Date.now()>=stopAt)break;
  try {
   const changed=await serializable(db,async tx=>{
    // Skip a scan/cancellation or another worker currently holding this booking.
    const locked=await tx.$queryRaw<{id:string}[]>`SELECT id FROM "Booking" WHERE id=${candidate.id}::uuid AND status='RESERVED' AND "deadlineAt"<${cutoff} FOR UPDATE SKIP LOCKED`;
    if(!locked.length)return false;
    const booking=await tx.booking.findUniqueOrThrow({where:{id:candidate.id}});
    const policy=await tx.bookingPolicy.findUniqueOrThrow({where:{id:booking.policyId},select:{createdById:true}});
    // Attribution uses the author of the policy authorized when booking was made.
    // expire() uses the immutable snapshot, never the current platform policy.
    const updated=await expire(tx,booking,policy.createdById);
    if(updated.status===booking.status)return false;
    await audit(tx,policy.createdById,'BOOKING_SCHEDULED_PROCESSING',booking.id,'Scheduled no-show processor applied the saved booking policy');
    return true;
   });
   if(changed)processed++;
  }catch{
   failed++;
   // A failed item stays RESERVED after rollback and is retried next invocation.
   // Do not expose booking or trainee details to the scheduler response/logs.
  }
 }
 const hasMore=Boolean(await db.booking.findFirst({where:{status:'RESERVED',deadlineAt:{lt:cutoff}},select:{id:true}}));
 return {processed,failed,hasMore,asOf:cutoff};
}
