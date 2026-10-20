import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test,{after} from 'node:test';
import {PrismaClient} from '@prisma/client';
import {dispatchPoints,pointQuote,lookup,gymWallet} from '../src/points/service.js';
import {postLedger,reverseLedger} from '../src/ledger/service.js';
import {walletMovements} from '../src/wallet/service.js';
import {platformFinance} from '../src/reports/platform.js';
import {reportRows} from '../src/reports/service.js';
import {submitTopup,reviewTopup} from '../src/topups/service.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');
const db=new PrismaClient();after(()=>db.$disconnect());
const code=(p:Promise<unknown>,c:string)=>assert.rejects(p,(e:unknown)=>!!e&&typeof e==='object'&&'code' in e&&e.code===c);
async function fixture(){
 const user=(role:'PLATFORM_ADMIN'|'GYM_OWNER'|'TRAINEE'|'CASHIER')=>db.user.create({data:{role,displayName:'Synthetic Dispatch '+role,phoneE164:'+2010'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,12))%100000000n).padStart(8,'0')}});
 const admin=await user('PLATFORM_ADMIN'),owner=await user('GYM_OWNER'),other=await user('GYM_OWNER'),trainee=await user('TRAINEE'),cashier=await user('CASHIER');
 const gym=await db.gym.create({data:{ownerId:owner.id,name:'Synthetic Dispatch Gym',ownerAcceptedAt:new Date(),status:'ACTIVE'}});
 const branch=(status:'ACTIVE'|'SUSPENDED')=>db.branch.create({data:{gymId:gym.id,name:'Synthetic Dispatch Branch',status,visitPricePoints:20,sessionMinutes:60,priceApprovedAt:new Date(),pricingVersion:1}});
 const a=await branch('ACTIVE'),b=await branch('ACTIVE'),frozen=await branch('SUSPENDED');
 const stock=(branchId:string)=>db.pointAccount.create({data:{branchId,type:'BRANCH_INVENTORY'}});
 const central=await db.pointAccount.create({data:{type:'GYM_INVENTORY',gymId:gym.id}});
 const x=await stock(a.id),y=await stock(b.id),z=await stock(frozen.id),w=await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:trainee.id}});
 const issuance=await db.pointAccount.findFirstOrThrow({where:{type:'ISSUANCE'}});
 await postLedger(db,{actorId:admin.id,idempotencyKey:randomUUID(),reason:'Synthetic dispatch fixture funding',points:{kind:'ISSUE',entries:[{accountId:issuance.id,delta:-200n},{accountId:central.id,delta:50n},{accountId:x.id,delta:30n},{accountId:y.id,delta:20n},{accountId:z.id,delta:100n}]}});
 const quote=(actor=owner.id,points=40,source:string|undefined=gym.id,target:string|undefined=undefined,recipientId=trainee.id)=>db.$transaction(tx=>pointQuote(tx,actor,{recipientId,points,...(target?{gymId:target}:{})},source));
 const body=(q:Awaited<ReturnType<typeof quote>>,target:string|undefined=gym.id)=>({recipientId:q.recipientId,recipientLabel:q.recipientLabel,points:q.points,pricingVersion:q.pricingVersion,receivedAmountPiasters:q.chargePiasters,fundsReceived:true,recipientConfirmed:true,paymentMethod:'CASH',...(q.branchId?{branchId:q.branchId}:{}),...(target?{gymId:target}:{})});
 return {admin,owner,other,trainee,cashier,gym,a,b,frozen,central,x,y,z,w,quote,body};
}
test('owner sells only from independent central stock without cashier assignment; replay once and immutable report attribution',async()=>{
 const f=await fixture(),q=await f.quote(),payload=f.body(q),key=randomUUID(),before=await db.moneyTransaction.count();
 const balance=await db.$transaction(tx=>gymWallet(tx,f.owner.id,f.gym.id));assert.equal(balance.total,'200');assert.equal(balance.available,'50');
 const collectionBefore=await db.$transaction(tx=>platformFinance(tx,new Date()));
 const results=await Promise.all(Array.from({length:4},()=>dispatchPoints(db,f.owner.id,key,payload,f.gym.id)));assert.equal(new Set(results.map(r=>r.id)).size,1);
 const row=await db.pointDispatch.findUniqueOrThrow({where:{id:results[0]!.id}});assert.equal(row.branchId,null);assert.equal(row.gymId,f.gym.id);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.w.id}})).balance,40);assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.z.id}})).balance,100);
 const remaining=await db.pointAccount.findMany({where:{id:{in:[f.x.id,f.y.id]}}});assert.equal(remaining.reduce((s,a)=>s+a.balance,0),50);assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.central.id}})).balance,10);assert.equal(await db.moneyTransaction.count(),before);
 assert.equal((await db.$transaction(tx=>platformFinance(tx,new Date()))).collections.total,collectionBefore.collections.total);
 const movement=(await walletMovements(db,f.trainee.id,{})).items.find(r=>r.referenceId===row.id);assert.equal(movement?.operation,'SALE');assert.equal(movement?.branch,null);assert.match(movement?.sourceLabel??'',/Synthetic Dispatch Gym/);
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),report=await reportRows(db,f.owner.id,{gymId:f.gym.id,kind:'SALES',from:date,to:date});assert.equal(report.items.find(r=>r.id===row.id)?.branchId,null);
 await code(dispatchPoints(db,f.owner.id,key,{...payload,points:41},f.gym.id),'IDEMPOTENCY_CONFLICT');
 await assert.rejects(db.pointDispatch.update({where:{id:row.id},data:{points:41}}));
 await code(reverseLedger(db,{actorId:f.admin.id,idempotencyKey:randomUUID(),reason:'Cannot bypass immutable direct dispatch',pointTransactionId:row.pointTransactionId}),'DOMAIN_APPROVAL_REQUIRED');
});
test('admin phone topups quote and record trainee and gym collections at actual prices',async()=>{
 const f=await fixture();const found=await db.$transaction(tx=>lookup(tx,f.admin.id,{phone:f.trainee.phoneE164}));assert.equal(found.label,f.trainee.displayName);assert.equal(found.id,f.trainee.id);
 const before=await db.$transaction(tx=>platformFinance(tx,new Date()));
 const traineeQuote=await db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.trainee.id,points:10}));
 const first=await dispatchPoints(db,f.admin.id,randomUUID(),{...f.body(traineeQuote),gymId:undefined});assert.equal(first.kind,'ADMIN_TOPUP');
 const ownerQuote=await db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.owner.id,gymId:f.gym.id,points:10}));
 const second=await dispatchPoints(db,f.admin.id,randomUUID(),f.body(ownerQuote));assert.equal(second.gymId,f.gym.id);assert.equal(second.branchId,null);assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.central.id}})).balance,60);
 const after=await db.$transaction(tx=>platformFinance(tx,new Date()));assert.equal(BigInt(after.collections.trainees)-BigInt(before.collections.trainees),BigInt(traineeQuote.chargePiasters));assert.equal(BigInt(after.collections.gyms)-BigInt(before.collections.gyms),BigInt(ownerQuote.chargePiasters));
 const movements=await walletMovements(db,f.trainee.id,{});assert.equal(movements.items.find(r=>r.referenceId===first.id)?.operation,'TOPUP');
});
test('scope, stale review, amount and received-money confirmation are enforced without side effects',async()=>{
 const f=await fixture(),q=await f.quote(),payload=f.body(q),before=await db.pointDispatch.count();
 for(const actor of [f.other.id,f.cashier.id,f.admin.id])await code(dispatchPoints(db,actor,randomUUID(),payload,f.gym.id),'GYM_ACCESS_DENIED');
 await code(dispatchPoints(db,f.owner.id,randomUUID(),{...payload,fundsReceived:false},f.gym.id),'INVALID_INPUT');
 await code(dispatchPoints(db,f.owner.id,randomUUID(),{...payload,recipientLabel:'Wrong recipient'},f.gym.id),'STALE_SETTINGS');
 await code(dispatchPoints(db,f.owner.id,randomUUID(),{...payload,pricingVersion:q.pricingVersion+1},f.gym.id),'STALE_SETTINGS');
 await code(dispatchPoints(db,f.owner.id,randomUUID(),{...payload,receivedAmountPiasters:'1'},f.gym.id),'PAYMENT_AMOUNT_MISMATCH');
 await code(f.quote(f.owner.id,51),'INSUFFICIENT_POINTS');assert.equal(await db.pointDispatch.count(),before);
 const results=await Promise.allSettled([dispatchPoints(db,f.owner.id,randomUUID(),payload,f.gym.id),dispatchPoints(db,f.owner.id,randomUUID(),payload,f.gym.id)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await db.pointAccount.update({where:{id:f.w.id},data:{expiresAt:new Date(Date.now()-1000)}});await code(f.quote(),'WALLET_EXPIRY_REVIEW_REQUIRED');
});
test('same payment reference cannot be approved in old topups and direct topups in either order',async()=>{
 const f=await fixture(),policy=await db.pricingPolicy.findFirstOrThrow({orderBy:{version:'desc'}}),method=await db.paymentMethod.findUniqueOrThrow({where:{type:'INSTAPAY'}});
 async function pending(){const evidence=await db.receiptEvidence.create({data:{ownerUserId:f.trainee.id,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),contentHash:randomUUID(),mimeType:'image/jpeg',bytes:10}});return submitTopup(db,f.trainee.id,randomUUID(),{kind:'TRAINEE',points:10,pricingVersion:policy.version,receiptId:evidence.id,paymentMethod:'INSTAPAY',paymentMethodVersion:method.version});}
 const q=await db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.trainee.id,points:10})),ref='SYNTH-'+randomUUID(),p=await pending();
 const body={...f.body(q),gymId:undefined,paymentMethod:'INSTAPAY',paymentReference:ref};await dispatchPoints(db,f.admin.id,randomUUID(),body);
 const approve=(paymentReference:string)=>({decision:'APPROVED',reason:'Synthetic confirmed collected transfer',paymentReference,receivedAmountPiasters:q.chargePiasters,fundsReceived:true,receiptReviewed:true});
 await code(reviewTopup(db,f.admin.id,p.id,approve(ref)),'PAYMENT_REFERENCE_USED');
 const ref2='SYNTH-'+randomUUID(),p2=await pending();await reviewTopup(db,f.admin.id,p2.id,approve(ref2));await code(dispatchPoints(db,f.admin.id,randomUUID(),{...body,paymentReference:ref2}),'PAYMENT_REFERENCE_USED');
});


