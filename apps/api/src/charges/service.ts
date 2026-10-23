import {randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {DomainError} from '../domain/errors.js';
import {postInTransaction,queueChargeCollection,serializable} from '../ledger/service.js';
import {branchEntitlements} from '../withdrawals/allocation.js';
type Tx=Prisma.TransactionClient;
/** Independent committed reconciliation for existing and newly-due charges. */
export async function settleGymCharges(db:PrismaClient,gymId:string,actorId:string){
 return serializable(db,async tx=>{
  await collectDueCharges(tx,gymId,actorId,randomUUID());
  return chargeSummary(tx,gymId);
 });
}
export async function lockGymCharges(tx:Tx,gymId:string){
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withdrawal-allocation:${gymId}`},0))`;
}
export async function recordCharge(tx:Tx,input:{gymId:string;branchId:string;kind:'MAINTENANCE'|'PROMOTION';sourceId:string;amountPiasters:bigint;description:string;dueAt?:Date}){
 await lockGymCharges(tx,input.gymId);
 if(input.amountPiasters<0n)throw new DomainError('INVALID_INPUT');
 const old=await tx.gymServiceCharge.findUnique({where:{kind_sourceId:{kind:input.kind,sourceId:input.sourceId}}});
 if(old){if(old.amountPiasters!==input.amountPiasters||old.gymId!==input.gymId)throw new DomainError('INVALID_STATE');queueChargeCollection(tx,input.gymId);return old;}
 queueChargeCollection(tx,input.gymId);
 return tx.gymServiceCharge.create({data:{...input,dueAt:input.dueAt??new Date()}});
}
export function chargeOutstanding(amount:bigint,collected:bigint){
 if(amount<0n||collected<0n||collected>amount)throw new DomainError('INVALID_STATE');
 return amount-collected;
}
export async function chargeSummary(tx:Tx,gymId:string){
 const now=new Date();
 const [charges,collections,cash]=await Promise.all([
  tx.gymServiceCharge.findMany({where:{gymId,voidedAt:null},orderBy:[{dueAt:'asc'},{id:'asc'}]}),
  tx.gymChargeCollection.findMany({where:{gymId},select:{chargeId:true,amountPiasters:true}}),
  tx.moneyAccount.findFirst({where:{gymId,branchId:null,type:'GYM_AVAILABLE'}}),
 ]);
 const collectedByCharge=new Map<string,bigint>();for(const p of collections)collectedByCharge.set(p.chargeId,(collectedByCharge.get(p.chargeId)??0n)+p.amountPiasters);
 const items=charges.map(c=>{const collected=collectedByCharge.get(c.id)??0n;return {...c,collected,outstanding:chargeOutstanding(c.amountPiasters,collected)};});
 const debt=items.filter(c=>c.dueAt<=now).reduce((a,c)=>a+c.outstanding,0n);
 const scheduled=items.filter(c=>c.dueAt>now).reduce((a,c)=>a+c.outstanding,0n);
 const available=cash?.balancePiasters??0n;
 return {debtPiasters:debt.toString(),scheduledPiasters:scheduled.toString(),grossAvailablePiasters:available.toString(),netAvailablePiasters:(available>debt?available-debt:0n).toString(),items:items.map(c=>({...c,amountPiasters:c.amountPiasters.toString(),collectedPiasters:c.collected.toString(),outstandingPiasters:c.outstanding.toString(),collected:undefined,outstanding:undefined}))};
}
/** Set off due fees independently of payouts. Reserved/paid/disputed money is untouched. */
export async function collectDueCharges(tx:Tx,gymId:string,actorId:string,requestId:string){
 await lockGymCharges(tx,gymId);
 const summary=await chargeSummary(tx,gymId);
 let available=BigInt(summary.grossAvailablePiasters);
 const sources=await branchEntitlements(tx,gymId);
 for(const c of summary.items){
  if(c.dueAt>new Date()||available===0n)continue;
  const outstanding=BigInt(c.outstandingPiasters),amount=outstanding<available?outstanding:available;
  if(amount===0n)continue;
  const from=await tx.moneyAccount.findFirstOrThrow({where:{gymId,branchId:null,type:'GYM_AVAILABLE'}});
  const to=await tx.moneyAccount.findFirstOrThrow({where:{type:'PLATFORM_OFFSET',gymId:null,branchId:null}});
  const allocations:{branchId:string|null;amountPiasters:string}[]=[];let remaining=amount;
  for(const b of sources){const take=b.available<remaining?b.available:remaining;if(take>0n){allocations.push({branchId:b.id,amountPiasters:take.toString()});b.available-=take;remaining-=take;}if(!remaining)break;}
  if(remaining>0n)allocations.push({branchId:null,amountPiasters:remaining.toString()});
  const leg=await postInTransaction(tx,{actorId,idempotencyKey:`service-fee:${requestId}:${c.id}`,referenceId:c.sourceId,reason:`خصم مديونية ${c.kind==='MAINTENANCE'?'صيانة':'إعلان'} من مستحقات الجيم`,money:{kind:'ADJUSTMENT',entries:[{accountId:from.id,delta:-amount},{accountId:to.id,delta:amount}]}});
  await tx.gymChargeCollection.create({data:{id:randomUUID(),gymId,chargeId:c.id,amountPiasters:amount,moneyTransactionId:leg.moneyTransactionId!,allocations}});
  available-=amount;
 }
}
