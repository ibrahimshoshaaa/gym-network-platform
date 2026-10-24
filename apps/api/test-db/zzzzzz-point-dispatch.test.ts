import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {pointQuote,dispatchPoints,lookup} from '../src/points/service.js';
import {platformFixture} from './platform-fixture.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!['/gym_ci','/gym_test'].includes(url.pathname))throw Error('Disposable local database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('only the platform admin tops up a trainee; concurrent replay posts once without gym stock',async()=>{
 const f=await platformFixture(db);const found=await db.$transaction(tx=>lookup(tx,f.admin.id,{phone:f.trainee.phoneE164}));assert.equal(found.id,f.trainee.id);
 const q=await db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.trainee.id,points:10}));
 const body={recipientId:f.trainee.id,recipientLabel:q.recipientLabel,points:10,pricingVersion:q.pricingVersion,receivedAmountPiasters:q.chargePiasters,fundsReceived:true,recipientConfirmed:true,paymentMethod:'CASH'},key=randomUUID();
 const rows=await Promise.all(Array.from({length:4},()=>dispatchPoints(db,f.admin.id,key,body)));assert.equal(new Set(rows.map(r=>r.id)).size,1);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,10);assert.equal(rows[0]!.gymId,null);assert.equal(await db.pointDispatch.count({where:{id:rows[0]!.id}}),1);
 for(const actor of [f.owner,f.cashier,f.trainee])await assert.rejects(dispatchPoints(db,actor.id,randomUUID(),body),/ACCESS_DENIED/);
 await assert.rejects(dispatchPoints(db,f.admin.id,key,{...body,points:11}),/IDEMPOTENCY_CONFLICT/);
});
test('admin cannot sell to gym owner and owner cannot use an old gym dispatch endpoint',async()=>{
 const f=await platformFixture(db);await assert.rejects(db.$transaction(tx=>lookup(tx,f.admin.id,{phone:f.owner.phoneE164})),/TRAINEE_UNAVAILABLE/);
 await assert.rejects(db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.owner.id,gymId:f.gym.id,points:10})),/ACCESS_DENIED/);
 await assert.rejects(dispatchPoints(db,f.owner.id,randomUUID(),{},f.gym.id),/ACCESS_DENIED/);
});
