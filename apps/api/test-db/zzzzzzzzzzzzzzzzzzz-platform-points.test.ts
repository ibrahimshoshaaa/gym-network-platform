import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {registerTrainee,loginTrainee} from '../src/auth/trainees.js';
import {saveWelcomeSettings,grantWelcomePoints} from '../src/points/welcome.js';
import {platformFixture} from './platform-fixture.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!['/gym_ci','/gym_test'].includes(url.pathname))throw Error('Disposable local database required');
const db=new PrismaClient();after(()=>db.$disconnect());
const registration=()=>({displayName:'Synthetic welcome trainee',phone:'+2010'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,12))%100000000n).padStart(8,'0'),password:'Synthetic welcome password 123!'});
test('welcome points apply once on signup, never login, and disabling affects only future registrations',async()=>{
 const f=await platformFixture(db),previous=await db.welcomePointsPolicy.findUnique({where:{id:'default'}});
 await saveWelcomeSettings(db,f.admin.id,{expectedVersion:previous?.version??0,enabled:true,points:15});
 try{
  const input=registration(),signed=await registerTrainee(db,input),userId=signed.user.id;
  const account=()=>db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:userId}}});
  assert.equal((await account()).balance,15);assert.ok((await account()).expiresAt!>new Date());
  await loginTrainee(db,{identifier:input.phone,password:input.password});
  await Promise.all([1,2,3].map(()=>db.$transaction(tx=>grantWelcomePoints(tx,userId))));
  assert.equal((await account()).balance,15);assert.equal(await db.welcomePointsGrant.count({where:{userId}}),1);
  const grant=await db.welcomePointsGrant.findUniqueOrThrow({where:{userId}}),postings=await db.pointPosting.findMany({where:{transactionId:grant.pointTransactionId}});assert.equal(postings.reduce((n,p)=>n+p.delta,0),0);
  const current=await db.welcomePointsPolicy.findUniqueOrThrow({where:{id:'default'}});await saveWelcomeSettings(db,f.admin.id,{expectedVersion:current.version,enabled:false,points:15});
  const next=await registerTrainee(db,registration());assert.equal((await db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:next.user.id}}})).balance,0);assert.equal((await account()).balance,15);
 }finally{
  const current=await db.welcomePointsPolicy.findUniqueOrThrow({where:{id:'default'}});await saveWelcomeSettings(db,f.admin.id,{expectedVersion:current.version,enabled:false,points:previous?.points??0});
 }
});
