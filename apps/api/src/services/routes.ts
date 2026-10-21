import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { requireAdmin } from '../auth/authorization.js';
import { createService, listServices, requestServiceChange, reviewService, setServiceActive } from './service.js';

export function registerServiceRoutes(app: FastifyInstance, db: PrismaClient) {
  const id = (value: unknown) => parse(z.string().uuid(), value);
  app.get<{ Params: { branchId: string } }>('/directory/branches/:branchId/services', async r => listServices(db, await actorId(db, r), id(r.params.branchId), false));
  const base = '/gyms/:gymId/branches/:branchId/services';
  type Params = { gymId: string; branchId: string; serviceId: string };
  // Match both IDs before delegating authorization to the shared service layer.
  async function branch(p: Params) {
    const gymId = id(p.gymId), branchId = id(p.branchId);
    if (!await db.branch.findFirst({ where: { id: branchId, gymId }, select: { id: true } })) {
      const { DomainError } = await import('../domain/errors.js');
      throw new DomainError('NOT_FOUND');
    }
    return branchId;
  }
  app.get<{ Params: Params }>(base, async r => listServices(db, await actorId(db, r), await branch(r.params), true));
  app.post<{ Params: Params }>(base, async (r, reply) => reply.code(201).send(await createService(db, await actorId(db, r), await branch(r.params), r.body)));
  app.post<{ Params: Params }>(`${base}/:serviceId/price-requests`, async (r, reply) => reply.code(201).send(await requestServiceChange(db, await actorId(db, r), await branch(r.params), id(r.params.serviceId), r.body)));
  app.patch<{ Params: Params }>(`${base}/:serviceId/availability`, async r => setServiceActive(db, await actorId(db, r), await branch(r.params), id(r.params.serviceId), r.body));
  app.get('/admin/service-price-requests', async r => {
    const actor = await actorId(db, r);
    const query = parse(z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(25), status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING') }).strict(), r.query);
    return db.$transaction(async tx => {
      await requireAdmin(tx, actor);
      const items = await tx.servicePriceRequest.findMany({ where: { status: query.status }, orderBy: { id: 'asc' }, take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), include: { service: { include: { branch: { select: { id: true, name: true, gymId: true } } } } } });
      return { items: items.slice(0, query.limit), nextCursor: items.length > query.limit ? items[query.limit - 1]!.id : null };
    });
  });
  app.post<{ Params: { requestId: string } }>('/admin/service-price-requests/:requestId/review', async r => reviewService(db, await actorId(db, r), id(r.params.requestId), r.body));
}
