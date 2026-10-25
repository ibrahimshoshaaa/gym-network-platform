import test from 'node:test';
import assert from 'node:assert/strict';
import {textbeeConfig,newPhoneCode,smsCodeHash,sendTextbeeCode} from '../src/auth/textbee.js';
import {phonePreviewStatus} from '../src/auth/phone-preview.js';

const env={GYMBANK_OTP_MODE:'textbee',TEXTBEE_API_KEY:'synthetic-provider-key',TEXTBEE_DEVICE_ID:'0123456789abcdef01234567',GYMBANK_OTP_SECRET:'synthetic-key-for-tests-only-32-characters'};
test('TextBee refuses incomplete config and accepts only an explicit device and valid SIM',()=>{
 assert.equal(textbeeConfig({}),null);
 assert.equal(textbeeConfig({...env,GYMBANK_OTP_SECRET:'short'}),null);
 assert.equal(textbeeConfig({...env,TEXTBEE_DEVICE_ID:'bad'}),null);
 assert.equal(textbeeConfig({...env,TEXTBEE_SIM_SUBSCRIPTION_ID:'-1'}),null);
 assert.equal(textbeeConfig({...env,TEXTBEE_SIM_SUBSCRIPTION_ID:'2'})?.simSubscriptionId,2);
 const codes=Array.from({length:50},()=>newPhoneCode());
 assert.ok(codes.every(c=>/^\d{6}$/.test(c)));assert.ok(new Set(codes).size>1);
});
test('live OTP sends only to the selected device, uses keyed proofs and never returns provider errors',async()=>{
 const previous={...process.env};Object.assign(process.env,env);
 try{
  assert.deepEqual(phonePreviewStatus(),{enabled:true,testMode:false});
  let calls=0;
  const transport:typeof fetch=async(url,options)=>{
   calls++;assert.equal(url,'https://api.textbee.dev/api/v1/gateway/send-sms');
   assert.equal(options?.redirect,'error');assert.equal(new Headers(options?.headers).get('x-api-key'),env.TEXTBEE_API_KEY);
   const body=JSON.parse(String(options?.body));assert.deepEqual(body.recipients,['+201055550987']);assert.equal(body.deviceId,env.TEXTBEE_DEVICE_ID);
   assert.match(body.message,/654321/);assert.equal('simSubscriptionId' in body,false);
   return Response.json({data:{success:true,smsBatchId:'synthetic-batch'}});
  };
  assert.notEqual(smsCodeHash('id','phone','REGISTER','654321'),smsCodeHash('id','phone','RESET','654321'));
  await sendTextbeeCode('+201055550987','654321','REGISTER',transport);assert.equal(calls,1);
  for(const transport of [async()=>Response.json({secret:'must-not-leak'},{status:401}),async()=>Response.json({data:{success:false}}),async()=>Response.json({data:{success:true,smsBatchId:'id',warning:{code:'SMS_PERMISSION_MISSING'}}}),async()=>{throw Error('synthetic-key-must-not-leak');}]){
   await assert.rejects(sendTextbeeCode('+201055550987','654321','RESET',transport),e=>e instanceof Error&&e.message==='PHONE_OTP_SEND_FAILED');
  }
  await sendTextbeeCode('+201055550987','654321','RESET',async()=>Response.json({data:{successCount:1,failureCount:0}}));
 }finally{for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
