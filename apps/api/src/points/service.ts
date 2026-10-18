import { createHash,randomUUID } from 'node:crypto';
import { Prisma,type PrismaClient,type PointDispatch } from '@prisma/client';
import { z } from 'zod';
import { phoneSchema } from '../auth/validation.js';
import { requireActor,requireAdmin,requireGymOwner } from '../auth/authorization.js';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { postInTransaction,serializable } from '../ledger/service.js';
import { calculateQuote } from '../topups/service.js';
type Tx=Prisma.TransactionClient;
export const uuid=z.string().uuid();
const quoteSchema=z.object({recipientId:uuid,points:z.number().int().positive().max(2147483647),gymId:uuid.optional()}).strict();
const sendSchema=quoteSchema.extend({pricingVersion:z.number().int().positive(),recipientLabel:z.string().min(1).max(100),receivedAmountPiasters:z.string().regex(/^\d+$/),fundsReceived:z.literal(true),recipientConfirmed:z.literal(true),paymentMethod:z.enum(['CASH','INSTAPAY','WALLET']).default('CASH'),paymentReference:z.string().trim().min(3).max(100).optional(),branchId:uuid.optional()}).strict();
export const dispatchView=(r:PointDispatch)=>({id:r.id,kind:r.kind,gymId:r.gymId,branchId:r.branchId,recipientLabel:r.recipientLabel,phoneLast4:r.phoneLast4,points:r.points,chargePiasters:r.chargePiasters.toString(),createdAt:r.createdAt});
async function owner(tx:Tx,id:string,gymId:string,active=true){const gym=await requireGymOwner(tx,id,gymId,false);if(active&&gym.status!=='ACTIVE')throw new DomainError('GYM_INACTIVE');return gym;}
async function customer(tx:Tx,id:string){const u=await requireActor(tx,id);if(u.role!=='TRAINEE')throw new DomainError('TRAINEE_UNAVAILABLE');return u;}
async function wallet(tx:Tx,id:string){const a=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:id}}});if(!a)throw new DomainError('ACCOUNT_NOT_FOUND');if(a.balance>0&&(!a.expiresAt||a.expiresAt<=new Date()))throw new DomainError('WALLET_EXPIRY_REVIEW_REQUIRED');return a;}
const eligible={status:'ACTIVE' as const,priceApprovedAt:{not:null},pricingVersion:{gt:0}};
export async function gymWallet(tx:Tx,id:string,gymId:string){const g=await owner(tx,id,gymId,false);const [totals]=await tx.$queryRaw<{total:string;available:string}[]>`SELECT coalesce(sum(a.balance),0)::text AS total,coalesce(sum(a.balance) FILTER(WHERE b.status='ACTIVE' AND b."priceApprovedAt" IS NOT NULL AND b."pricingVersion">0),0)::text AS available FROM "PointAccount" a JOIN "Branch" b ON b.id=a."branchId" WHERE a.type='BRANCH_INVENTORY' AND b."gymId"=${gymId}::uuid`;return {id:g.id,name:g.name,status:g.status,total:totals!.total,available:g.status==='ACTIVE'?totals!.available:'0'};}
export async function lookup(tx:Tx,id:string,input:unknown,gymId?:string){const d=parse(z.object({phone:phoneSchema}).strict(),input);if(gymId)await owner(tx,id,gymId);else await requireAdmin(tx,id);const u=await tx.user.findUnique({where:{phoneE164:d.phone}});if(!u?.isActive||(!gymId&&!['TRAINEE','GYM_OWNER'].includes(u.role))||(gymId&&u.role!=='TRAINEE'))throw new DomainError('TRAINEE_UNAVAILABLE');const gyms=u.role==='GYM_OWNER'?await tx.gym.findMany({where:{ownerId:u.id,ownerAcceptedAt:{not:null},status:'ACTIVE',branches:{some:eligible}},select:{id:true,name:true},orderBy:{id:'asc'}}):[];return {id:u.id,label:u.displayName,phoneLast4:u.phoneE164.slice(-4),role:u.role,gyms};}
async function quote(tx:Tx,id:string,data:z.infer<typeof quoteSchema>,sourceGymId?:string){
 const recipient=await requireActor(tx,data.recipientId);let branchId:string|undefined,targetGymId:string|undefined,stock:string|null=null;
 if(sourceGymId){await owner(tx,id,sourceGymId);await customer(tx,recipient.id);await wallet(tx,recipient.id);stock=(await gymWallet(tx,id,sourceGymId)).available;}
 else{await requireAdmin(tx,id);if(recipient.role==='TRAINEE'){if(data.gymId)throw new DomainError('INVALID_INPUT');await wallet(tx,recipient.id);}else if(recipient.role==='GYM_OWNER'&&data.gymId){const g=await tx.gym.findFirst({where:{id:data.gymId,ownerId:recipient.id,ownerAcceptedAt:{not:null},status:'ACTIVE'}});if(!g)throw new DomainError('GYM_ACCESS_DENIED');const b=await tx.branch.findFirst({where:{gymId:g.id,...eligible},orderBy:{id:'asc'}});if(!b)throw new DomainError('BRANCH_NOT_READY');branchId=b.id;targetGymId=g.id;}else throw new DomainError('INVALID_INPUT');}
 const policy=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'}});if(!policy)throw new DomainError('PRICING_NOT_CONFIGURED');const discountBps=branchId?policy.gymDiscountBps:0,price=calculateQuote(policy.pointPricePiasters,discountBps,{points:data.points});
 if(stock!==null&&BigInt(stock)<BigInt(data.points))throw new DomainError('INSUFFICIENT_POINTS');
 return {recipient,policy,branchId,targetGymId,discountBps,price,stock};
}
export async function pointQuote(tx:Tx,id:string,input:unknown,sourceGymId?:string){const d=parse(quoteSchema,input),q=await quote(tx,id,d,sourceGymId);const recipientBalance=q.targetGymId?(await tx.$queryRaw<{balance:string}[]>`SELECT coalesce(sum(a.balance),0)::text AS balance FROM "PointAccount" a JOIN "Branch" b ON b.id=a."branchId" WHERE a.type='BRANCH_INVENTORY' AND b."gymId"=${q.targetGymId}::uuid`)[0]!.balance:String((await wallet(tx,d.recipientId)).balance);return {recipientBalance,recipientAfter:(BigInt(recipientBalance)+BigInt(d.points)).toString(),recipientId:q.recipient.id,recipientLabel:q.recipient.displayName,phoneLast4:q.recipient.phoneE164.slice(-4),points:d.points,chargePiasters:q.price.chargePiasters.toString(),pricingVersion:q.policy.version,discountBps:q.discountBps,branchId:q.branchId,stock:q.stock};}
export async function dispatchPoints(db:PrismaClient,id:string,key:string,input:unknown,sourceGymId?:string){const d=parse(sendSchema,input);parse(uuid,key);if(sourceGymId&&(d.gymId!==sourceGymId||d.paymentMethod!=='CASH'||d.paymentReference))throw new DomainError('INVALID_INPUT');if(!sourceGymId&&d.paymentMethod==='CASH'&&d.paymentReference)throw new DomainError('INVALID_INPUT');if(!sourceGymId&&d.paymentMethod!=='CASH'&&!d.paymentReference)throw new DomainError('INVALID_INPUT');
 const idempotencyKey=`dispatch:${id}:${key}`,requestHash=createHash('sha256').update(JSON.stringify({sourceGymId:sourceGymId??null,...d})).digest('hex');
 try{return await serializable(db,async tx=>{
  if(sourceGymId)await owner(tx,id,sourceGymId,false);else await requireAdmin(tx,id);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
  const old=await tx.pointDispatch.findUnique({where:{idempotencyKey}});if(old){if(old.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT');return dispatchView(old);}
  const q=await quote(tx,id,{recipientId:d.recipientId,points:d.points,...(d.gymId?{gymId:d.gymId}:{})},sourceGymId);
  if(q.policy.version!==d.pricingVersion||q.recipient.displayName!==d.recipientLabel||(!sourceGymId&&q.branchId!==d.branchId))throw new DomainError('STALE_SETTINGS');
  if(q.price.chargePiasters!==BigInt(d.receivedAmountPiasters))throw new DomainError('PAYMENT_AMOUNT_MISMATCH');
  const paymentReference=sourceGymId?null:(d.paymentMethod==='CASH'?`CASH-${idempotencyKey}`:d.paymentReference!.toUpperCase());
  if(paymentReference)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'payment-reference:'+paymentReference},0))`;
  if(paymentReference&&(await tx.topupRequest.findUnique({where:{paymentReference}})||await tx.pointDispatch.findUnique({where:{paymentReference}})))throw new DomainError('PAYMENT_REFERENCE_USED');
  const destination=q.branchId?await tx.pointAccount.findUnique({where:{type_branchId:{type:'BRANCH_INVENTORY',branchId:q.branchId}}}):await wallet(tx,d.recipientId);
  if(!destination)throw new DomainError('ACCOUNT_NOT_FOUND');
  const entries:{accountId:string;delta:bigint}[]=[{accountId:destination.id,delta:BigInt(d.points)}];
  if(sourceGymId){const sources=await tx.pointAccount.findMany({where:{type:'BRANCH_INVENTORY',balance:{gt:0},branch:{gymId:sourceGymId,...eligible}},orderBy:[{balance:'desc'},{id:'asc'}],take:99});let left=BigInt(d.points);for(const a of sources){if(left===0n)break;const amount=BigInt(a.balance)<left?BigInt(a.balance):left;entries.push({accountId:a.id,delta:-amount});left-=amount;}if(left)throw new DomainError('INSUFFICIENT_POINTS');}
  else{const issuance=await tx.pointAccount.findFirst({where:{type:'ISSUANCE'}});if(!issuance)throw new DomainError('ACCOUNT_NOT_FOUND');entries.push({accountId:issuance.id,delta:-BigInt(d.points)});}
  const operationId=randomUUID(),posted=await postInTransaction(tx,{actorId:id,idempotencyKey,referenceId:operationId,reason:sourceGymId?'Gym owner confirmed cash collection and sent points from owned stock':'Admin confirmed received funds and directly topped up recipient',points:{kind:sourceGymId?'TRANSFER':'ISSUE',entries}});
  if(!q.branchId)await tx.pointAccount.update({where:{id:destination.id},data:{expiresAt:new Date(Date.now()+90*86400000)}});
  const row=await tx.pointDispatch.create({data:{id:operationId,kind:sourceGymId?'GYM_SALE':'ADMIN_TOPUP',actorId:id,recipientId:d.recipientId,recipientLabel:q.recipient.displayName,phoneLast4:q.recipient.phoneE164.slice(-4),gymId:sourceGymId??q.targetGymId,branchId:q.branchId,points:d.points,chargePiasters:q.price.chargePiasters,unitPricePiasters:q.policy.pointPricePiasters,discountBps:q.discountBps,pricingVersion:q.policy.version,policyId:q.policy.id,paymentMethod:d.paymentMethod,paymentReference,pointTransactionId:posted.pointTransactionId!,idempotencyKey,requestHash}});
  await audit(tx,id,sourceGymId?'GYM_POINTS_SOLD':'ADMIN_DIRECT_TOPUP',row.id,'Recipient and received amount confirmed; immutable point dispatch posted');return dispatchView(row);
 });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002'&&String(e.meta?.target).includes('paymentReference'))throw new DomainError('PAYMENT_REFERENCE_USED');throw e;}}
