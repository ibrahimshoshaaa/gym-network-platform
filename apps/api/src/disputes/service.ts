import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient,FinancialHold} from '@prisma/client';
import {z} from 'zod';
import {requireActor,requireAdmin,requireGymOwner} from '../auth/authorization.js';
import {parse} from '../gyms/validation.js';
import {audit} from '../gyms/service.js';
import {serializable,postInTransaction} from '../ledger/service.js';
import {DomainError} from '../domain/errors.js';
const reason=z.string().trim().min(5).max(1000),money=z.string().regex(/^[1-9][0-9]*$/).refine(v=>BigInt(v)<=9223372036854775807n);
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const holdView=(r:FinancialHold)=>({id:r.id,gymId:r.gymId,visitId:r.visitId,amountPiasters:r.amountPiasters.toString(),reason:r.reason,state:r.state,createdAt:r.createdAt,releasedAt:r.releasedAt,releaseReason:r.releaseReason});
async function accounts(tx:Prisma.TransactionClient,gymId:string){await tx.$executeRaw`INSERT INTO "MoneyAccount" (id,type,"gymId") VALUES (${randomUUID()}::uuid,'GYM_DISPUTED',${gymId}::uuid) ON CONFLICT DO NOTHING`;const available=await tx.moneyAccount.findFirst({where:{gymId,branchId:null,type:'GYM_AVAILABLE'}}),disputed=await tx.moneyAccount.findFirstOrThrow({where:{gymId,branchId:null,type:'GYM_DISPUTED'}});if(!available)throw new DomainError('SETTLEMENT_REVIEW_REQUIRED');return{available,disputed};}
export async function createHold(db:PrismaClient,actorId:string,input:unknown){const d=parse(z.object({visitId:z.string().uuid(),amountPiasters:money,reason,key:z.string().uuid(),confirmed:z.literal(true)}).strict(),input),idempotencyKey=`hold:${actorId}:${d.key}`,requestHash=digest(d);return serializable(db,async tx=>{
 await requireAdmin(tx,actorId);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
 const old=await tx.financialHold.findUnique({where:{idempotencyKey}});if(old){if(old.requestHash!==requestHash)throw new DomainError('IDEMPOTENCY_CONFLICT');return holdView(old);}
 await tx.$queryRaw`SELECT id FROM "Visit" WHERE id=${d.visitId}::uuid FOR UPDATE`;
 const visit=await tx.visit.findUnique({where:{id:d.visitId},include:{branch:true,moneyTransaction:{include:{postings:{include:{account:true}}}}}});
 if(!visit||visit.status==='CANCELLED'||!visit.moneyTransaction.posted)throw new DomainError('SETTLEMENT_REVIEW_REQUIRED');
 const original=visit.moneyTransaction,credit=original.postings.find(p=>p.account.type==='GYM_AVAILABLE'&&p.account.gymId===visit.branch.gymId&&p.deltaPiasters===visit.settlementPiasters);
 if(!credit||original.kind!=='VISIT_SETTLEMENT')throw new DomainError('SETTLEMENT_REVIEW_REQUIRED');
 const outflow=await tx.moneyPosting.findFirst({where:{accountId:credit.accountId,deltaPiasters:{lt:0n},transaction:{createdAt:{gte:original.createdAt},kind:{notIn:['VISIT_REVERSAL','DISPUTE_HOLD','DISPUTE_RELEASE']}}}});
 if(outflow)throw new DomainError('SETTLEMENT_REVIEW_REQUIRED');
 const existing=await tx.financialHold.aggregate({where:{visitId:visit.id,state:'OPEN'},_sum:{amountPiasters:true}}),amount=BigInt(d.amountPiasters);
 if(amount+(existing._sum.amountPiasters??0n)>visit.settlementPiasters)throw new DomainError('INVALID_INPUT');
 const {available,disputed}=await accounts(tx,visit.branch.gymId),id=randomUUID();
 const posted=await postInTransaction(tx,{actorId,idempotencyKey,referenceId:id,reason:d.reason,money:{kind:'DISPUTE_HOLD',entries:[{accountId:available.id,delta:-amount},{accountId:disputed.id,delta:amount}]}});
 const row=await tx.financialHold.create({data:{id,gymId:visit.branch.gymId,visitId:visit.id,amountPiasters:amount,reason:d.reason,createdById:actorId,holdTransactionId:posted.moneyTransactionId!,idempotencyKey,requestHash}});
 await audit(tx,actorId,'DISPUTE_HELD',id,d.reason);return holdView(row);
});}
export async function releaseHold(db:PrismaClient,actorId:string,id:string,input:unknown){const d=parse(z.object({reason,key:z.string().uuid(),confirmed:z.literal(true)}).strict(),input),releaseKey=`releasehold:${actorId}:${d.key}`;return serializable(db,async tx=>{
 await requireAdmin(tx,actorId);await tx.$queryRaw`SELECT id FROM "FinancialHold" WHERE id=${id}::uuid FOR UPDATE`;
 const row=await tx.financialHold.findUnique({where:{id}});if(!row)throw new DomainError('NOT_FOUND');
 if(row.state!=='OPEN'){if(row.releaseKey===releaseKey&&row.releaseReason===d.reason)return holdView(row);throw new DomainError('INVALID_STATE');}
 const {available,disputed}=await accounts(tx,row.gymId);
 const posted=await postInTransaction(tx,{actorId,idempotencyKey:releaseKey,referenceId:id,reason:d.reason,money:{kind:'DISPUTE_RELEASE',entries:[{accountId:disputed.id,delta:-row.amountPiasters},{accountId:available.id,delta:row.amountPiasters}]}});
 const updated=await tx.financialHold.update({where:{id},data:{state:'RELEASED',releaseKey,releaseReason:d.reason,releasedAt:new Date(),releasedById:actorId,releaseTransactionId:posted.moneyTransactionId!}});await audit(tx,actorId,'DISPUTE_RELEASED',id,d.reason);return holdView(updated);
});}
export async function listHolds(db:PrismaClient,actorId:string,input:unknown){const q=parse(z.object({limit:z.coerce.number().int().min(1).max(50).default(25),cursor:z.string().uuid().optional()}).strict(),input);return db.$transaction(async tx=>{const actor=await requireActor(tx,actorId),gym=actor.role==='PLATFORM_ADMIN'?{}:{gymId:{in:(await tx.gym.findMany({where:{ownerAcceptedAt:{not:null},OR:[{ownerId:actorId},{delegations:{some:{userId:actorId,active:true,fullAccess:true,branchId:null}},branches:{some:{staff:{some:{userId:actorId,active:true,role:'BRANCH_MANAGER'}}}}}]},select:{id:true}})).map(g=>g.id)}};if(!['PLATFORM_ADMIN','GYM_OWNER'].includes(actor.role)&&!gym.gymId?.in.length)throw new DomainError('ACCESS_DENIED');const rows=await tx.financialHold.findMany({where:gym,orderBy:{id:'desc'},take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{})});const gyms=await tx.gym.findMany({where:{id:{in:rows.map(r=>r.gymId)}},select:{id:true,name:true}});return{items:rows.slice(0,q.limit).map(r=>({...holdView(r),gymName:gyms.find(g=>g.id===r.gymId)?.name})),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};});}
