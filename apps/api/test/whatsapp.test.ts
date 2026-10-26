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
