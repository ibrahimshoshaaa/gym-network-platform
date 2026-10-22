import type {Prisma} from '@prisma/client';
import {DomainError} from '../domain/errors.js';
const committed=['REQUESTED','APPROVED','PAID','DISPUTED'] as const;
/** Derived attribution leaves the existing reconciled monetary ledger intact. */
export async function branchEntitlements(tx:Prisma.TransactionClient,gymId:string){
 const branches=await tx.branch.findMany({where:{gymId},select:{id:true,name:true},orderBy:{id:'asc'}});
 const earned=await tx.visit.groupBy({by:['branchId'],where:{branch:{gymId},status:{not:'CANCELLED'}},_sum:{settlementPiasters:true}});
 const holds=await tx.financialHold.findMany({where:{gymId,state:'OPEN'},select:{amountPiasters:true,visitId:true}});
 const heldVisits=await tx.visit.findMany({where:{id:{in:holds.map(h=>h.visitId)}},select:{id:true,branchId:true}});
 const used=await tx.withdrawalAllocation.groupBy({by:['branchId'],where:{withdrawal:{gymId,status:{in:[...committed]}}},_sum:{amountPiasters:true}});
 const fees=await tx.gymChargeCollection.findMany({where:{gymId},select:{allocations:true}});
 const feeByBranch=new Map<string,bigint>();
 for(const f of fees)for(const a of f.allocations as {branchId:string|null;amountPiasters:string}[])if(a.branchId)feeByBranch.set(a.branchId,(feeByBranch.get(a.branchId)??0n)+BigInt(a.amountPiasters));
 const legacy=(await tx.withdrawalRequest.aggregate({where:{gymId,allocationVersion:0,status:{in:[...committed]}},_sum:{amountPiasters:true}}))._sum.amountPiasters??0n;
 return branches.map(b=>{const total=earned.find(e=>e.branchId===b.id)?._sum.settlementPiasters??0n,reserved=used.find(e=>e.branchId===b.id)?._sum.amountPiasters??0n,disputed=holds.filter(h=>heldVisits.find(v=>v.id===h.visitId)?.branchId===b.id).reduce((n,h)=>n+h.amountPiasters,0n);const free=total-reserved-disputed-legacy-(feeByBranch.get(b.id)??0n);
  return {...b,earned:total,committed:reserved,disputed,available:free>0n?free:0n,legacyReviewRequired:legacy>0n};});
}
export async function allocateWithdrawal(tx:Prisma.TransactionClient,gymId:string,amount:bigint,branchId?:string){
 const rows=await branchEntitlements(tx,gymId);
 if(branchId){const branch=rows.find(b=>b.id===branchId);if(!branch||branch.available<amount)throw new DomainError('INSUFFICIENT_FUNDS');return [{branchId,amountPiasters:amount}];}
 let remaining=amount;const allocations:{branchId:string|null;amountPiasters:bigint}[]=[];
 for(const b of rows){if(remaining===0n)break;const take=b.available<remaining?b.available:remaining;if(take>0n){allocations.push({branchId:b.id,amountPiasters:take});remaining-=take;}}
 // Legacy/adjustment funds retain a distinct unattributed portion. The main
 // ledger still atomically checks the gym's actual available money.
 if(remaining>0n)allocations.push({branchId:null,amountPiasters:remaining});
 return allocations;
}
