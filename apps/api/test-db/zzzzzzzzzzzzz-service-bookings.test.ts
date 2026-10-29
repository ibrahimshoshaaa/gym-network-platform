import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test,{after} from 'node:test';
import {PrismaClient} from '@prisma/client';
import {createBooking,cancelBooking} from '../src/bookings/service.js';
import {publishBookingPolicy} from '../src/bookings/settings.js';
import {postLedger} from '../src/ledger/service.js';
import {setBookingHours} from '../src/services/service.js';
import {sessionWindow} from '../src/bookings/hours.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('multi-service escrow captures approved terms, rejects stale/foreign services and refunds exactly once',async()=>{
 const user=(role:'PLATFORM_ADMIN'|'TRAINEE'|'GYM_OWNER')=>db.user.create({data:{role,displayName:'Synthetic services booking',phoneE164:'+20svc'+randomUUID()}});
 const admin=await user('PLATFORM_ADMIN'),customer=await user('TRAINEE'),owner=await user('GYM_OWNER');
 const gym=await db.gym.create({data:{name:'Synthetic service booking gym',status:'ACTIVE',ownerId:owner.id,ownerAcceptedAt:new Date()}});
 const branch=await db.branch.create({data:{gymId:gym.id,name:'Synthetic service booking branch',status:'ACTIVE',visitPricePoints:2,sessionMinutes:30,priceApprovedAt:new Date(),pricingVersion:1}});
 // A future daytime appointment is independent of wall clock and previous test policies.
 const day=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
 const scheduledAt=day+'T12:00:00Z';
 await setBookingHours(db,owner.id,branch.id,{openMinute:0,closeMinute:1439,expectedVersion:0});
 const active=await db.bookingPolicy.findFirst({orderBy:{version:'desc'}});
 const policy=await publishBookingPolicy(db,admin.id,{expectedVersion:active?.version??0,policy:{graceMinutes:60,mode:'MANUAL'}});
 // This suite runs after the existing pricing bootstrap suites; it must not
 // create global pricing settings before their expected-version-zero checks.
 await db.pricingPolicy.findFirstOrThrow({orderBy:{version:'desc'}});
 const services=await Promise.all([15,20].map((points,i)=>db.branchService.create({data:{branchId:branch.id,name:'Original service '+i,points,durationMinutes:i?60:30,version:1,active:true,approvedAt:new Date(),approvedById:admin.id}})));
 const issuance=await db.pointAccount.findFirst({where:{type:'ISSUANCE'}})??await db.pointAccount.create({data:{type:'ISSUANCE'}});
 const wallet=await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:customer.id,expiresAt:new Date(Date.now()+10*86400000)}});
 await postLedger(db,{actorId:admin.id,idempotencyKey:randomUUID(),reason:'Synthetic services booking funding',points:{kind:'ISSUE',entries:[{accountId:issuance.id,delta:-200n},{accountId:wallet.id,delta:200n}]}});
 const input={branchId:branch.id,scheduledAt,policyVersion:policy.version,hoursVersion:1,services:services.map(s=>({id:s.id,version:s.version}))};
 const key=randomUUID();
 const attempts=await Promise.all([createBooking(db,customer.id,key,input),createBooking(db,customer.id,key,input)]);
 const booking=attempts[0]!;assert.equal(attempts[1]!.id,booking.id);
 assert.equal(booking.points,35);assert.equal(booking.sessionMinutes,90);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:wallet.id}})).balance,165);
 assert.equal((await db.moneyAccount.findFirst({where:{gymId:gym.id,type:'GYM_AVAILABLE'}}))?.balancePiasters??0n,0n);
 await db.branchService.update({where:{id:services[0]!.id},data:{points:50,name:'Updated name',version:2}});
 assert.equal((await createBooking(db,customer.id,key,{...input,services:[...input.services].reverse()})).points,35);
 const saved=await db.booking.findUniqueOrThrow({where:{id:booking.id}});
 assert.ok(JSON.stringify(saved.serviceSnapshots).includes('Original service 0'));
 await assert.rejects(createBooking(db,customer.id,randomUUID(),input),/STALE_SETTINGS/);
 await assert.rejects(createBooking(db,customer.id,randomUUID(),{...input,services:[{id:randomUUID(),version:1}]}),/BOOKING_SERVICE_UNAVAILABLE/);
 await assert.rejects(createBooking(db,customer.id,randomUUID(),{branchId:branch.id,scheduledAt,policyVersion:policy.version,branchPricingVersion:1}),/SERVICE_SELECTION_REQUIRED/);
 const latest={...input,services:input.services.map(s=>({...s,version:s.id===services[0]!.id?2:1}))};
 // Choose a real instant thirty minutes before Cairo closing, regardless of DST.
 const closing=sessionWindow(new Date(scheduledAt),{openMinute:0,closeMinute:1439}).closesAt;
 const tooLate=new Date(closing.getTime()-30*60000).toISOString();
 await assert.rejects(createBooking(db,customer.id,randomUUID(),{...latest,scheduledAt:tooLate}),/SESSION_ENDS_AFTER_CLOSING/);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:wallet.id}})).balance,165);
 await Promise.all([cancelBooking(db,customer.id,booking.id,{reason:'Cannot attend'}),cancelBooking(db,customer.id,booking.id,{reason:'Cannot attend'})]);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:wallet.id}})).balance,200);
 assert.equal(await db.pointTransaction.count({where:{idempotencyKey:'booking-resolution:'+booking.id}}),1);
 await setBookingHours(db,owner.id,branch.id,{openMinute:60,closeMinute:1439,expectedVersion:1});
 await assert.rejects(createBooking(db,customer.id,randomUUID(),latest),/STALE_SETTINGS/);
 // Explicit service hours work without general branch hours; inherited hours do not.
 await db.branch.update({where:{id:branch.id},data:{bookingOpenMinute:null,bookingCloseMinute:null,bookingHoursVersion:3}});
 await db.branchService.updateMany({where:{branchId:branch.id},data:{openMinute:0,closeMinute:1439}});
 const standalone=await createBooking(db,customer.id,randomUUID(),{...latest,hoursVersion:3});
 assert.equal(standalone.points,70);
 await cancelBooking(db,customer.id,standalone.id,{reason:'Test standalone service hours'});
 await db.branchService.update({where:{id:services[1]!.id},data:{openMinute:null,closeMinute:null}});
 await assert.rejects(createBooking(db,customer.id,randomUUID(),{...latest,hoursVersion:3}),/BOOKING_HOURS_NOT_CONFIGURED/);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:wallet.id}})).balance,200);
});
