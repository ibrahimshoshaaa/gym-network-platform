import {createHmac, timingSafeEqual} from 'node:crypto';
import type {FastifyInstance} from 'fastify';

// Foundation only: configuration must never enable an unfinished identity proof.
export function whatsappStatus() {
  return {enabled: false, reason: 'SETUP_REQUIRED', method: 'whatsapp'} as const;
}

export function validWhatsappSignature(body: Buffer, signature: unknown, secret: string) {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function registerWhatsappRoutes(app: FastifyInstance) {
  app.get('/auth/whatsapp/status', async () => whatsappStatus());
  // Reserved contract. No challenges, SMS, users or sessions are created here.
  app.post('/auth/whatsapp/challenge', async (_r, reply) =>
    reply.code(503).send({code: 'WHATSAPP_UNAVAILABLE'}));

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
      // Deliberately not acknowledged: durable ingestion/identity binding are not
      // implemented yet. Never silently drop an event or mark a phone verified.
      return reply.code(503).send({code: 'WHATSAPP_UNAVAILABLE'});
    });
  });
}
