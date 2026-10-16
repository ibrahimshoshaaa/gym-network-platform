import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

// Internal only: invoke after a verified identity flow. Never expose a userId
// based session creation route. OTP provider/sign-in is a subsequent sprint.
export async function createSession(db: PrismaClient, userId: string, expiresAt: Date) {
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) throw new Error('Invalid session expiry');
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.isActive) throw new Error('Inactive identity');
  const token = randomBytes(32).toString('base64url');
  await db.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return token;
}

export async function authenticate(db: PrismaClient, authorization?: string) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '');
  if (!match?.[1]) return null;
  const session = await db.authSession.findUnique({ where: { tokenHash: hashToken(match[1]) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return session.user;
}
