import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient,type UserRole} from '@prisma/client';
import {requestPhoneChallenge,registerPhonePreview,verifyPhoneResetCode,resetPhonePreviewPassword} from '../src/auth/phone-preview.js';
import {smsCodeHash} from '../src/auth/textbee.js';
import {authenticate,createSession} from '../src/auth/sessions.js';
import {hashPassword,verifyPassword} from '../src/auth/passwords.js';
import {loginStaff} from '../src/auth/staff.js';
import {loginTrainee} from '../src/auth/trainees.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('real SMS proofs verify ownership, reject replay and failed sends, and cannot be downgraded to fixed-code recovery',async()=>{
 const previous={...process.env},originalFetch=globalThis.fetch;
 Object.assign(process.env,{NODE_ENV:'test',GYMBANK_OTP_MODE:'textbee',TEXTBEE_API_KEY:'synthetic-textbee-key',TEXTBEE_DEVICE_ID:'abcdef0123456789abcdef01',GYMBANK_OTP_SECRET:'synthetic-test-secret-longer-than-32-characters'});
 const phone='+201055559801',password='Synthetic SMS registration password',replacement='Synthetic SMS replacement password';
 const sends:{phone:string;code:string}[]=[];
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(String(options?.body));
  const words=['صفر','واحد','اتنين','تلاتة','أربعة','خمسة','ستة','سبعة','تمانية','تسعة'];
  const code=body.message.match(/^رمز جيم بانك: (.+)\. لا تشاركه\.$/)[1].split(' ').map((w:string)=>String(words.indexOf(w))).join('');
  assert.match(code,/^\d{6}$/);sends.push({phone:body.recipients[0],code});
  return Response.json({data:{success:true,smsBatchId:'synthetic-batch'}});
 };
 const age=()=>db.phoneOtpChallenge.updateMany({where:{phone},data:{createdAt:new Date(Date.now()-61000)}});
 try{
  const c=await requestPhoneChallenge(db,{phone,purpose:'REGISTER'});assert.equal(c.testMode,false);assert.equal('code' in c,false);assert.equal(sends.length,1);
  const code=sends.at(-1)!.code,stored=await db.phoneOtpChallenge.findUniqueOrThrow({where:{id:c.challengeId}});
  assert.equal(stored.mode,'textbee');assert.equal(stored.codeHash,smsCodeHash(c.challengeId,phone,'REGISTER',code));
  await assert.rejects(requestPhoneChallenge(db,{phone,purpose:'RESET'}),/PHONE_OTP_WAIT/);assert.equal(sends.length,1);
  const wrong=String((Number(code)+1)%1000000).padStart(6,'0');
  const body={phone,challengeId:c.challengeId,code,displayName:'Synthetic SMS trainee',password};
  await assert.rejects(registerPhonePreview(db,{...body,code:wrong}),/PHONE_OTP_INVALID/);
  const arabic=(code:string)=>code.replace(/\d/g,d=>String.fromCharCode(0x660+Number(d)));
  const user=await registerPhonePreview(db,{...body,code:arabic(code)});assert.equal(user.testMode,false);assert.equal(user.user.phoneVerified,true);
  assert.equal(await db.phoneTestIdentity.findUnique({where:{userId:user.user.id}}),null);
  await assert.rejects(registerPhonePreview(db,body),/PHONE_OTP_INVALID/);
  const challengeCount=await db.phoneOtpChallenge.count({where:{phone}}),sentCount=sends.length;
  await assert.rejects(requestPhoneChallenge(db,{phone:'01055559801',purpose:'REGISTER'}),/ACCOUNT_UNAVAILABLE/);
  assert.equal(sends.length,sentCount);assert.equal(await db.phoneOtpChallenge.count({where:{phone}}),challengeCount);
  await age();const reset=await requestPhoneChallenge(db,{phone,purpose:'RESET'}),resetCode=sends.at(-1)!.code;
  assert.equal((await verifyPhoneResetCode(db,{phone,challengeId:reset.challengeId,code:resetCode.replace(/\d/g,d=>String.fromCharCode(0x6f0+Number(d)))})).ok,true);
  await resetPhonePreviewPassword(db,{phone,challengeId:reset.challengeId,code:resetCode,newPassword:replacement});
  assert.equal(await authenticate(db,'Bearer '+user.accessToken),null);
  assert.equal((await loginTrainee(db,{identifier:phone,password:replacement})).user.id,user.user.id);
  await assert.rejects(resetPhonePreviewPassword(db,{phone,challengeId:reset.challengeId,code:resetCode,newPassword:password}),/PHONE_OTP_INVALID/);
  // Simulate an older test-created marker. Real verification must still prevent a downgrade.
  await db.phoneTestIdentity.create({data:{userId:user.user.id,phone}});
  process.env.GYMBANK_OTP_MODE='test';await age();const fixed=await requestPhoneChallenge(db,{phone,purpose:'RESET'});
  await assert.rejects(resetPhonePreviewPassword(db,{phone,challengeId:fixed.challengeId,code:'123456',newPassword:password}),/PHONE_OTP_INVALID/);
  process.env.GYMBANK_OTP_MODE='textbee';
  globalThis.fetch=async()=>Response.json({error:'synthetic provider error'},{status:503});
  const failurePhone='+201055559802';await assert.rejects(requestPhoneChallenge(db,{phone:failurePhone,purpose:'REGISTER'}),/PHONE_OTP_SEND_FAILED/);
  assert.ok((await db.phoneOtpChallenge.findFirstOrThrow({where:{phone:failurePhone}})).consumedAt);
  // Switching modes never revives a test proof as SMS verification.
  await assert.rejects(resetPhonePreviewPassword(db,{phone,challengeId:fixed.challengeId,code:'123456',newPassword:password}),/PHONE_OTP_INVALID/);
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of ['NODE_ENV','GYMBANK_OTP_MODE','TEXTBEE_API_KEY','TEXTBEE_DEVICE_ID','GYMBANK_OTP_SECRET']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});

