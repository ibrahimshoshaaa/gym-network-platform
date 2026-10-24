import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {buildApp} from '../src/app.js';
import {createSession} from '../src/auth/sessions.js';
import {transferStock} from '../src/ledger/service.js';
import {platformFixture} from './platform-fixture.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!['/gym_ci','/gym_test'].includes(url.pathname))throw Error('Disposable local database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('inventory and transfer endpoints are retired even for the accepted owner',async()=>{
 const f=await platformFixture(db,false),app=buildApp(db),token=await createSession(db,f.owner.id,new Date(Date.now()+60000));
 try{for(const [method,url] of [['GET',`/gyms/${f.gym.id}/inventory`],['POST',`/gyms/${f.gym.id}/stock-transfers`],['GET',`/inventory/branches/${randomUUID()}`]] as const)assert.equal((await app.inject({method,url,headers:{authorization:'Bearer '+token}})).statusCode,404);}finally{await app.close();}
 assert.equal(await db.pointAccount.count({where:{gymId:f.gym.id,type:'GYM_INVENTORY'}}),0);
});
test('no role can initiate a stock transfer and no ledger balance changes',async()=>{
 const f=await platformFixture(db,false),before=await db.pointTransaction.count();for(const actor of [f.admin,f.owner,f.cashier])assert.throws(()=>transferStock(db,{actorId:actor.id,gymId:f.gym.id,fromBranchId:null,toBranchId:randomUUID(),points:10,idempotencyKey:randomUUID()}),/ACCESS_DENIED/);assert.equal(await db.pointTransaction.count(),before);assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,0);
});

test('database independently prevents new issuance into retired stock accounts',async()=>{
 const f=await platformFixture(db,false),stock=await db.pointAccount.create({data:{type:'GYM_INVENTORY',gymId:f.gym.id}}),issuance=await db.pointAccount.findFirstOrThrow({where:{type:'ISSUANCE'}});
 await assert.rejects(db.$transaction(async tx=>{
  const header=await tx.pointTransaction.create({data:{actorId:f.admin.id,idempotencyKey:randomUUID(),requestHash:'0'.repeat(64),reason:'Synthetic forbidden new stock',kind:'ISSUE'}});
  await tx.pointPosting.create({data:{transactionId:header.id,accountId:issuance.id,delta:-10}});
  await tx.pointPosting.create({data:{transactionId:header.id,accountId:stock.id,delta:10}});
  await tx.pointTransaction.update({where:{id:header.id},data:{posted:true}});
 }));
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:stock.id}})).balance,0);
});
