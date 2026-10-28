import assert from 'node:assert/strict';
import test from 'node:test';
import type {PrismaClient} from '@prisma/client';
import {buildApp} from '../src/app.js';
import {hashPassword} from '../src/auth/passwords.js';

function fixture(user:any){
 const counters=new Map<string,{attempts:number;expiresAt:Date}>();
 const db:any={
  $queryRaw:async(parts:TemplateStringsArray,...values:any[])=>{
   if(!parts.join('?').includes('INSERT INTO "AuthThrottle"'))return [];
   const key=values[0],old=counters.get(key),row={attempts:(old?.attempts??0)+1,expiresAt:old?.expiresAt??new Date(Date.now()+900000)};
   counters.set(key,row);return [row];
  },
  $transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn(db),
  authThrottle:{findUnique:async({where}:any)=>counters.get(where.key)??null,deleteMany:async({where}:any)=>{counters.delete(where.key);return {count:1};}},
  user:{findUnique:async()=>user},authSession:{create:async()=>({})},auditLog:{create:async()=>({})},
 };
 return db as PrismaClient;
}

test('legacy registration endpoints reject unverified registration',async()=>{
 const app=buildApp(fixture(null));app.log.level='silent';
 try{
  for(const url of ['/auth/register','/auth/owners/register']){
   const r=await app.inject({method:'POST',url,remoteAddress:'198.51.100.20',payload:{}});
   assert.equal(r.statusCode,409);assert.equal(r.json().code,'PHONE_VERIFICATION_REQUIRED');
  }
 }finally{await app.close();}
});

test('wrong passwords on another IP cannot lock admin and successful logins do not consume failure limit',async()=>{
 const password='Synthetic-password-123';
 const user={id:'c64eff5a-1634-41cc-9ab7-ce6385502952',isActive:true,role:'PLATFORM_ADMIN',displayName:'Synthetic admin',email:'admin@example.test',phoneE164:'+201000000001',emailVerifiedAt:null,phoneVerifiedAt:null,password:{passwordHash:await hashPassword(password)}};
 const app=buildApp(fixture(user));app.log.level='silent';
 const attempt=(ip:string,secret:string)=>app.inject({method:'POST',url:'/auth/admin/login',remoteAddress:ip,payload:{identifier:user.email,password:secret}});
 try{
  for(let n=0;n<5;n++)assert.equal((await attempt('198.51.100.1','wrong-password')).statusCode,401);
  assert.equal((await attempt('198.51.100.1',password)).statusCode,429);
  for(let n=0;n<6;n++)assert.equal((await attempt('198.51.100.2',password)).statusCode,200);
 }finally{await app.close();}
});
