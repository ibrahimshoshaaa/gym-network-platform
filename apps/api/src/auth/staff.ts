import {authority} from './delegation.js';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { hasStaffAccess } from './authorization.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { hashToken } from './sessions.js';
import { loginSchema, newPasswordSchema } from './validation.js';
import { sessionResult } from './trainees.js';
import { serializable } from '../ledger/service.js';
import { audit } from '../gyms/service.js';

export const invitationAcceptSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(1).max(256) }).strict();

export async function acceptInvitation(db: PrismaClient, input: unknown) {
  const parsed = invitationAcceptSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_INPUT');
  const { token, password } = parsed.data;
  const invitation = await db.staffInvitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { password: true } } } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new DomainError('INVITATION_INVALID');
  const oldHash = invitation.user.password?.passwordHash;
  if (oldHash) {
    if (!invitation.user.isActive || !await verifyPassword(password, oldHash)) throw new DomainError('INVALID_CREDENTIALS');
  } else if (!newPasswordSchema.safeParse(password).success) throw new DomainError('INVALID_INPUT');
  const passwordHash = oldHash ?? await hashPassword(password);
  return serializable(db, async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${invitation.userId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "StaffInvitation" WHERE id = ${invitation.id}::uuid FOR UPDATE`;
    const current = await tx.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id }, include: { user: { include: { password: true } }, gym: { include: { owner: true } }, branch: true } });
    if (current.acceptedAt || current.revokedAt || current.expiresAt <= new Date() || !['PENDING', 'ACTIVE'].includes(current.gym.status)) throw new DomainError('INVITATION_INVALID');
    const creator = await tx.user.findUnique({ where: { id: current.createdById } });
    if (!creator?.isActive || current.user.role === 'PLATFORM_ADMIN' || current.user.password?.passwordHash !== oldHash || (oldHash && !current.user.isActive)) throw new DomainError('INVITATION_INVALID');
    if (current.type === 'OWNER') {
      if (creator.role !== 'PLATFORM_ADMIN' || current.gym.ownerId !== current.userId || current.gym.ownerAcceptedAt) throw new DomainError('INVITATION_INVALID');
      await tx.gym.update({ where: { id: current.gymId }, data: { ownerAcceptedAt: new Date() } });
    } else {
      const grant=await authority(tx,creator.id,current.gymId,current.branchId??undefined);
      if (!(creator.id===current.gym.ownerId||grant.full||(current.role==='CASHIER'&&grant.permissions.includes('MANAGE_CASHIERS'))) || !current.gym.owner.isActive || !current.gym.ownerAcceptedAt || current.gym.status !== 'ACTIVE' || !current.branch || current.branch.gymId !== current.gymId || current.branch.status === 'SUSPENDED') throw new DomainError('INVITATION_INVALID');
      await tx.staffAssignment.upsert({ where: { userId_branchId_role: { userId: current.userId, branchId: current.branch.id, role: current.role } },
        create: { userId: current.userId, branchId: current.branch.id, role: current.role }, update: { active: true } });
    }
    if (!oldHash) await tx.userPassword.create({ data: { userId: current.userId, passwordHash } });
    const user = await tx.user.update({ where: { id: current.userId }, data: { isActive: true } });
    await tx.staffInvitation.update({ where: { id: current.id }, data: { acceptedAt: new Date() } });
    await audit(tx, user.id, 'INVITATION_ACCEPTED', current.id, 'Invitation accepted with new password or existing password confirmation; contacts remain unverified');
    return { ...await sessionResult(tx, user), membership: { gymId: current.gymId, branchId: current.branchId, role: current.role } };
  });
}

export async function loginStaff(db: PrismaClient, input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new DomainError('INVALID_INPUT');
  const { identifier, password } = parsed.data;
  const user = await db.user.findUnique({ where: identifier.includes('@') ? { email: identifier } : { phoneE164: identifier }, include: { password: true } });
  const eligible = Boolean(user?.isActive && user.role !== 'PLATFORM_ADMIN' && user.password && (await hasStaffAccess(db, user.id) || (user.role==='GYM_OWNER' && Boolean(await db.gymApplication.findUnique({where:{ownerId:user.id}})))));
  const hash = eligible ? user!.password!.passwordHash : undefined;
  if (!await verifyPassword(password, hash) || !eligible || !user) throw new DomainError('INVALID_CREDENTIALS');
  return serializable(db, async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id }, include: { password: true } });
    if (!current?.isActive || current.role === 'PLATFORM_ADMIN' || current.password?.passwordHash !== hash || !(await hasStaffAccess(tx, user.id) || (current.role==='GYM_OWNER' && Boolean(await tx.gymApplication.findUnique({where:{ownerId:user.id}}))))) throw new DomainError('INVALID_CREDENTIALS');
    const result = await sessionResult(tx, current);
    await audit(tx, current.id, 'STAFF_LOGIN', current.id, 'Password sign-in with live owner or branch assignment checks');
    return result;
  });
}

