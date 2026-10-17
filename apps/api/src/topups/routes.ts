import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { requireActor, requireAdmin } from '../auth/authorization.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { DomainError } from '../domain/errors.js';
import { publishPolicy, policyView, savePackage, savePaymentMethod } from './settings.js';
import { getQuote, submitTopup, reviewTopup, topupView } from './service.js';
import { receiptLimit, uploadReceipt, accessReceipt, type ReceiptStorage } from './receipts.js';

const uuid = z.string().uuid();
function id(r: FastifyRequest, key: string) { return parse(uuid, (r.params as Record<string, string>)[key]); }
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: uuid.optional() }).strict();
export function registerTopupRoutes(app: FastifyInstance, db: PrismaClient, storage: ReceiptStorage) {
  app.get('/admin/topup-settings', async r => db.$transaction(async tx => {
    await requireAdmin(tx, await actorId(db, r));
    const policy = await tx.pricingPolicy.findFirst({ orderBy: { version: 'desc' } });
    return { policy: policy ? policyView(policy) : null, paymentMethods: await tx.paymentMethod.findMany({ orderBy: { type: 'asc' } }), packages: await tx.topupPackage.findMany({ take: 100, orderBy: { id: 'asc' } }) };
  }));
  app.post('/admin/pricing-policies', async r => publishPolicy(db, await actorId(db, r), r.body));
  app.put('/admin/payment-methods/:type', async r => savePaymentMethod(db, await actorId(db, r), (r.params as { type: string }).type, r.body));
  app.post('/admin/topup-packages', async r => savePackage(db, await actorId(db, r), undefined, r.body));
  app.put('/admin/topup-packages/:packageId', async r => savePackage(db, await actorId(db, r), id(r, 'packageId'), r.body));
  app.get('/topup-options', async r => {
    const userId = await actorId(db, r);
    const query = parse(z.object({ kind: z.enum(['TRAINEE', 'BRANCH_STOCK']) }).strict(), r.query);
    return db.$transaction(async tx => {
      await requireActor(tx, userId);
      const policy = await tx.pricingPolicy.findFirst({ orderBy: { version: 'desc' } });
      return { policy: policy ? policyView(policy) : null, paymentMethods: await tx.paymentMethod.findMany({ where: { enabled: true }, select: { type: true, version: true, account: true, accountName: true } }), packages: await tx.topupPackage.findMany({ where: { enabled: true, kind: query.kind }, take: 100, orderBy: { id: 'asc' } }) };
    });
  });
  app.post('/topup-quotes', async r => getQuote(db, await actorId(db, r), r.body));
  app.post('/topups', async (r, reply) => {
    const userId = await actorId(db, r);
    await consumeAuthLimit(db, 'topup-submit', userId, 30, 3600);
    return reply.code(201).send(await submitTopup(db, userId, parse(uuid, r.headers['idempotency-key']), r.body));
  });
  for (const admin of [false, true]) {
    app.get(admin ? '/admin/topups' : '/topups', async r => {
      const userId = await actorId(db, r), query = parse(pageSchema, r.query);
      return db.$transaction(async tx => {
        if (admin) await requireAdmin(tx, userId); else await requireActor(tx, userId);
        const rows = await tx.topupRequest.findMany({ include: { requestorUser: { select: { displayName: true, email: true, phoneE164: true } }, receivingBranch: { select: { name: true, gym: { select: { name: true } } } } }, where: admin ? { status: 'PENDING' } : { requestorUserId: userId }, take: query.limit + 1, orderBy: { id: 'asc' }, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) });
        return { items: rows.slice(0, query.limit).map(row => ({ ...topupView(row), ...(admin ? { requestor: row.requestorUser, branch: row.receivingBranch } : {}) })), nextCursor: rows.length > query.limit ? rows[query.limit - 1]!.id : null };
      });
    });
  }
  app.post('/admin/topups/:requestId/review', async r => reviewTopup(db, await actorId(db, r), id(r, 'requestId'), r.body));
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp'], { parseAs: 'buffer', bodyLimit: receiptLimit }, (_r, body, done) => done(null, body));
  app.post('/receipts', { bodyLimit: receiptLimit, onRequest: async r => {
    const userId = await actorId(db, r);
    await consumeAuthLimit(db, 'receipt-ip', r.ip, 40, 3600);
    await consumeAuthLimit(db, 'receipt-user', userId, 20, 3600);
  } }, async (r, reply) => {
    if (!Buffer.isBuffer(r.body)) throw new DomainError('INVALID_RECEIPT');
    return reply.code(201).send(await uploadReceipt(db, storage, await actorId(db, r), r.body));
  });
  app.get('/receipts/:receiptId/access', async r => accessReceipt(db, storage, await actorId(db, r), id(r, 'receiptId')));
}
