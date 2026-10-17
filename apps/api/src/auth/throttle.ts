import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { DomainError } from '../domain/errors.js';

export class ThrottleError extends DomainError {
  constructor(public readonly retryAfter: number) { super('RATE_LIMITED'); }
}

export const throttleKey = (scope: string, identifier: string) => createHash('sha256').update(`${scope}\0${identifier}`).digest('hex');

// A single atomic UPSERT shares counters across workers and survives restarts.
// Call before expensive KDF work, outside the identity/session transaction so
// failed login and registration attempts also consume their allowance.
export async function consumeAuthLimit(db: PrismaClient, scope: string, identifier: string, limit: number, seconds: number) {
  const key = throttleKey(scope, identifier);
  const rows = await db.$queryRaw<{ attempts: number; expiresAt: Date }[]>`
    INSERT INTO "AuthThrottle" (key, attempts, "expiresAt")
    VALUES (${key}, 1, clock_timestamp() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN "AuthThrottle"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("AuthThrottle".attempts + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "AuthThrottle"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${seconds} * interval '1 second' ELSE "AuthThrottle"."expiresAt" END
    RETURNING attempts, "expiresAt"`;
  const row = rows[0]!;
  if (row.attempts > limit) throw new ThrottleError(Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000)));
}
