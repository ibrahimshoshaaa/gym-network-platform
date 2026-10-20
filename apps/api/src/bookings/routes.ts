import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { actorId } from '../gyms/routes.js';
import { requireAdmin } from '../auth/authorization.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { currentBookingPolicy, publishBookingPolicy } from './settings.js';

export function registerBookingPolicyRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/booking-policy', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    await actorId(db, request);
    return { policy: await currentBookingPolicy(db) };
  });
  app.get('/admin/booking-policy', async request => {
    await requireAdmin(db, await actorId(db, request));
    return { policy: await currentBookingPolicy(db) };
  });
  app.post('/admin/booking-policy', async request => {
    const id = await actorId(db, request);
    await requireAdmin(db, id);
    await consumeAuthLimit(db, 'booking-policy-write', id, 30, 900);
    return publishBookingPolicy(db, id, request.body);
  });
}
