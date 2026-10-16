import { Prisma, type PrismaClient, type User } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { createSession, hashToken } from './sessions.js';
import { registrationSchema, loginSchema, passwordChangeSchema } from './validation.js';

const sessionMilliseconds = 7 * 24 * 60 * 60 * 1000;
export const publicIdentity = (user: User) => ({
  id: user.id, displayName: user.displayName, role: user.role,
  phone: user.phoneE164, email: user.email,
  emailVerified: user.emailVerifiedAt !== null, phoneVerified: user.phoneVerifiedAt !== null,
});
async function sessionResult(tx: Prisma.TransactionClient, user: User) {
  const expiresAt = new Date(Date.now() + sessionMilliseconds);
  const accessToken = await createSession(tx, user.id, expiresAt);
  return { user: publicIdentity(user), accessToken, tokenType: 'Bearer', expiresAt: expiresAt.toISOString() };
}

export async function registerTrainee(db: PrismaClient, input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_INPUT');
  const { displayName, phone, email, password } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    return await db.$transaction(async tx => {
      // Neither role nor verification flags can be supplied by a client.
      const user = await tx.user.create({ data: {
        displayName, phoneE164: phone, email, role: 'TRAINEE',
        password: { create: { passwordHash } },
        pointAccounts: { create: { type: 'TRAINEE_WALLET' } },
      } });
      const result = await sessionResult(tx, user);
      await tx.auditLog.create({ data: { actorId: user.id, action: 'TRAINEE_REGISTERED', entityId: user.id, reason: 'Password registration; email and phone verification deferred by approved decision' } });
      return result;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new DomainError('ACCOUNT_UNAVAILABLE');
    throw error;
  }
}

export async function loginTrainee(db: PrismaClient, input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_INPUT');
  const { identifier, password } = parsed.data;
  const where = identifier.includes('@') ? { email: identifier } : { phoneE164: identifier };
  const user = await db.user.findUnique({ where, include: { password: true } });
  const eligible = Boolean(user?.isActive && user.role === 'TRAINEE' && user.password);
  const hash = eligible ? user!.password!.passwordHash : undefined;
  const correct = await verifyPassword(password, hash);
  if (!correct || !eligible || !user) throw new DomainError('INVALID_CREDENTIALS');
  return db.$transaction(async tx => {
    // Recheck under a user lock after the KDF, so a concurrent password change
    // cannot issue a session authenticated by an obsolete password.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id }, include: { password: true } });
    if (!current?.isActive || current.role !== 'TRAINEE' || current.password?.passwordHash !== hash) throw new DomainError('INVALID_CREDENTIALS');
    const result = await sessionResult(tx, current);
    await tx.auditLog.create({ data: { actorId: current.id, action: 'TRAINEE_LOGIN', entityId: current.id, reason: 'Password sign-in' } });
    return result;
  });
}

export async function changeTraineePassword(db: PrismaClient, userId: string, sessionToken: string, input: unknown) {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_INPUT');
  const user = await db.user.findUnique({ where: { id: userId }, include: { password: true } });
  const eligible = Boolean(user?.isActive && user.role === 'TRAINEE' && user.password);
  const hash = eligible ? user!.password!.passwordHash : undefined;
  if (!await verifyPassword(parsed.data.currentPassword, hash) || !eligible) throw new DomainError('INVALID_CREDENTIALS');
  const passwordHash = await hashPassword(parsed.data.newPassword);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId }, include: { password: true } });
    const session = await tx.authSession.findUnique({ where: { tokenHash: hashToken(sessionToken) } });
    if (!current?.isActive || current.role !== 'TRAINEE' || current.password?.passwordHash !== hash ||
        !session || session.userId !== userId || session.revokedAt || session.expiresAt <= new Date()) throw new DomainError('INVALID_CREDENTIALS');
    await tx.userPassword.update({ where: { userId }, data: { passwordHash, changedAt: new Date() } });
    await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    const result = await sessionResult(tx, current);
    await tx.auditLog.create({ data: { actorId: userId, action: 'PASSWORD_CHANGED', entityId: userId, reason: 'Current password confirmed; all previous sessions revoked' } });
    return result;
  });
}
