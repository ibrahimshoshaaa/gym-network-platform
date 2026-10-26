import {createHmac, timingSafeEqual} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {whatsappConfig, requestWhatsappChallenge, checkWhatsappChallenge, receiveWhatsappMessages} from './whatsapp-service.js';
import {consumeAuthLimit} from './throttle.js';

export function whatsappStatus() {
  const enabled=whatsappConfig()!==null;
  return {enabled, reason:enabled?null:'SETUP_REQUIRED', method:'whatsapp'} as const;
}

export function validWhatsappSignature(body: Buffer, signature: unknown, secret: string) {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function registerWhatsappRoutes(app: FastifyInstance, db?: PrismaClient) {
  app.get('/auth/whatsapp/status', async () => ({...whatsappStatus(),enabled:!!db&&whatsappStatus().enabled}));
  for(const action of ['challenge','check','cancel'] as const)app.post('/auth/whatsapp/'+action, {
    onRequest:async r=>{if(db&&whatsappConfig())await consumeAuthLimit(db,'whatsapp-'+action+'-ip',r.ip,action==='challenge'?20:300,900);},
  },async (r,reply)=>{
    if(!db||!whatsappConfig())return reply.code(503).send({code:'WHATSAPP_UNAVAILABLE'});
    return action==='challenge'?requestWhatsappChallenge(db,r.body):checkWhatsappChallenge(db,r.body,action==='cancel');
  });

  app.register(async hook => {
    hook.removeContentTypeParser('application/json');
    hook.addContentTypeParser('application/json', {parseAs: 'buffer'}, (_r, body, done) => done(null, body));
    hook.get('/webhooks/whatsapp', {logLevel: 'silent'}, async (r, reply) => {
      reply.header('Cache-Control', 'no-store');
      const token = process.env.GYMBANK_WHATSAPP_VERIFY_TOKEN;
      if (!token || token.length < 32) return reply.code(503).send({code: 'WHATSAPP_UNAVAILABLE'});
      const q = r.query as Record<string, unknown>;
      const supplied = q['hub.verify_token'];
      const challenge = q['hub.challenge'];
      if (q['hub.mode'] !== 'subscribe' || typeof supplied !== 'string' ||
          Buffer.byteLength(supplied) !== Buffer.byteLength(token) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(token)) ||
          typeof challenge !== 'string' || !/^\d{1,128}$/.test(challenge)) {
        return reply.code(403).send({code: 'ACCESS_DENIED'});
      }
      return reply.type('text/plain').send(challenge);
    });
    hook.post('/webhooks/whatsapp', {bodyLimit: 65536, logLevel: 'silent'}, async (r, reply) => {
      reply.header('Cache-Control', 'no-store');
      const secret = process.env.GYMBANK_WHATSAPP_APP_SECRET;
      if (!secret) return reply.code(503).send({code: 'WHATSAPP_UNAVAILABLE'});
      if (!Buffer.isBuffer(r.body) || !validWhatsappSignature(r.body, r.headers['x-hub-signature-256'], secret)) {
        return reply.code(403).send({code: 'ACCESS_DENIED'});
      }
      if(!db||!whatsappConfig())return reply.code(503).send({code:'WHATSAPP_UNAVAILABLE'});
      let payload:unknown;
      try {payload=JSON.parse(r.body.toString('utf8'));} catch {return reply.code(400).send({code:'INVALID_INPUT'});}
      return receiveWhatsappMessages(db,payload);
    });
  });
}
