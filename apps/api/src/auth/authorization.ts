import type { Prisma } from '@prisma/client';
import { DomainError } from '../domain/errors.js';

export async function requireActor(tx: Prisma.TransactionClient, userId: string) {
  const actor = await tx.user.findUnique({ where: { id: userId } });
  if (!actor?.isActive) throw new DomainError('ACCESS_DENIED');
  return actor;
}

export async function requireAdmin(tx: Prisma.TransactionClient, userId: string) {
  const actor = await requireActor(tx, userId);
  if (actor.role !== 'PLATFORM_ADMIN') throw new DomainError('ACCESS_DENIED');
  return actor;
}

// Ownership/assignments are authoritative. A global role label never grants
// access to another tenant, or cashier permissions to an owner/manager.
export async function requireBranchAccess(
  tx: Prisma.TransactionClient, userId: string, branchId: string,
  permission: 'TRANSFER_STOCK' | 'SELL_POINTS' | 'CANCEL_VISIT',
) {
  await requireActor(tx, userId);
  const branch = await tx.branch.findUnique({ where: { id: branchId }, include: { gym: { include: { owner: { select: { isActive: true } } } } } });
  if (!branch || branch.status !== 'ACTIVE' || branch.gym.status !== 'ACTIVE' || !branch.gym.ownerAcceptedAt || !branch.gym.owner.isActive) throw new DomainError('BRANCH_ACCESS_DENIED');
  if (permission === 'TRANSFER_STOCK') {
    if (branch.gym.ownerId !== userId || !branch.gym.ownerAcceptedAt) throw new DomainError('BRANCH_ACCESS_DENIED');
  } else {
    const role = permission === 'SELL_POINTS' ? 'CASHIER' : 'BRANCH_MANAGER';
    const membership = await tx.staffAssignment.findUnique({
      where: { userId_branchId_role: { userId, branchId, role } },
    });
    if (!membership?.active) throw new DomainError('BRANCH_ACCESS_DENIED');
  }
  return branch;
}

export async function requireGymOwner(tx: Prisma.TransactionClient, userId: string, gymId: string, editable = true) {
  await requireActor(tx, userId);
  const gym = await tx.gym.findUnique({ where: { id: gymId } });
  if (!gym || gym.ownerId !== userId || !gym.ownerAcceptedAt) throw new DomainError('GYM_ACCESS_DENIED');
  if (editable && !['PENDING', 'ACTIVE'].includes(gym.status)) throw new DomainError('GYM_INACTIVE');
  return gym;
}

export async function hasStaffAccess(tx: Prisma.TransactionClient, userId: string) {
  return Boolean(await tx.gym.findFirst({ where: { ownerId: userId, ownerAcceptedAt: { not: null }, status: { in: ['PENDING', 'ACTIVE'] } }, select: { id: true } }) ||
    await tx.staffAssignment.findFirst({ where: { userId, active: true, branch: { gym: { status: 'ACTIVE', ownerAcceptedAt: { not: null }, owner: { isActive: true } } } }, select: { id: true } }));
}
