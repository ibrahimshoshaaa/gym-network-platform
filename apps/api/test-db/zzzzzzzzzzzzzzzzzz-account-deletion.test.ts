import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {PrismaClient,type UserRole} from '@prisma/client';
import {hashPassword} from '../src/auth/passwords.js';
import {authenticate,createSession,hashToken} from '../src/auth/sessions.js';
import {requestDeletion,cancelDeletion,processDeletion,publicDeletion,deletionReceipt} from '../src/accounts/deletion.js';
import {eraseMediaBatch} from '../src/accounts/deletion-media.js';
import {createTicket} from '../src/engagement/support.js';
import {saveListing} from '../src/market/service.js';
import {changeUserAccess,issueRecovery} from '../src/engagement/accounts.js';
import {postLedger} from '../src/ledger/service.js';
import {buildApp} from '../src/app.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');
const db=new PrismaClient();after(()=>db.$disconnect());
const password='Synthetic deletion password only!';
const body=()=>({currentPassword:password,confirmation:'DELETE',requestKey:randomUUID()});
async function user(role:UserRole='TRAINEE'){
 return db.user.create({data:{displayName:'Synthetic deletion identity',phoneE164:'+2010'+String(Math.floor(Math.random()*1e8)).padStart(8,'0'),email:randomUUID()+'@example.test',role,password:{create:{passwordHash:await hashPassword(password)}}}});
}
test('clear account really loses credentials, phone identity and UGC; receipt survives lost responses without exposing identity',async()=>{
 const u=await user(),other=await user(),token=await createSession(db,u.id,new Date(Date.now()+60000));
 await db.phoneTestIdentity.create({data:{userId:u.id,phone:u.phoneE164}});
 await db.phoneOtpChallenge.create({data:{phone:u.phoneE164,purpose:'RESET',mode:'test',codeHash:hashToken('synthetic'),expiresAt:new Date(Date.now()+60000)}});
 const ticket=await createTicket(db,u.id,{subject:'Synthetic general question',category:'HELP',body:'Synthetic personal content',clientKey:randomUUID()});
 const image=await db.marketImage.create({data:{ownerId:u.id,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),publicUrl:'https://res.cloudinary.com/test/image/upload/test.jpg'}});
 const listing=await saveListing(db,u.id,undefined,{title:'جهاز تمرين للاختبار',description:'بيانات شخصية تجريبية للحذف',category:'EQUIPMENT',condition:'USED',pricePiasters:'100',governorate:'المنوفية',city:'شبين الكوم',contactPhone:u.phoneE164,imageIds:[image.id],clientKey:randomUUID()});
 const d=body();const result=await requestDeletion(db,u.id,d);assert.equal(result.request?.status,'ERASING');
 assert.equal(await authenticate(db,'Bearer '+token),null);
 const erased=await db.user.findUniqueOrThrow({where:{id:u.id}});assert.equal(erased.email,null);assert.equal(erased.phoneE164,'deleted:'+u.id);assert.equal(erased.displayName,'حساب محذوف');assert.equal(erased.isActive,false);
 assert.equal(await db.userPassword.count({where:{userId:u.id}}),0);assert.equal(await db.phoneTestIdentity.count({where:{userId:u.id}}),0);assert.equal(await db.phoneOtpChallenge.count({where:{phone:u.phoneE164}}),0);
 assert.equal(await db.supportTicket.count({where:{id:ticket.id}}),0);assert.equal(await db.marketListing.count({where:{id:listing.id}}),0);
 const receipt=await deletionReceipt(db,d.requestKey);assert.equal(receipt.request?.id,result.request?.id);assert.ok(!JSON.stringify(receipt).includes(u.phoneE164));assert.ok(!JSON.stringify(receipt).includes(u.id));
 await assert.rejects(deletionReceipt(db,randomUUID()),/NOT_FOUND/);
 assert.equal((await db.user.findUniqueOrThrow({where:{id:other.id}})).isActive,true);
 await assert.rejects(db.user.update({where:{id:u.id},data:{isActive:true}}));
 await assert.rejects(db.userPassword.create({data:{userId:u.id,passwordHash:await hashPassword(password)}}));
 await assert.rejects(db.marketImage.create({data:{ownerId:u.id,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),publicUrl:'https://res.cloudinary.com/test/image/upload/test.jpg'}}));
 const attempted:string[]=[];
 await assert.rejects(eraseMediaBatch(db,result.request!.id,{remove:async k=>{attempted.push(k);throw Error('synthetic outage');}}));
 assert.equal((await deletionReceipt(db,d.requestKey)).request?.status,'ERASING');
 await eraseMediaBatch(db,result.request!.id,{remove:async k=>{attempted.push(k);}});
 assert.equal((await deletionReceipt(db,d.requestKey)).request?.status,'COMPLETED');assert.deepEqual(attempted,[image.objectKey,image.objectKey]);
 await eraseMediaBatch(db,result.request!.id,{remove:async()=>assert.fail('completed must not rerun')});
 const admin=await user('PLATFORM_ADMIN');
 await assert.rejects(changeUserAccess(db,admin.id,u.id,{active:true,password,reason:'Synthetic forbidden resurrection'}));
 await assert.rejects(issueRecovery(db,admin.id,u.id,{password,identityVerified:true,reason:'Synthetic forbidden recovery'}));
});
test('balances are never burned; pending requests cancel and retry, financial ledger survives erasure',async()=>{
 const u=await user(),admin=await user('PLATFORM_ADMIN');
 const wallet=await db.pointAccount.create({data:{ownerUserId:u.id,type:'TRAINEE_WALLET'}});
 const issuance=await db.pointAccount.findFirstOrThrow({where:{type:'ISSUANCE'}});
 const command={actorId:admin.id,idempotencyKey:randomUUID(),reason:'Synthetic deletion funding',points:{kind:'ISSUE' as const,entries:[{accountId:issuance.id,delta:-5n},{accountId:wallet.id,delta:5n}]}};
 const funded=await postLedger(db,command);
 const d=body();const pending=await requestDeletion(db,u.id,d);assert.equal(pending.request?.status,'PENDING');assert.ok(pending.blockers.some(b=>b.code==='POINT_BALANCE'));
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:wallet.id}})).balance,5);
 const blocked=await processDeletion(db,admin.id,pending.request!.id,{password,confirmation:'DELETE'});assert.equal(blocked.request?.status,'PENDING');assert.ok((await db.user.findUniqueOrThrow({where:{id:u.id}})).isActive);
 await cancelDeletion(db,u.id,{currentPassword:password});assert.equal((await deletionReceipt(db,d.requestKey)).request?.status,'CANCELLED');
 await assert.rejects(requestDeletion(db,u.id,{...body(),currentPassword:'wrong'}),/INVALID_CREDENTIALS/);
 await postLedger(db,{...command,idempotencyKey:randomUUID(),reason:'Synthetic settled balance',points:{kind:'ISSUE',entries:[{accountId:issuance.id,delta:5n},{accountId:wallet.id,delta:-5n}]}});
 const completed=await requestDeletion(db,u.id,body());assert.equal(completed.request?.status,'COMPLETED');
 assert.ok(await db.pointTransaction.findUnique({where:{id:funded.pointTransactionId!}}));
 await assert.rejects(db.pointTransaction.delete({where:{id:funded.pointTransactionId!}}));
});
test('owners require closure review; inactive users can request externally; platform admin cannot self erase',async()=>{
 const owner=await user('GYM_OWNER'),admin=await user('PLATFORM_ADMIN');
 const gym=await db.gym.create({data:{ownerId:owner.id,name:'Synthetic private gym',status:'ACTIVE',ownerAcceptedAt:new Date()}});
 const d=body();const result=await requestDeletion(db,owner.id,d);assert.ok(result.blockers.some(b=>b.code==='GYM_CLOSURE'));
 await db.gym.update({where:{id:gym.id},data:{status:'SUSPENDED'}});
 const done=await processDeletion(db,admin.id,result.request!.id,{password,confirmation:'DELETE'});assert.equal(done.request?.status,'COMPLETED');assert.equal((await db.gym.findUniqueOrThrow({where:{id:gym.id}})).name,'جيم محذوف');
 const disabled=await user();await db.user.update({where:{id:disabled.id},data:{isActive:false}});
 const requested=await publicDeletion(db,{identifier:disabled.phoneE164,password,confirmation:'DELETE',requestKey:randomUUID()});assert.equal(requested.request?.status,'PENDING');assert.ok(requested.blockers.some(b=>b.code==='ACCOUNT_REVIEW'));
 assert.equal((await processDeletion(db,admin.id,requested.request!.id,{password,confirmation:'DELETE'})).request?.status,'COMPLETED');
 await assert.rejects(requestDeletion(db,admin.id,body()),/ACCESS_DENIED/);
});
test('deletion API requires current password, bounded confirmation, private receipts and bearer auth',async()=>{
 const u=await user(),app=buildApp(db);try{
 assert.equal((await app.inject({method:'GET',url:'/me/account-deletion'})).statusCode,401);
 const token=await createSession(db,u.id,new Date(Date.now()+60000)),headers={authorization:'Bearer '+token};
 assert.equal((await app.inject({method:'POST',url:'/me/account-deletion',headers,payload:{...body(),confirmation:'yes'}})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:'/me/account-deletion',headers,payload:{...body(),currentPassword:'wrong'}})).statusCode,401);
 const d=body(),r=await app.inject({method:'POST',url:'/me/account-deletion',headers,payload:d});assert.equal(r.statusCode,200);assert.equal(r.json().request.status,'COMPLETED');
 const receipt=await app.inject({method:'POST',url:'/auth/account-deletion/status',payload:{requestKey:d.requestKey}});assert.equal(receipt.statusCode,200);assert.equal(receipt.headers['cache-control'],'no-store');
 assert.equal((await app.inject({method:'GET',url:'/me',headers})).statusCode,401);
 }finally{await app.close();}
});