test('SMS recovery supports staff without granting assignments, while admins, inactive and passwordless users and test-code staff remain blocked',async()=>{
 const previous={...process.env},originalFetch=globalThis.fetch;
 Object.assign(process.env,{NODE_ENV:'test',GYMBANK_OTP_MODE:'textbee',TEXTBEE_API_KEY:'synthetic-textbee-key',TEXTBEE_DEVICE_ID:'abcdef0123456789abcdef02',GYMBANK_OTP_SECRET:'synthetic-test-secret-longer-than-32-characters'});
 const password='Synthetic staff original password',replacement='Synthetic staff replacement password';
 const codes=new Map<string,string>();
 globalThis.fetch=async(_url,options)=>{
  const body=JSON.parse(String(options?.body)),words=['صفر','واحد','اتنين','تلاتة','أربعة','خمسة','ستة','سبعة','تمانية','تسعة'];
  const code=body.message.match(/^رمز جيم بانك: (.+)\. لا تشاركه\.$/)[1].split(' ').map((word:string)=>String(words.indexOf(word))).join('');
  assert.match(code,/^\d{6}$/);codes.set(body.recipients[0],code);
  return Response.json({data:{success:true,smsBatchId:'synthetic-staff-batch'}});
 };
 try{
  const passwordHash=await hashPassword(password);
  for(const [index,role] of (['CASHIER','BRANCH_MANAGER'] as const).entries()){
   const phone=`+20105555981${index}`;
   const user=await db.user.create({data:{phoneE164:phone,displayName:'Synthetic staff recovery',role,password:{create:{passwordHash}}}});
   const token=await createSession(db,user.id,new Date(Date.now()+3600000));
   const challenge=await requestPhoneChallenge(db,{phone,purpose:'RESET'}),proof={phone,challengeId:challenge.challengeId,code:codes.get(phone)!};
   assert.equal((await verifyPhoneResetCode(db,proof)).ok,true);
   await resetPhonePreviewPassword(db,{...proof,newPassword:replacement});
   const current=await db.user.findUniqueOrThrow({where:{id:user.id},include:{password:true,assignments:true}});
   assert.equal(current.role,role);assert.equal(current.isActive,true);assert.ok(current.phoneVerifiedAt);assert.deepEqual(current.assignments,[]);
   assert.equal(await verifyPassword(replacement,current.password!.passwordHash),true);
   assert.equal(await verifyPassword(password,current.password!.passwordHash),false);
   assert.equal(await authenticate(db,'Bearer '+token),null);
   // Recovering a password never creates branch access for a removed staff member.
   await assert.rejects(loginStaff(db,{identifier:phone,password:replacement}),/INVALID_CREDENTIALS/);
   await assert.rejects(resetPhonePreviewPassword(db,{...proof,newPassword:password}),/PHONE_OTP_INVALID/);
  }
  const blocked:{role:UserRole;active:boolean;password:boolean}[]=[
   {role:'PLATFORM_ADMIN',active:true,password:true},
   {role:'CASHIER',active:false,password:true},
   {role:'CASHIER',active:true,password:false},
  ];
  for(const [index,fixture] of blocked.entries()){
   const phone=`+20105555982${index}`;
   const user=await db.user.create({data:{phoneE164:phone,displayName:'Synthetic blocked recovery',role:fixture.role,isActive:fixture.active,...(fixture.password?{password:{create:{passwordHash}}}:{})}});
   const challenge=await requestPhoneChallenge(db,{phone,purpose:'RESET'}),proof={phone,challengeId:challenge.challengeId,code:'000000'};
   assert.equal(codes.has(phone),false);
   await assert.rejects(verifyPhoneResetCode(db,proof),/PHONE_OTP_INVALID/);
   await assert.rejects(resetPhonePreviewPassword(db,{...proof,newPassword:replacement}),/PHONE_OTP_INVALID/);
   const current=await db.user.findUniqueOrThrow({where:{id:user.id},include:{password:true}});
   assert.equal(current.isActive,fixture.active);assert.equal(current.password?.passwordHash,fixture.password?passwordHash:undefined);assert.equal(current.phoneVerifiedAt,null);
  }
  process.env.GYMBANK_OTP_MODE='test';
  for(const [index,role] of (['CASHIER','BRANCH_MANAGER'] as const).entries()){
   const phone=`+20105555983${index}`;
   const user=await db.user.create({data:{phoneE164:phone,displayName:'Synthetic test-code staff',role,password:{create:{passwordHash}}}});
   await db.phoneTestIdentity.create({data:{userId:user.id,phone}});
   const challenge=await requestPhoneChallenge(db,{phone,purpose:'RESET'}),proof={phone,challengeId:challenge.challengeId,code:'123456'};
   await assert.rejects(verifyPhoneResetCode(db,proof),/PHONE_OTP_INVALID/);
   await assert.rejects(resetPhonePreviewPassword(db,{...proof,newPassword:replacement}),/PHONE_OTP_INVALID/);
   assert.equal((await db.userPassword.findUniqueOrThrow({where:{userId:user.id}})).passwordHash,passwordHash);
  }
 }finally{
  globalThis.fetch=originalFetch;
  for(const key of ['NODE_ENV','GYMBANK_OTP_MODE','TEXTBEE_API_KEY','TEXTBEE_DEVICE_ID','GYMBANK_OTP_SECRET']){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
 }
});
