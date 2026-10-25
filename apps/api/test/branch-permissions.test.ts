import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { requireBranchAccess } from '../src/auth/authorization.js';

function scope(actor: string, role?: 'CASHIER' | 'BRANCH_MANAGER', active = true) {
  const branch = { gymId:'gym',id: 'branch', status: 'ACTIVE', gym: { id:'gym',ownerId: 'owner', ownerAcceptedAt: new Date(), status: 'ACTIVE', owner: { isActive: true } } };
  const tx = {
    user: { findUnique: async () => ({ id: actor, isActive: active }) },
    branch: { findUnique: async () => branch,findFirst:async()=>branch },
    gym:{findUnique:async()=>branch.gym},staffDelegation:{findMany:async()=>[]},
    staffAssignment: { findFirst: async ({where}: {where: {userId: string; branchId?: string; active: boolean; role: string|{in: string[]}}}) =>
      role && where.userId === actor && (!where.branchId||where.branchId === 'branch') && where.active && (typeof where.role==='string'?where.role===role:where.role.in.includes(role)) ? { active: true, role } : null },
  } as unknown as Prisma.TransactionClient;
  return { tx, branch };
}
test('owner operates own branch without an artificial cashier assignment', async () => {
  const { tx, branch } = scope('owner');
  for (const permission of ['OPERATE_BRANCH', 'CANCEL_VISIT'] as const)
    assert.equal(await requireBranchAccess(tx, 'owner', 'branch', permission), branch);
});
test('manager and cashier can register visits; only manager can cancel', async () => {
  const manager = scope('manager', 'BRANCH_MANAGER'), cashier = scope('cashier', 'CASHIER');
  await requireBranchAccess(manager.tx, 'manager', 'branch', 'OPERATE_BRANCH');
  await requireBranchAccess(manager.tx, 'manager', 'branch', 'CANCEL_VISIT');
  await requireBranchAccess(cashier.tx, 'cashier', 'branch', 'OPERATE_BRANCH');
  for (const permission of ['CANCEL_VISIT'] as const)
    await assert.rejects(requireBranchAccess(cashier.tx, 'cashier', 'branch', permission), { code: 'BRANCH_ACCESS_DENIED' });
  await assert.rejects(requireBranchAccess(manager.tx, 'manager', 'branch', 'TRANSFER_STOCK'), { code: 'ACCESS_DENIED' });
});
test('global labels never substitute for scoped assignments; inactive tenants fail closed', async () => {
  for (const actor of ['unassigned-manager', 'other-owner', 'admin', 'trainee']) {
    const { tx } = scope(actor);
    await assert.rejects(requireBranchAccess(tx, actor, 'branch', 'OPERATE_BRANCH'), { code: 'BRANCH_ACCESS_DENIED' });
  }
  const inactive = scope('owner', undefined, false);
  await assert.rejects(requireBranchAccess(inactive.tx, 'owner', 'branch', 'OPERATE_BRANCH'), { code: 'ACCESS_DENIED' });
  for (const change of ['branch', 'gym', 'owner', 'invitation']) {
    const {tx, branch} = scope('owner');
    if (change === 'branch') branch.status = 'SUSPENDED';
    if (change === 'gym') branch.gym.status = 'SUSPENDED';
    if (change === 'owner') branch.gym.owner.isActive = false;
    if (change === 'invitation') branch.gym.ownerAcceptedAt = null as unknown as Date;
    await assert.rejects(requireBranchAccess(tx, 'owner', 'branch', 'OPERATE_BRANCH'), { code: 'BRANCH_ACCESS_DENIED' });
  }
});

test('retired sale and stock permissions deny even the actual gym owner',async()=>{const {tx}=scope('owner');for(const p of ['SELL_POINTS','TRANSFER_STOCK'] as const)await assert.rejects(requireBranchAccess(tx,'owner','branch',p),{code:'ACCESS_DENIED'});});
