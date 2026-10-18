import type { Prisma, WithdrawalRequest } from "@prisma/client";

/** Called only after request authorization, inside the detail's repeatable-read snapshot. */
export async function withdrawalBalances(tx: Prisma.TransactionClient, row: WithdrawalRequest) {
 const accounts = await tx.moneyAccount.findMany({where:{gymId:row.gymId,branchId:null,type:{in:["GYM_AVAILABLE","GYM_RESERVED","GYM_DISPUTED","GYM_PAID"]}},select:{id:true,type:true,balancePiasters:true}});
 const postings = await tx.moneyPosting.groupBy({by:["accountId"],where:{accountId:{in:accounts.map(a=>a.id)},transaction:{posted:true}},_sum:{deltaPiasters:true}});
 const pending = await tx.withdrawalRequest.aggregate({where:{gymId:row.gymId,status:{in:["REQUESTED","APPROVED"]}},_sum:{amountPiasters:true}});
 const get=(type:string)=>accounts.find(a=>a.type===type)?.balancePiasters??0n;
 const available=get("GYM_AVAILABLE"), reserved=get("GYM_RESERVED"), disputed=get("GYM_DISPUTED"), paid=get("GYM_PAID");
 const currentReserved=["REQUESTED","APPROVED"].includes(row.status)?row.amountPiasters:0n;
 const ledgerMatches=accounts.every(a=>a.balancePiasters===(postings.find(p=>p.accountId===a.id)?._sum.deltaPiasters??0n));
 const consistent=ledgerMatches && accounts.every(a=>a.balancePiasters>=0n) && reserved===(pending._sum.amountPiasters??0n) && reserved>=currentReserved;
 return {
  asOf:new Date(), consistent,
  netEntitlementsPiasters:(available+reserved+disputed+paid).toString(),
  outstandingPiasters:(available+reserved+disputed).toString(),
  availablePiasters:available.toString(), reservedPiasters:reserved.toString(),
  currentReservedPiasters:currentReserved.toString(),
  otherReservedPiasters:consistent?(reserved-currentReserved).toString():null,
  disputedPiasters:disputed.toString(), paidPiasters:paid.toString(),
  availableAfterPaymentPiasters:currentReserved>0n && consistent?available.toString():null,
 };
}
