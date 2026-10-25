import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID as freshId} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {buildApp} from '../src/app.js';
import {createSession} from '../src/auth/sessions.js';
import {platformFixture} from './platform-fixture.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!['/gym_ci','/gym_test'].includes(url.pathname))throw Error('Disposable local database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('removed gym commerce routes return 404 for owners and cashiers without posting anything',async()=>{
 const f=await platformFixture(db,false),app=buildApp(db),before=await db.pointTransaction.count();
 try{for(const actor of [f.owner,f.cashier]){const token=await createSession(db,actor.id,new Date(Date.now()+60000));
  for(const [method,path] of [['GET',`/gyms/${f.gym.id}/inventory`],['POST',`/gyms/${f.gym.id}/stock-transfers`],['POST',`/cashier/branches/${f.gym.id}/sales`],['POST',`/cashier/branches/${f.gym.id}/sale-quotes`],['GET',`/operations/branches/${f.gym.id}/sales`]] as const)
   assert.equal((await app.inject({method,url:path,headers:{authorization:'Bearer '+token}})).statusCode,404);
 }}finally{await app.close();}
 assert.equal(await db.pointTransaction.count(),before);
});
test('database schema has no inventory account types or sale table and runtime cannot create archived balances',async()=>{
 const values=await db.$queryRaw<{enumlabel:string}[]>`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='PointAccountType'`;
 assert.equal(values.some(v=>/INVENTORY/.test(v.enumlabel)),false);
 const [table]=await db.$queryRaw<{name:string|null}[]>`SELECT to_regclass('public."PointSale"')::text AS name`;assert.equal(table!.name,null);
 await assert.rejects(db.pointAccount.create({data:{type:'ARCHIVED'}}));
 await assert.rejects(db.financialArchiveRecord.create({data:{id:freshId(),recordId:freshId(),recordType:'FORGED',ownerUserIds:[],data:{}}}));
 await assert.rejects(db.$executeRaw`INSERT INTO "PointAccount" (id,type,balance,"createdAt") VALUES(gen_random_uuid(),'GYM_INVENTORY',0,now())`);
});
