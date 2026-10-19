import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { requireBranchAccess } from '../src/auth/authorization.js';

function scope(actor: string, role?: 'CASHIER' | 'BRANCH_MANAGER', active = true) {
  const branch = { id: 'branch', status: 'ACTIVE', gym: { ownerId: 'owner', ownerAcceptedAt: new Date(), status: 'ACTIVE', owner: { isActive: true } } };
  const tx = {
    user: { findUnique: async () => ({ id: actor, isActive: active }) },
    branch: { findUnique: async () => branch },
    staffAssignment: { findFirst: async ({where}: {where: {userId: string; branchId: string; active: boolean; role: {in: string[]}}}) =>
      role && where.userId === actor && where.branchId === 'branch' && where.active && where.role.in.includes(role) ? { active: true, role } : null },
  } as unknown as Prisma.TransactionClient;
  return { tx, branch };
}
test('owner operates own branch without an artificial cashier assignment', async () => {
  const { tx, branch } = scope('owner');
  for (const permission of ['SELL_POINTS', 'CANCEL_VISIT', 'TRANSFER_STOCK'] as const)
    assert.equal(await requireBranchAccess(tx, 'owner', 'branch', permission), branch);
});
test('manager can sell and cancel; cashier cannot cancel or transfer branch stock', async () => {
  const manager = scope('manager', 'BRANCH_MANAGER'), cashier = scope('cashier', 'CASHIER');
  await requireBranchAccess(manager.tx, 'manager', 'branch', 'SELL_POINTS');
  await requireBranchAccess(manager.tx, 'manager', 'branch', 'CANCEL_VISIT');
  await requireBranchAccess(cashier.tx, 'cashier', 'branch', 'SELL_POINTS');
  for (const permission of ['CANCEL_VISIT', 'TRANSFER_STOCK'] as const)
    await assert.rejects(requireBranchAccess(cashier.tx, 'cashier', 'branch', permission), { code: 'BRANCH_ACCESS_DENIED' });
  await assert.rejects(requireBranchAccess(manager.tx, 'manager', 'branch', 'TRANSFER_STOCK'), { code: 'BRANCH_ACCESS_DENIED' });
});
test('global labels never substitute for scoped assignments; inactive tenants fail closed', async () => {
  for (const actor of ['unassigned-manager', 'other-owner', 'admin', 'trainee']) {
    const { tx } = scope(actor);
    await assert.rejects(requireBranchAccess(tx, actor, 'branch', 'SELL_POINTS'), { code: 'BRANCH_ACCESS_DENIED' });
  }
  const inactive = scope('owner', undefined, false);
  await assert.rejects(requireBranchAccess(inactive.tx, 'owner', 'branch', 'SELL_POINTS'), { code: 'ACCESS_DENIED' });
  for (const change of ['branch', 'gym', 'owner', 'invitation']) {
    const {tx, branch} = scope('owner');
    if (change === 'branch') branch.status = 'SUSPENDED';
    if (change === 'gym') branch.gym.status = 'SUSPENDED';
    if (change === 'owner') branch.gym.owner.isActive = false;
    if (change === 'invitation') branch.gym.ownerAcceptedAt = null as unknown as Date;
    await assert.rejects(requireBranchAccess(tx, 'owner', 'branch', 'SELL_POINTS'), { code: 'BRANCH_ACCESS_DENIED' });
  }
});
