import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {postLedger,postInTransaction,serializable,reverseLedger} from '../src/ledger/service.js';
import {createSession} from '../src/auth/sessions.js';
import {confirmVisit,issueQr} from '../src/operations/service.js';
import {createBooking,issueBookingQr,scanBooking,expireScheduledBooking,decideBooking} from '../src/bookings/service.js';
import {publishBookingPolicy} from '../src/bookings/settings.js';
import {cancelVisit,requestReview,decideReview} from '../src/reviews/service.js';
import {recordCharge,chargeSummary,settleGymCharges} from '../src/charges/service.js';
import {branchEntitlements} from '../src/withdrawals/allocation.js';
import {requestWithdrawal} from '../src/withdrawals/service.js';
import {saveDelegation} from '../src/gyms/delegations.js';
import {buildApp} from '../src/app.js';

const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');
const db=new PrismaClient();after(()=>db.$disconnect());
const reason={reason:'Synthetic incorrect attendance cancelled'};
async function fixture(){
 const user=(role:'PLATFORM_ADMIN'|'GYM_OWNER'|'BRANCH_MANAGER'|'TRAINEE'|'CASHIER')=>db.user.create({data:{role,displayName:'Synthetic refund review',phoneE164:'+refund'+randomUUID()}});
 const admin=await user('PLATFORM_ADMIN'),owner=await user('GYM_OWNER'),manager=await user('BRANCH_MANAGER'),person=await user('TRAINEE'),cashier=await user('CASHIER');
 const gym=await db.gym.create({data:{ownerId:owner.id,name:'Synthetic refund gym',status:'ACTIVE',ownerAcceptedAt:new Date()}});
 const branch=await db.branch.create({data:{gymId:gym.id,name:'Refund branch',status:'ACTIVE',visitPricePoints:30,sessionMinutes:30,pricingVersion:1,priceApprovedAt:new Date()}});
 await db.staffAssignment.createMany({data:[{branchId:branch.id,userId:manager.id,role:'BRANCH_MANAGER'},{branchId:branch.id,userId:cashier.id,role:'CASHIER'}]});
 const latest=await db.pricingPolicy.findFirst({orderBy:{version:'desc'}});
 const pricing=await db.pricingPolicy.create({data:{version:(latest?.version??0)+1,pointPricePiasters:100n,gymDiscountBps: 0,redemptionBps:8000,createdById:admin.id}});
 const issuance=await db.pointAccount.findFirst({where:{type:'ISSUANCE'}})??await db.pointAccount.create({data:{type:'ISSUANCE'}});
 const expiry=new Date(Date.now()+86400000);
 const wallet=await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:person.id,expiresAt:expiry}});
 await postLedger(db,{actorId:admin.id,idempotencyKey:randomUUID(),reason:'Synthetic points',points:{kind:'ISSUE',entries:[{accountId:issuance.id,delta:-200n},{accountId:wallet.id,delta:200n}]}});
 const current=await db.bookingPolicy.findFirst({orderBy:{version:'desc'}});
 const policy=await publishBookingPolicy(db,admin.id,{expectedVersion:current?.version??0,policy:{graceMinutes:60,mode:'MANUAL'}});
 const bearer=await createSession(db,person.id,new Date(Date.now()+86400000));
 const booking=()=>createBooking(db,person.id,randomUUID(),{branchId:branch.id,scheduledAt:new Date(Date.now()+60000).toISOString(),policyVersion:policy.version,branchPricingVersion:1});
 const attend=async(booked:boolean)=>{
  if(booked){const b=await booking(),qr=await issueBookingQr(db,person.id,b.id,bearer);const attended=await scanBooking(db,owner.id,branch.id,{token:qr.token});return db.visit.findUniqueOrThrow({where:{id:attended.visitId!}});}
  const qr=await issueQr(db,person.id,bearer);
  const result=await confirmVisit(db,owner.id,branch.id,randomUUID(),{token:qr.token,pricingVersion:pricing.version,branchPricingVersion:1,presenceConfirmed:true});
  return db.visit.findUniqueOrThrow({where:{id:result.visit.id}});
 };
 const charge=(amountPiasters:bigint)=>serializable(db,tx=>recordCharge(tx,{gymId:gym.id,branchId:branch.id,sourceId:randomUUID(),kind:'MAINTENANCE',amountPiasters,description:'Synthetic maintenance debt'}));
 return {admin,owner,manager,person,cashier,gym,branch,wallet,expiry,booking,attend,charge};
}
for(const booked of [false,true])for(const fee of [0n,1000n,12000n]){
 test(`${booked?'booking':'direct'} visit cancellation refunds once after ${fee} service debt`,async()=>{
  const f=await fixture();if(fee)await f.charge(fee);
  // Another pending reservation must remain held after cancelling attendance.
  const pending=booked?await f.booking():null;
  const v=await f.attend(booked),key=randomUUID();
  assert.equal(v.settlementPiasters,2400n);
  const beforeCollections=await db.gymChargeCollection.findMany({where:{gymId:f.gym.id}});
  const results=await Promise.all([cancelVisit(db,f.manager.id,f.branch.id,v.id,key,reason),cancelVisit(db,f.manager.id,f.branch.id,v.id,key,reason)]);
  assert.equal(results[0].id,results[1].id);
  const wallet=await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}});
  assert.equal(wallet.balance,pending?170:200);assert.equal(wallet.expiresAt!.toISOString(),f.expiry.toISOString());
  const summary=await settleGymCharges(db,f.gym.id,f.owner.id);
  assert.equal(summary.grossAvailablePiasters,'0');assert.equal(summary.debtPiasters,fee.toString());
  const [entitlement]=await db.$transaction(tx=>branchEntitlements(tx,f.gym.id));assert.equal(entitlement!.earned,0n);assert.equal(entitlement!.available,0n);
  assert.equal(await db.visitCancellation.count({where:{visitId:v.id}}),1);
  const refunds=await db.gymChargeCollectionReversal.findMany({where:{visitId:v.id}});
  assert.equal(refunds.length,fee?1:0);
  for(const c of beforeCollections)assert.deepEqual(await db.gymChargeCollection.findUniqueOrThrow({where:{id:c.id}}),c);
  if(booked){
   const b=await db.booking.findUniqueOrThrow({where:{visitId:v.id}});assert.equal(b.status,'CANCELLED');assert.equal(b.traineePoints,30);assert.equal(b.gymPoints,0);
   assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:b.holdAccountId}})).balance,30);
   assert.equal((await db.booking.findUniqueOrThrow({where:{id:pending!.id}})).status,'RESERVED');
  }
  await assert.rejects(cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason),/VISIT_ALREADY_CANCELLED/);
  if(refunds[0]){
   await assert.rejects(db.gymChargeCollectionReversal.delete({where:{id:refunds[0].id}}));
   await assert.rejects(reverseLedger(db,{actorId:f.admin.id,idempotencyKey:randomUUID(),reason:'No bypass of visit refund',moneyTransactionId:refunds[0].moneyTransactionId}),/DOMAIN_APPROVAL_REQUIRED/);
  }
  if(booked&&fee===12000n){
   const app=buildApp(db),token=await createSession(db,f.admin.id,new Date(Date.now()+3600000));
   try{
    let cursor:string|null=null,found=false;
    do{
     const response: {statusCode:number;json:()=>{items:{id:string;debtPiasters:string;netAvailablePiasters:string}[];nextCursor:string|null}}=await app.inject({method:'GET',url:`/reports/platform-balances?kind=GYMS&limit=25${cursor?'&cursor='+cursor:''}`,headers:{authorization:`Bearer ${token}`}});
     assert.equal(response.statusCode,200);
     const page=response.json(),row=page.items.find((g:{id:string})=>g.id===f.gym.id);
     if(row){assert.equal(row.debtPiasters,'12000');assert.equal(row.netAvailablePiasters,'0');found=true;break;}
     cursor=page.nextCursor;
    }while(cursor);
    assert.equal(found,true);
   }finally{await app.close();}
  }
  if(fee===12000n){await f.attend(false);const next=await settleGymCharges(db,f.gym.id,f.owner.id);assert.equal(next.debtPiasters,'9600');assert.equal(next.grossAvailablePiasters,'0');}
 });
}
test('admin approval refunds booked attendance and reopens collected debt after the direct window',async t=>{
 const f=await fixture();await f.charge(12000n);const v=await f.attend(true);
 t.mock.timers.enable({apis:['Date'],now:Date.now()+11*60000});
 await assert.rejects(cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason),/CANCEL_WINDOW_CLOSED/);
 const request=await requestReview(db,f.manager.id,randomUUID(),{kind:'VISIT_CANCEL',targetId:v.id,reason:reason.reason,evidenceText:'Synthetic evidence of incorrect attendance'});
 const decision={decision:'APPROVE',reason:'Synthetic administrator verified incorrect attendance'};
 await assert.rejects(decideReview(db,f.owner.id,request.id,decision),/ACCESS_DENIED/);
 await decideReview(db,f.admin.id,request.id,decision);await decideReview(db,f.admin.id,request.id,decision);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,200);
 assert.equal((await settleGymCharges(db,f.gym.id,f.owner.id)).debtPiasters,'12000');
 assert.equal(await db.gymChargeCollectionReversal.count({where:{visitId:v.id}}),1);
});
test('cashier, expired wallet and reserved payouts cannot bypass cancellation protection',async()=>{
 const f=await fixture();await f.charge(1000n);const v=await f.attend(true);
 await assert.rejects(cancelVisit(db,f.cashier.id,f.branch.id,v.id,randomUUID(),reason));
 await db.pointAccount.update({where:{id:f.wallet.id},data:{expiresAt:new Date(Date.now()-1000)}});
 await assert.rejects(cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason),/WALLET_EXPIRY_REVIEW_REQUIRED/);
 await db.pointAccount.update({where:{id:f.wallet.id},data:{expiresAt:f.expiry}});
 await requestWithdrawal(db,f.owner.id,f.gym.id,randomUUID(),{amountPiasters:'1',paymentMethod:'WALLET',destinationAccount:'+201000000001',destinationName:'Synthetic recipient'});
 await assert.rejects(cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason),/SETTLEMENT_REVIEW_REQUIRED/);
 assert.equal(await db.gymChargeCollectionReversal.count({where:{visitId:v.id}}),0);
 assert.equal((await db.visit.findUniqueOrThrow({where:{id:v.id}})).status,'ACTIVE');
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,170);
});
test('cancelling one branch reallocates fees to the remaining branch earnings',async()=>{
 const f=await fixture();await f.charge(1200n);const v=await f.attend(false);
 const branch=await db.branch.create({data:{gymId:f.gym.id,name:'Second earning branch',status:'ACTIVE',visitPricePoints:30,sessionMinutes:30,pricingVersion:1,priceApprovedAt:new Date()}});
 const bearer=await createSession(db,f.person.id,new Date(Date.now()+3600000)),qr=await issueQr(db,f.person.id,bearer);
 const pricing=await db.pricingPolicy.findFirstOrThrow({orderBy:{version:'desc'}});
 await confirmVisit(db,f.owner.id,branch.id,randomUUID(),{token:qr.token,pricingVersion:pricing.version,branchPricingVersion:1,presenceConfirmed:true});
 await cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason);
 const rows=await db.$transaction(tx=>branchEntitlements(tx,f.gym.id));
 assert.equal(rows.find(b=>b.id===f.branch.id)!.available,0n);assert.equal(rows.find(b=>b.id===branch.id)!.available,1200n);
 assert.equal(rows.reduce((sum,b)=>sum+b.available,0n),BigInt((await settleGymCharges(db,f.gym.id,f.owner.id)).netAvailablePiasters));
});
test('an open dispute still blocks booked visit cancellation without refunding points',async()=>{
 const f=await fixture(),v=await f.attend(true);
 const {createHold}=await import('../src/disputes/service.js');
 await createHold(db,f.admin.id,{visitId:v.id,amountPiasters:'1',key:randomUUID(),confirmed:true,reason:'Synthetic disputed attendance'});
 await assert.rejects(cancelVisit(db,f.manager.id,f.branch.id,v.id,randomUUID(),reason),/SETTLEMENT_REVIEW_REQUIRED/);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,170);
});
test('database rejects a service collection reversal without an atomic cancellation receipt',async()=>{
 const f=await fixture();await f.charge(12000n);const v=await f.attend(false);
 const c=await db.gymChargeCollection.findFirstOrThrow({where:{gymId:f.gym.id}});
 const original=await db.moneyTransaction.findUniqueOrThrow({where:{id:c.moneyTransactionId},include:{postings:true}});
 await assert.rejects(db.$transaction(async tx=>{
  const posted=await postInTransaction(tx,{actorId:f.admin.id,idempotencyKey:randomUUID(),referenceId:v.id,reason:'Synthetic forged fee refund',money:{kind:'ADJUSTMENT',reversalOfId:original.id,entries:original.postings.map(p=>({accountId:p.accountId,delta:-p.deltaPiasters}))}});
  await tx.gymChargeCollectionReversal.create({data:{collectionId:c.id,visitId:v.id,moneyTransactionId:posted.moneyTransactionId!}});
 }));
 assert.equal(await db.gymChargeCollectionReversal.count({where:{visitId:v.id}}),0);
 assert.equal((await settleGymCharges(db,f.gym.id,f.owner.id)).debtPiasters,'9600');
});
test('database rejects changing an attended booking to cancelled without its visit and wallet refund',async()=>{
 const f=await fixture(),v=await f.attend(true),b=await db.booking.findUniqueOrThrow({where:{visitId:v.id}});
 await assert.rejects(db.booking.update({where:{id:b.id},data:{status:'CANCELLED',traineePoints:30,gymPoints:0,platformPoints:0,decisionReason:reason.reason,decidedById:f.owner.id,decidedAt:new Date()}}));
 assert.equal((await db.booking.findUniqueOrThrow({where:{id:b.id}})).status,'ATTENDED');
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,170);
});
for(const mode of ['MANUAL','AUTOMATIC'] as const)test(`${mode} no-show gym share belongs to the branch and can be withdrawn by its delegate`,async t=>{
 const f=await fixture();
 if(mode==='AUTOMATIC'){
  const current=await db.bookingPolicy.findFirstOrThrow({orderBy:{version:'desc'}});
  await publishBookingPolicy(db,f.admin.id,{expectedVersion:current.version,policy:{graceMinutes:0,mode:'AUTOMATIC',allocation:{traineeBps:0,gymBps:5000,platformBps:5000}}});
 }
 const policy=await db.bookingPolicy.findFirstOrThrow({orderBy:{version:'desc'}});
 const b=await createBooking(db,f.person.id,randomUUID(),{branchId:f.branch.id,scheduledAt:new Date(Date.now()+1000).toISOString(),policyVersion:policy.version,branchPricingVersion:1});
 t.mock.timers.enable({apis:['Date'],now:Date.now()+2*3600000});
 await expireScheduledBooking(db,b.id);
 if(mode==='MANUAL')await decideBooking(db,f.admin.id,b.id,{reason:'Synthetic reviewed no-show split',allocation:{traineeBps:5000,gymBps:5000,platformBps:0}});
 assert.equal(await db.visit.count({where:{branchId:f.branch.id}}),0);
 const [entitlement]=await db.$transaction(tx=>branchEntitlements(tx,f.gym.id));
 assert.equal(entitlement!.earned,1200n);assert.equal(entitlement!.available,1200n);
 await saveDelegation(db,f.owner.id,f.gym.id,{userId:f.manager.id,branchId:f.branch.id,permissions:['REQUEST_WITHDRAWAL'],fullAccess:false,active:true,expectedVersion:0});
 const w=await requestWithdrawal(db,f.manager.id,f.gym.id,randomUUID(),{branchId:f.branch.id,amountPiasters:'1200',paymentMethod:'WALLET',destinationAccount:'+201000000001',destinationName:'Synthetic recipient'});
 const allocation=await db.withdrawalAllocation.findFirstOrThrow({where:{withdrawalId:w.id}});assert.equal(allocation.branchId,f.branch.id);assert.equal(allocation.amountPiasters,1200n);
 assert.equal((await db.$transaction(tx=>branchEntitlements(tx,f.gym.id)))[0]!.available,0n);
});
