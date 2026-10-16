import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { authenticate, hashToken } from './auth/sessions.js';
import { DomainError } from './domain/errors.js';
import { ThrottleError } from './auth/throttle.js';
import { registerTraineeRoutes } from './auth/routes.js';
import { publicIdentity } from './auth/trainees.js';

export function buildApp(db?: PrismaClient) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.body.password', 'req.body.currentPassword', 'req.body.newPassword'] }, trustProxy: false });
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/auth/') || request.url.split('?')[0] === '/me') reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      const codes: Record<string, number> = { INVALID_INPUT: 400, INVALID_CREDENTIALS: 401, UNAUTHENTICATED: 401, ACCOUNT_UNAVAILABLE: 409, RATE_LIMITED: 429, AUTH_BUSY: 503 };
      const status = codes[error.code] ?? 500;
      if (error instanceof ThrottleError) reply.header('Retry-After', error.retryAfter);
      if (error.code === 'AUTH_BUSY') reply.header('Retry-After', 1);
      return reply.code(status).send({ code: status < 500 || status === 503 ? error.code : 'INTERNAL_ERROR', requestId: request.id });
    }
    // Never log request bodies or Prisma argument dumps containing credentials.
    request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
    const status = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(status).send({ code: status >= 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', requestId: request.id });
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'gym-network-api',
    version: '0.1.0',
  }));

  if (db) {
    registerTraineeRoutes(app, db);
    app.get('/me', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      return publicIdentity(user);
    });
    app.post('/auth/logout', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      const token = request.headers.authorization!.slice(7);
      await db.authSession.updateMany({ where: { tokenHash: hashToken(token), userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return reply.code(204).send();
    });
  }
  // Contact verification/OTP and financial HTTP routes remain unavailable.
  return app;
}

