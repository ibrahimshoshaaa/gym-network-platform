import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import Fastify from 'fastify';
import {registerWhatsappRoutes, validWhatsappSignature} from '../src/auth/whatsapp.js';

test('WhatsApp foundation stays disabled even with credentials; handshake does not verify an identity', async () => {
 const previous = {...process.env};
 process.env.GYMBANK_WHATSAPP_VERIFY_TOKEN = 'local-test-verify-token-with-32-characters';
 process.env.GYMBANK_WHATSAPP_APP_SECRET = 'local-test-secret';
 const app = Fastify(); registerWhatsappRoutes(app);
 try {
  const status = await app.inject('/auth/whatsapp/status');
  assert.deepEqual(status.json(), {enabled:false, reason:'SETUP_REQUIRED', method:'whatsapp'});
  assert.equal((await app.inject({method:'POST',url:'/auth/whatsapp/challenge',payload:{phone:'+201055550123',purpose:'REGISTER'}})).statusCode,503);
  const query = new URLSearchParams({'hub.mode':'subscribe','hub.verify_token':process.env.GYMBANK_WHATSAPP_VERIFY_TOKEN,'hub.challenge':'123456'});
  const valid = await app.inject('/webhooks/whatsapp?'+query);
  assert.equal(valid.statusCode,200);assert.equal(valid.body,'123456');assert.match(valid.headers['content-type']!,/text\/plain/);
  query.set('hub.verify_token','wrong');assert.equal((await app.inject('/webhooks/whatsapp?'+query)).statusCode,403);
  delete process.env.GYMBANK_WHATSAPP_VERIFY_TOKEN;
  assert.equal((await app.inject('/webhooks/whatsapp?'+query)).statusCode,503);
  const payload = '{ "object": "whatsapp_business_account" }';
  const signature = 'sha256='+createHmac('sha256','local-test-secret').update(payload).digest('hex');
  // Valid inbound events are not silently accepted before durable ingestion exists.
  assert.equal((await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload})).statusCode,503);
  assert.equal((await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload:payload+' '})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json'},payload})).statusCode,403);
  const oversized = await app.inject({method:'POST',url:'/webhooks/whatsapp',headers:{'content-type':'application/json'},payload:' '.repeat(65537)});
  assert.equal(oversized.statusCode,413);
 } finally { await app.close(); process.env = previous; }
});

test('webhook signatures require the exact bytes, a secret, and well-formed SHA256', () => {
 const body = Buffer.from('{"text":"تأكيد"}');
 const signature = 'sha256='+createHmac('sha256','secret').update(body).digest('hex');
 assert.equal(validWhatsappSignature(body,signature,'secret'),true);
 for (const invalid of [undefined, '', 'sha256=00', signature+'00', ['signature']]) assert.equal(validWhatsappSignature(body,invalid,'secret'),false);
 assert.equal(validWhatsappSignature(body,signature,''),false);
 assert.equal(validWhatsappSignature(body,signature,'other-secret'),false);
});

test('WhatsApp opt-in requires complete configuration and messages expose neither poll secrets nor other senders', async () => {
 const {whatsappConfig,whatsappMessages}=await import('../src/auth/whatsapp-service.js');
 const env={GYMBANK_WHATSAPP_ENABLED:'true',GYMBANK_WHATSAPP_PHONE:'+201214829716',GYMBANK_WHATSAPP_PHONE_NUMBER_ID:'123456789',GYMBANK_WHATSAPP_APP_SECRET:'test-secret-with-length',GYMBANK_WHATSAPP_VERIFY_TOKEN:'test-verify-token-with-more-than-32-characters'};
 assert.ok(whatsappConfig(env));assert.equal(whatsappConfig({...env,GYMBANK_WHATSAPP_ENABLED:'false'}),null);
 assert.equal(whatsappConfig({...env,GYMBANK_WHATSAPP_PHONE_NUMBER_ID:''}),null);
 const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456789'},messages:[{id:'message-1',from:'201055549901',timestamp:'1792979000',type:'text',text:{body:'تأكيد رقم الموبايل في GymBank\nGBVERIFY '+'x'.repeat(43)}}]}}]}]};
 assert.equal(whatsappMessages(payload,'123456789')[0]?.phone,'+201055549901');
 assert.equal(whatsappMessages(payload,'other').length,0);
 assert.throws(()=>whatsappMessages({},'123456789'),/INVALID_INPUT/);
});

test('English inbound WhatsApp verification preserves purpose and the same signed-proof protocol',async()=>{
 const {whatsappMessages}=await import('../src/auth/whatsapp-service.js');
 for(const [label,purpose] of [['Verify mobile number in GymBank','REGISTER'],['Verify password recovery in GymBank','RESET']]){
  const payload={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456789'},messages:[{id:'synthetic-en',from:'201055549901',timestamp:'1792979000',type:'text',text:{body:label+'\nGBVERIFY '+'x'.repeat(43)}}]}}]}]};
  assert.equal(whatsappMessages(payload,'123456789')[0]?.purpose,purpose);
 }
});
