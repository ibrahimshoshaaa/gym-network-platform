import { Prisma } from '@prisma/client';
/** Called only inside the globally authorized admin report snapshot. */
export async function platformFinance(tx:Prisma.TransactionClient,now:Date){
 const points=await tx.$queryRaw<{type:string;balance:string}[]>`SELECT type::text AS type,coalesce(sum(balance),0)::text AS balance FROM "PointAccount" GROUP BY type`;
 const [wallets]=await tx.$queryRaw<{spendable:string;expired:string;undated:string}[]>`SELECT coalesce(sum(balance) FILTER(WHERE "expiresAt">${now}),0)::text AS spendable,coalesce(sum(balance) FILTER(WHERE "expiresAt"<=${now}),0)::text AS expired,coalesce(sum(balance) FILTER(WHERE "expiresAt" IS NULL),0)::text AS undated FROM "PointAccount" WHERE type='TRAINEE_WALLET'`;
 const money=await tx.$queryRaw<{type:string;amount:string}[]>`SELECT type::text AS type,coalesce(sum("balancePiasters"),0)::text AS amount FROM "MoneyAccount" WHERE "gymId" IS NOT NULL GROUP BY type`;
 const receipts=await tx.$queryRaw<{source:string;amount:string;count:string}[]>`SELECT source,sum(amount)::text AS amount,count(*)::text AS count FROM (SELECT CASE WHEN t.kind='TRAINEE' THEN 'TRAINEES' ELSE 'GYMS' END AS source,t."chargePiasters" AS amount FROM "TopupRequest" t JOIN "PointTransaction" p ON p.id=t."pointTransactionId" AND p.posted WHERE t.status='APPROVED' UNION ALL SELECT CASE WHEN d."gymId" IS NULL THEN 'TRAINEES' ELSE 'GYMS' END,d."chargePiasters" FROM "PointDispatch" d JOIN "PointTransaction" p ON p.id=d."pointTransactionId" AND p.posted WHERE d.kind='ADMIN_TOPUP') r GROUP BY source`;
 const [paid]=await tx.$queryRaw<{amount:string}[]>`SELECT coalesce(sum(w."amountPiasters"),0)::text AS amount FROM "WithdrawalRequest" w JOIN "MoneyTransaction" t ON t.id=w."paymentTransactionId" AND t.posted WHERE w."paidAt" IS NOT NULL`;
 const point=(type:string)=>points.find(p=>p.type===type)?.balance??'0',amount=(type:string)=>money.find(m=>m.type===type)?.amount??'0';
 const trainee=point('TRAINEE_WALLET'),gym=(BigInt(point('BRANCH_INVENTORY'))+BigInt(point('GYM_INVENTORY'))).toString(),available=amount('GYM_AVAILABLE'),reserved=amount('GYM_RESERVED'),disputed=amount('GYM_DISPUTED');
 const policy=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'},select:{version:true,pointPricePiasters:true,redemptionBps:true}});
 const futurePoints=BigInt(wallets!.spendable)+BigInt(gym);
 const projection=policy?{points:futurePoints.toString(),amount:((futurePoints*policy.pointPricePiasters*BigInt(policy.redemptionBps)+9999n)/10000n).toString(),policyVersion:policy.version}:null;
 const total=receipts.reduce((n,r)=>n+BigInt(r.amount),0n),outstanding=BigInt(available)+BigInt(reserved)+BigInt(disputed),payout=BigInt(paid!.amount);
 return {projection,points:{trainees:trainee,gyms:gym,circulating:(BigInt(trainee)+BigInt(gym)).toString(),spendable:wallets!.spendable,expired:wallets!.expired,undated:wallets!.undated,issued:(-BigInt(point('ISSUANCE'))).toString(),redeemed:point('REDEEMED'),retired:point('EXPIRED')},liabilities:{available,reserved,disputed,total:outstanding.toString(),paid:payout.toString()},collections:{total:total.toString(),trainees:receipts.find(r=>r.source==='TRAINEES')?.amount??'0',gyms:receipts.find(r=>r.source==='GYMS')?.amount??'0',afterPayouts:(total-payout).toString(),afterLiabilities:(total-payout-outstanding).toString()}};
}

