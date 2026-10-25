// Synthetic archived sale receipts exercise historical reads/corrections after retirement.
// Funding is an explicit test-only administrative adjustment, never a public stock sale.
import {randomUUID} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {postInTransaction,serializable} from '../src/ledger/service.js';
import {saleView} from '../src/operations/service.js';
export async function historicalSale(db:PrismaClient,actorId:string,branchId:string,key:string,input:unknown){
 const d=input as {traineeId:string;points:number;pricingVersion:number;receivedAmountPiasters:string};
 return serializable(db,async tx=>{
  const user=await tx.user.findUniqueOrThrow({where:{id:d.traineeId}}),policy=await tx.pricingPolicy.findUniqueOrThrow({where:{version:d.pricingVersion}});
  const from=await tx.pointAccount.findUniqueOrThrow({where:{type_branchId:{type:'BRANCH_INVENTORY',branchId}}}),to=await tx.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:d.traineeId}}}),id=randomUUID();
  const posted=await postInTransaction(tx,{actorId,idempotencyKey:`archive-sale:${key}`,referenceId:id,reason:'Synthetic archived sale fixture',points:{kind:'ADJUSTMENT',entries:[{accountId:from.id,delta:-BigInt(d.points)},{accountId:to.id,delta:BigInt(d.points)}]}});
  await tx.pointAccount.update({where:{id:to.id},data:{expiresAt:new Date(Date.now()+90*86400000)}});
  return saleView(await tx.pointSale.create({data:{id,cashierId:actorId,branchId,traineeId:d.traineeId,traineeLabel:user.displayName,phoneLast4:user.phoneE164.slice(-4),points:d.points,chargePiasters:BigInt(d.receivedAmountPiasters),unitPricePiasters:policy.pointPricePiasters,policyId:policy.id,pricingVersion:policy.version,idempotencyKey:`archive-sale:${key}`,requestHash:'0'.repeat(64),pointTransactionId:posted.pointTransactionId!}}));
 });
}
