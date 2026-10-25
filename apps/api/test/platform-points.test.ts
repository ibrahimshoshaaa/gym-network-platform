import test from 'node:test';
import assert from 'node:assert/strict';
import type {Prisma,PrismaClient} from '@prisma/client';
import {dispatchPoints,lookup,pointQuote} from '../src/points/service.js';
import {quoteSchema} from '../src/topups/service.js';
import {welcomeSchema,grantWelcomePoints,saveWelcomeSettings} from '../src/points/welcome.js';
import {policySchema,packageSchema} from '../src/topups/settings.js';
const id='10000000-0000-4000-8000-000000000001',gym='10000000-0000-4000-8000-000000000002';
const never=new Proxy({},{get(){throw Error('Retired operation touched database');}}) as PrismaClient;
test('no new gym purchase, stock package or gym purchase discount is accepted',()=>{
 assert.equal(quoteSchema.safeParse({kind:'BRANCH_STOCK',receivingGymId:gym,points:10}).success,false);
 assert.equal(quoteSchema.safeParse({kind:'TRAINEE',points:10}).success,true);
 assert.equal(packageSchema.safeParse({expectedVersion:0,label:'Old stock',kind:'BRANCH_STOCK',points:10,enabled:true}).success,false);
 assert.equal(policySchema.safeParse({expectedVersion:0,pointPricePiasters:'100',gymDiscountBps:1000,redemptionBps:8000}).success,false);
});
function fixture(enabled=true){
 const admin='10000000-0000-4000-8000-000000000003',wallet='10000000-0000-4000-8000-000000000004',issuance='10000000-0000-4000-8000-000000000005';
 let grant:any=null,header:any=null,config={id:'default',version:1,enabled,points:25,createdById:admin};const postings:any[]=[],audits:any[]=[],balances=new Map([[wallet,{balance:0,type:'TRAINEE_WALLET'}],[issuance,{balance:0,type:'ISSUANCE'}]]);let expiry:Date|undefined;
 const tx:any={
  user:{findUnique:async({where}:any)=>({id:where.id,isActive:true,role:where.id===admin?'PLATFORM_ADMIN':'TRAINEE'})},
  welcomePointsPolicy:{findUnique:async()=>config,upsert:async({update}:any)=>{config={...config,...update};}},
  pricingPolicy:{findFirst:async()=>({id})},
  welcomePointsGrant:{findUnique:async()=>grant,create:async({data}:any)=>{assert.equal(grant,null);grant=data;return data;}},
  pointAccount:{findUniqueOrThrow:async()=>({id:wallet}),findFirstOrThrow:async()=>({id:issuance}),update:async({data}:any)=>{expiry=data.expiresAt;}},
  pointTransaction:{findUnique:async()=>header,create:async({data}:any)=>(header={id:gym,...data}),update:async()=>{header.posted=true;for(const p of postings)balances.get(p.accountId)!.balance+=p.delta;}},
  moneyTransaction:{findUnique:async()=>null},pointPosting:{create:async({data}:any)=>{postings.push(data);}},
  auditLog:{create:async({data}:any)=>{audits.push(data);}},
  $executeRaw:async()=>0,$queryRaw:async(strings:TemplateStringsArray,...args:any[])=>strings.join('').includes('PointAccount')?[balances.get(args[0])]:[],
 };
 const db={$transaction:async(run:any)=>run(tx)} as PrismaClient;
 return {tx:tx as Prisma.TransactionClient,db,admin,get grant(){return grant;},get config(){return config;},postings,audits,balances,wallet,issuance,get expiry(){return expiry;}};
}
test('welcome award is balanced issuance, renews expiry, and is only applied once per user',async()=>{
 const f=fixture();await grantWelcomePoints(f.tx,id);await grantWelcomePoints(f.tx,id);
 assert.equal(f.grant.points,25);assert.equal(f.postings.length,2);assert.equal(f.balances.get(f.wallet)?.balance,25);assert.equal(f.balances.get(f.issuance)?.balance,-25);assert.ok(f.expiry!>new Date());assert.equal(f.audits.length,1);
});
test('disabled welcome campaign issues no points or financial records',async()=>{
 const f=fixture(false);await grantWelcomePoints(f.tx,id);assert.equal(f.grant,null);assert.equal(f.postings.length,0);assert.equal(f.expiry,undefined);
});
test('welcome configuration is admin-only, version checked, and can be disabled without removing awarded points',async()=>{
 const f=fixture();await assert.rejects(saveWelcomeSettings(f.db,id,{expectedVersion:1,enabled:true,points:10}),{code:'ACCESS_DENIED'});
 await assert.rejects(saveWelcomeSettings(f.db,f.admin,{expectedVersion:0,enabled:false,points:0}),{code:'STALE_SETTINGS'});
 await grantWelcomePoints(f.tx,id);await saveWelcomeSettings(f.db,f.admin,{expectedVersion:1,enabled:false,points:25});assert.equal(f.config.enabled,false);assert.equal(f.config.version,2);assert.equal(f.balances.get(f.wallet)?.balance,25);
 for(const d of [{enabled:true,points:0},{enabled:true,points:-1},{enabled:true,points:1.5},{enabled:true,points:100001},{enabled:true,points:10,actorId:id}])assert.equal(welcomeSchema.safeParse({expectedVersion:0,...d}).success,false);
});

test('retired stock and owner dispatch routes are absent while admin charging remains registered',async()=>{
 const {buildApp}=await import('../src/app.js');const app=buildApp({} as PrismaClient);
 try{
  assert.equal(app.hasRoute({method:'POST',url:'/admin/point-transfers'}),true);
  for(const [method,url] of [['POST','/gyms/:gymId/point-transfers'],['POST','/gyms/:gymId/stock-transfers'],['GET','/gyms/:gymId/inventory'],['GET','/gyms/:gymId/point-wallet']] as const)assert.equal(app.hasRoute({method,url}),false);
 }finally{await app.close();}
});
