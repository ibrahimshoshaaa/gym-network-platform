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
  const branch = await tx.branch.findUnique({ where: { id: branchId }, include: { gym: true } });
  if (!branch || branch.status !== 'ACTIVE') throw new DomainError('BRANCH_ACCESS_DENIED');
  if (permission === 'TRANSFER_STOCK') {
    if (branch.gym.ownerId !== userId) throw new DomainError('BRANCH_ACCESS_DENIED');
  } else {
    const role = permission === 'SELL_POINTS' ? 'CASHIER' : 'BRANCH_MANAGER';
    const membership = await tx.staffAssignment.findUnique({
      where: { userId_branchId_role: { userId, branchId, role } },
    });
    if (!membership?.active) throw new DomainError('BRANCH_ACCESS_DENIED');
  }
  return branch;
}
