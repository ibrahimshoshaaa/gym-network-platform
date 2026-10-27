import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {buildApp} from '../src/app.js';
import {requestWhatsappChallenge,checkWhatsappChallenge,receiveWhatsappMessages} from '../src/auth/whatsapp-service.js';
import {registerPhonePreview,resetPhonePreviewPassword} from '../src/auth/phone-preview.js';
import {authenticate} from '../src/auth/sessions.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');

test('signed reverse verification binds sender, destination, purpose, expiry and one-time registration/recovery',async()=>{
 const previous={...process.env};const db=new PrismaClient();const app=buildApp(db);
 Object.assign(process.env,{GYMBANK_WHATSAPP_ENABLED:'true',GYMBANK_WHATSAPP_PHONE:'+201214829716',GYMBANK_WHATSAPP_PHONE_NUMBER_ID:'123456789',GYMBANK_WHATSAPP_APP_SECRET:'synthetic-meta-app-secret',GYMBANK_WHATSAPP_VERIFY_TOKEN:'synthetic-webhook-verify-token-32-chars'});
 delete process.env.GYMBANK_OTP_MODE;
 const phone='+201055549901',password='12345678';
 try {
  const c=await requestWhatsappChallenge(db,{phone,purpose:'REGISTER'});
  const proof={phone,challengeId:c.challengeId,whatsappToken:c.whatsappToken};
  const poll={...proof,purpose:'REGISTER'};
  const registration={...proof,displayName:'Synthetic WhatsApp trainee',password};
  const message=new URL(c.whatsappUrl).searchParams.get('text')!;
  assert.match(message,/\nرمز التحقق: [0-9]{8}$/);
  assert.ok(!message.includes(c.whatsappToken));assert.equal(new URL(c.whatsappUrl).pathname,'/201214829716');
  assert.equal((await checkWhatsappChallenge(db,poll)).status,'pending');
  await assert.rejects(registerPhonePreview(db,registration),/PHONE_OTP_INVALID/);
  await assert.rejects(checkWhatsappChallenge(db,{...poll,whatsappToken:'x'.repeat(43)}),/PHONE_OTP_INVALID/);
  function envelope(text=message,from=phone.slice(1),destination='123456789',id='wamid.synthetic-wa-1') {
   return {object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:destination},messages:[{id,from,timestamp:String(Math.floor(Date.now()/1000)+1),type:'text',text:{body:text}}]}}]}]};
  }
  await receiveWhatsappMessages(db,envelope(message,'201055549902'));
  await receiveWhatsappMessages(db,envelope(message,phone.slice(1),'987654321'));
  await receiveWhatsappMessages(db,envelope(message.replace('تأكيد رقم الموبايل','تأكيد استرجاع كلمة السر')));
  await receiveWhatsappMessages(db,envelope(message.replace(/([0-9]{7})([0-9])$/,(_,prefix,last)=>prefix+String((Number(last)+1)%10))));
  assert.equal((await checkWhatsappChallenge(db,poll)).status,'pending');
  const raw=JSON.stringify(envelope());const signature='sha256='+createHmac('sha256',process.env.GYMBANK_WHATSAPP_APP_SECRET!).update(raw).digest('hex');
  assert.equal((await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload:raw+' '})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload:raw})).statusCode,200);
  assert.equal((await checkWhatsappChallenge(db,poll)).status,'verified');
  const verified=(await db.phoneOtpChallenge.findUniqueOrThrow({where:{id:c.challengeId}})).verifiedAt;
  await receiveWhatsappMessages(db,envelope());assert.deepEqual((await db.phoneOtpChallenge.findUniqueOrThrow({where:{id:c.challengeId}})).verifiedAt,verified);
  const user=await registerPhonePreview(db,registration);assert.equal(user.user.phoneVerified,true);assert.equal(user.testMode,false);
  await assert.rejects(registerPhonePreview(db,registration),/PHONE_OTP_INVALID/);
  await assert.rejects(requestWhatsappChallenge(db,{phone,purpose:'REGISTER'}),/ACCOUNT_UNAVAILABLE/);
  const reset=await requestWhatsappChallenge(db,{phone,purpose:'RESET',language:'en'});
  const resetProof={phone,challengeId:reset.challengeId,whatsappToken:reset.whatsappToken};
  const resetMessage=new URL(reset.whatsappUrl).searchParams.get('text')!;
  assert.match(resetMessage,/\nVerification code: [0-9]{8}$/);
  await receiveWhatsappMessages(db,envelope(resetMessage,phone.slice(1),'123456789','wamid.synthetic-wa-2'));
  await resetPhonePreviewPassword(db,{...resetProof,newPassword:'87654321'});
  assert.equal(await authenticate(db,'Bearer '+user.accessToken),null);
  await assert.rejects(resetPhonePreviewPassword(db,{...resetProof,newPassword:password}),/PHONE_OTP_INVALID/);
  await db.phoneOtpChallenge.update({where:{id:reset.challengeId},data:{createdAt:new Date(Date.now()-61000)}});
  const expired=await requestWhatsappChallenge(db,{phone,purpose:'RESET'});
  await db.phoneOtpChallenge.update({where:{id:expired.challengeId},data:{expiresAt:new Date(Date.now()-1000),createdAt:new Date(Date.now()-61000)}});
  await receiveWhatsappMessages(db,envelope(new URL(expired.whatsappUrl).searchParams.get('text')!,phone.slice(1),'123456789','wamid.synthetic-wa-3'));
  assert.equal((await checkWhatsappChallenge(db,{phone,purpose:'RESET',challengeId:expired.challengeId,whatsappToken:expired.whatsappToken})).status,'expired');
  const cancelled=await requestWhatsappChallenge(db,{phone,purpose:'RESET'});const cancelledProof={phone,purpose:'RESET',challengeId:cancelled.challengeId,whatsappToken:cancelled.whatsappToken};
  await checkWhatsappChallenge(db,cancelledProof,true);
  await receiveWhatsappMessages(db,envelope(new URL(cancelled.whatsappUrl).searchParams.get('text')!,phone.slice(1),'123456789','wamid.synthetic-wa-4'));
  assert.equal((await checkWhatsappChallenge(db,cancelledProof)).status,'cancelled');
  assert.equal((await db.phoneOtpChallenge.findUniqueOrThrow({where:{id:cancelled.challengeId}})).verifiedAt,null);
 }finally{await app.close();await db.$disconnect();process.env=previous;}
});
