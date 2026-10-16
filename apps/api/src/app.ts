import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { authenticate, hashToken } from './auth/sessions.js';

export function buildApp(db?: PrismaClient) {
  const app = Fastify({ logger: true, trustProxy: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'gym-network-api',
    version: '0.1.0',
  }));

  if (db) {
    app.get('/me', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      return { id: user.id, displayName: user.displayName, role: user.role };
    });
    app.post('/auth/logout', async (request, reply) => {
      const user = await authenticate(db, request.headers.authorization);
      if (!user) return reply.code(401).send({ code: 'UNAUTHENTICATED' });
      const token = request.headers.authorization!.slice(7);
      await db.authSession.updateMany({ where: { tokenHash: hashToken(token), userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      return reply.code(204).send();
    });
  }
  // OTP/sign-in and financial HTTP routes remain unavailable.
  return app;
}

