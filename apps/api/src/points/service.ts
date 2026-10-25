import { createHash,randomUUID } from 'node:crypto';
import { Prisma,type PrismaClient,type PointDispatch } from '@prisma/client';
import { z } from 'zod';
import { phoneSchema } from '../auth/validation.js';
import { requireActor,requireAdmin } from '../auth/authorization.js';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { postInTransaction,serializable } from '../ledger/service.js';
import { calculateQuote } from '../topups/service.js';
type Tx=Prisma.TransactionClient;
export const uuid=z.string().uuid();
const quoteSchema=z.object({recipientId:uuid,points:z.number().int().positive().max(2147483647)}).strict();
const sendSchema=quoteSchema.extend({pricingVersion:z.number().int().positive(),recipientLabel:z.string().min(1).max(100),receivedAmountPiasters:z.string().regex(/^\d+$/),fundsReceived:z.literal(true),recipientConfirmed:z.literal(true),paymentMethod:z.enum(['CASH','INSTAPAY','WALLET']).default('CASH'),paymentReference:z.string().trim().min(3).max(100).optional()}).strict();
export const dispatchView=(r:PointDispatch)=>({id:r.id,kind:r.kind,recipientLabel:r.recipientLabel,phoneLast4:r.phoneLast4,points:r.points,chargePiasters:r.chargePiasters.toString(),createdAt:r.createdAt});
async function wallet(tx:Tx,id:string){const a=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:id}}});if(!a)throw new DomainError('ACCOUNT_NOT_FOUND');if(a.balance>0&&(!a.expiresAt||a.expiresAt<=new Date()))throw new DomainError('WALLET_EXPIRY_REVIEW_REQUIRED');return a;}
export async function lookup(tx:Tx,id:string,input:unknown){
 await requireAdmin(tx,id);
 const d=parse(z.object({phone:phoneSchema}).strict(),input),u=await tx.user.findUnique({where:{phoneE164:d.phone}});
 if(!u?.isActive||u.role!=='TRAINEE')throw new DomainError('TRAINEE_UNAVAILABLE');
 return {id:u.id,label:u.displayName,phoneLast4:u.phoneE164.slice(-4),role:u.role};
}
async function quote(tx:Tx,id:string,data:z.infer<typeof quoteSchema>,){
 await requireAdmin(tx,id);
 const recipient=await requireActor(tx,data.recipientId);if(recipient.role!=='TRAINEE')throw new DomainError('TRAINEE_UNAVAILABLE');
 const destination=await wallet(tx,recipient.id),policy=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'}});
 if(!policy)throw new DomainError('PRICING_NOT_CONFIGURED');
 return {recipient,policy,destination,price:calculateQuote(policy.pointPricePiasters,0,{points:data.points})};
}
export async function pointQuote(tx:Tx,id:string,input:unknown){
 const d=parse(quoteSchema,input),q=await quote(tx,id,d),recipientBalance=String(q.destination.balance);
 return {recipientBalance,recipientAfter:(BigInt(recipientBalance)+BigInt(d.points)).toString(),recipientId:q.recipient.id,recipientLabel:q.recipient.displayName,phoneLast4:q.recipient.phoneE164.slice(-4),points:d.points,chargePiasters:q.price.chargePiasters.toString(),pricingVersion:q.policy.version,discountBps:0};
}
export async function dispatchPoints(db:PrismaClient,id:string,key:string,input:unknown){const d=parse(sendSchema,input);parse(uuid,key);if(d.paymentMethod==='CASH'&&d.paymentReference)throw new DomainError('INVALID_INPUT');if(d.paymentMethod!=='CASH'&&!d.paymentReference)throw new DomainError('INVALID_INPUT');
 // Preserve the historical canonical hash prefix for retries of already posted platform credits.
 const idempotencyKey=`dispatch:${id}:${key}`,requestHash=createHash('sha256').update(JSON.stringify({sourceGymId:null,...d})).digest('hex');
 try{return await serializable(db,async tx=>{
  await requireAdmin(tx,id);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
  const old=await tx.pointDispatch.findUnique({where:{idempotencyKey}});if(old){if(old.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT');return dispatchView(old);}
  const q=await quote(tx,id,{recipientId:d.recipientId,points:d.points});
  if(q.policy.version!==d.pricingVersion||q.recipient.displayName!==d.recipientLabel)throw new DomainError('STALE_SETTINGS');
  if(q.price.chargePiasters!==BigInt(d.receivedAmountPiasters))throw new DomainError('PAYMENT_AMOUNT_MISMATCH');
  const paymentReference=d.paymentMethod==='CASH'?`CASH-${idempotencyKey}`:d.paymentReference!.toUpperCase();
  if(paymentReference)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'payment-reference:'+paymentReference},0))`;
  if(paymentReference&&(await tx.topupRequest.findUnique({where:{paymentReference}})||await tx.pointDispatch.findUnique({where:{paymentReference}})))throw new DomainError('PAYMENT_REFERENCE_USED');
  const destination=q.destination;
  if(!destination)throw new DomainError('ACCOUNT_NOT_FOUND');
  const entries:{accountId:string;delta:bigint}[]=[{accountId:destination.id,delta:BigInt(d.points)}];
  const issuance=await tx.pointAccount.findFirst({where:{type:'ISSUANCE'}});if(!issuance)throw new DomainError('ACCOUNT_NOT_FOUND');entries.push({accountId:issuance.id,delta:-BigInt(d.points)});
  const operationId=randomUUID(),posted=await postInTransaction(tx,{actorId:id,idempotencyKey,referenceId:operationId,reason:'Admin confirmed received funds and directly topped up trainee',points:{kind:'ISSUE',entries}});
  await tx.pointAccount.update({where:{id:destination.id},data:{expiresAt:new Date(Date.now()+90*86400000)}});
  const row=await tx.pointDispatch.create({data:{id:operationId,kind:'ADMIN_TOPUP',actorId:id,recipientId:d.recipientId,recipientLabel:q.recipient.displayName,phoneLast4:q.recipient.phoneE164.slice(-4),points:d.points,chargePiasters:q.price.chargePiasters,unitPricePiasters:q.policy.pointPricePiasters,discountBps:0,pricingVersion:q.policy.version,policyId:q.policy.id,paymentMethod:d.paymentMethod,paymentReference,pointTransactionId:posted.pointTransactionId!,idempotencyKey,requestHash}});
  await audit(tx,id,'ADMIN_DIRECT_TOPUP',row.id,'Recipient and received amount confirmed; immutable point dispatch posted');return dispatchView(row);
 });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'&&String(e.meta?.target).includes('paymentReference'))throw new DomainError('PAYMENT_REFERENCE_USED');throw e;}}

