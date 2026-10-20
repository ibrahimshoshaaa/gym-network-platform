import type { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../auth/authorization.js';
import { serializable } from '../ledger/service.js';
import { audit } from '../gyms/service.js';
import { parse } from '../gyms/validation.js';
import { DomainError } from '../domain/errors.js';
import { publishBookingPolicySchema, snapshotPolicy } from './policy.js';

export async function currentBookingPolicy(db: PrismaClient) {
  const row = await db.bookingPolicy.findFirst({ orderBy: { version: 'desc' } });
  return row ? { id: row.id, version: row.version, policy: snapshotPolicy(row.configuration), createdAt: row.createdAt } : null;
}
export async function publishBookingPolicy(db: PrismaClient, actorId: string, input: unknown) {
  const data = parse(publishBookingPolicySchema, input);
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-booking-policy', 0))`;
    const current = await tx.bookingPolicy.findFirst({ orderBy: { version: 'desc' } });
    if ((current?.version ?? 0) !== data.expectedVersion) throw new DomainError('STALE_SETTINGS');
    const row = await tx.bookingPolicy.create({ data: {
      version: data.expectedVersion + 1, configuration: data.policy, createdById: actorId,
    } });
    await audit(tx, actorId, 'BOOKING_POLICY_PUBLISHED', row.id, 'Published versioned booking grace and no-show policy');
    return { id: row.id, version: row.version, policy: snapshotPolicy(row.configuration), createdAt: row.createdAt };
  });
}
