import { Prisma } from '@prisma/client';
/** Called only inside the globally authorized admin report snapshot. */
export async function platformFinance(tx:Prisma.TransactionClient,now:Date){
 const points=await tx.$queryRaw<{type:string;balance:string}[]>`SELECT type::text AS type,coalesce(sum(balance),0)::text AS balance FROM "PointAccount" GROUP BY type`;
 const [wallets]=await tx.$queryRaw<{spendable:string;expired:string;undated:string}[]>`SELECT coalesce(sum(balance) FILTER(WHERE "expiresAt">${now}),0)::text AS spendable,coalesce(sum(balance) FILTER(WHERE "expiresAt"<=${now}),0)::text AS expired,coalesce(sum(balance) FILTER(WHERE "expiresAt" IS NULL),0)::text AS undated FROM "PointAccount" WHERE type='TRAINEE_WALLET'`;
 const money=await tx.$queryRaw<{type:string;amount:string}[]>`SELECT type::text AS type,coalesce(sum("balancePiasters"),0)::text AS amount FROM "MoneyAccount" WHERE "gymId" IS NOT NULL GROUP BY type`;
 const receipts=await tx.$queryRaw<{source:string;amount:string;count:string}[]>`SELECT 'TRAINEES'::text AS source,coalesce(sum(amount),0)::text AS amount,count(*)::text AS count FROM (SELECT t."chargePiasters" AS amount FROM "TopupRequest" t JOIN "PointTransaction" p ON p.id=t."pointTransactionId" AND p.posted WHERE t.status='APPROVED' UNION ALL SELECT d."chargePiasters" FROM "PointDispatch" d JOIN "PointTransaction" p ON p.id=d."pointTransactionId" AND p.posted WHERE d.kind='ADMIN_TOPUP') r`;
 const [archive]=await tx.$queryRaw<{amount:string;points:string}[]>`SELECT coalesce(sum("amountPiasters") FILTER(WHERE "recordType"='TOPUP' AND data->>'status'='APPROVED'),0)::text AS amount,coalesce(sum(points) FILTER(WHERE "recordType"='POINT_ACCOUNT'),0)::text AS points FROM "FinancialArchiveRecord"`;
 const [paid]=await tx.$queryRaw<{amount:string}[]>`SELECT coalesce(sum(w."amountPiasters"),0)::text AS amount FROM "WithdrawalRequest" w JOIN "MoneyTransaction" t ON t.id=w."paymentTransactionId" AND t.posted WHERE w."paidAt" IS NOT NULL`;
 const point=(type:string)=>points.find(p=>p.type===type)?.balance??'0',amount=(type:string)=>money.find(m=>m.type===type)?.amount??'0';
 const trainee=point('TRAINEE_WALLET'),available=amount('GYM_AVAILABLE'),reserved=amount('GYM_RESERVED'),disputed=amount('GYM_DISPUTED');
 const policy=await tx.pricingPolicy.findFirst({orderBy:{version:'desc'},select:{version:true,pointPricePiasters:true,redemptionBps:true}});
 const futurePoints=BigInt(wallets!.spendable);
 const projection=policy?{points:futurePoints.toString(),amount:((futurePoints*policy.pointPricePiasters*BigInt(policy.redemptionBps)+9999n)/10000n).toString(),policyVersion:policy.version}:null;
 const total=receipts.reduce((n,r)=>n+BigInt(r.amount),BigInt(archive!.amount)),outstanding=BigInt(available)+BigInt(reserved)+BigInt(disputed),payout=BigInt(paid!.amount);
 return {projection,points:{trainees:trainee,archived:archive!.points,circulating:trainee,spendable:wallets!.spendable,expired:wallets!.expired,undated:wallets!.undated,issued:(-BigInt(point('ISSUANCE'))).toString(),redeemed:point('REDEEMED'),retired:point('EXPIRED')},liabilities:{available,reserved,disputed,total:outstanding.toString(),paid:payout.toString()},collections:{total:total.toString(),trainees:receipts.find(r=>r.source==='TRAINEES')?.amount??'0',archived:archive!.amount,afterPayouts:(total-payout).toString(),afterLiabilities:(total-payout-outstanding).toString()}};
}

