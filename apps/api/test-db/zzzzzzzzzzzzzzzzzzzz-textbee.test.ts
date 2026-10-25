import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient} from '@prisma/client';
import {requestPhoneChallenge,registerPhonePreview,verifyPhoneResetCode,resetPhonePreviewPassword} from '../src/auth/phone-preview.js';
import {smsCodeHash} from '../src/auth/textbee.js';
import {authenticate} from '../src/auth/sessions.js';
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
  const body=JSON.parse(String(options?.body));sends.push({phone:body.recipients[0],code:body.message.match(/code: (\d{6})/)[1]});
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
  const user=await registerPhonePreview(db,body);assert.equal(user.testMode,false);assert.equal(user.user.phoneVerified,true);
  assert.equal(await db.phoneTestIdentity.findUnique({where:{userId:user.user.id}}),null);
  await assert.rejects(registerPhonePreview(db,body),/PHONE_OTP_INVALID/);
  await age();const reset=await requestPhoneChallenge(db,{phone,purpose:'RESET'}),resetCode=sends.at(-1)!.code;
  assert.equal((await verifyPhoneResetCode(db,{phone,challengeId:reset.challengeId,code:resetCode})).ok,true);
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
