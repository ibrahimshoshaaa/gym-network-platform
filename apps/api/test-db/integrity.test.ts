import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { postLedger, reverseLedger, transferStock, type LedgerCommand } from '../src/ledger/service.js';
import { requireBranchAccess } from '../src/auth/authorization.js';
import { createSession, hashToken } from '../src/auth/sessions.js';
import { buildApp } from '../src/app.js';

// This suite never resets a database. Still refuse any non-local/non-test URL.
const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/(gym_ci|gym_test)$/.test(url.pathname)) {
  throw new Error('Integration suite requires a disposable local gym_ci or gym_test database');
}
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
let phone = Math.floor(Date.now() / 1000) * 1000;

async function fixture() {
  const user = (role: 'PLATFORM_ADMIN' | 'GYM_OWNER' | 'CASHIER' | 'TRAINEE' | 'BRANCH_MANAGER') => db.user.create({ data: {
    displayName: 'Synthetic integration user', phoneE164: `+20${++phone}`, role,
  } });
  const admin = await user('PLATFORM_ADMIN');
  const owner = await user('GYM_OWNER');
  const outsider = await user('GYM_OWNER');
  const cashier = await user('CASHIER');
  const manager = await user('BRANCH_MANAGER');
  const trainee = await user('TRAINEE');
  const gym = await db.gym.create({ data: { ownerId: owner.id, name: 'Synthetic Gym', status: 'ACTIVE', ownerAcceptedAt: new Date() } });
  const otherGym = await db.gym.create({ data: { ownerId: outsider.id, name: 'Other Gym', status: 'ACTIVE', ownerAcceptedAt: new Date() } });
  const branch = (gymId: string) => db.branch.create({ data: { gymId, name: 'Synthetic Branch', status: 'ACTIVE', visitPricePoints: 25, sessionMinutes: 120 } });
  const a = await branch(gym.id), b = await branch(gym.id), foreign = await branch(otherGym.id);
  await db.staffAssignment.createMany({ data: [
    { userId: cashier.id, branchId: a.id, role: 'CASHIER' },
    { userId: manager.id, branchId: a.id, role: 'BRANCH_MANAGER' },
  ] });
  const issuance = await db.pointAccount.findFirst({ where: { type: 'ISSUANCE' } }) ?? await db.pointAccount.create({ data: { type: 'ISSUANCE' } });
  const stockA = await db.pointAccount.create({ data: { type: 'BRANCH_INVENTORY', branchId: a.id } });
  const stockB = await db.pointAccount.create({ data: { type: 'BRANCH_INVENTORY', branchId: b.id } });
  const wallet = await db.pointAccount.create({ data: { type: 'TRAINEE_WALLET', ownerUserId: trainee.id } });
  const offset = await db.moneyAccount.findFirst({ where: { type: 'PLATFORM_OFFSET' } }) ?? await db.moneyAccount.create({ data: { type: 'PLATFORM_OFFSET' } });
  const money = await db.moneyAccount.create({ data: { type: 'GYM_AVAILABLE', gymId: gym.id } });
  const command = (amount = 50): LedgerCommand => ({ actorId: admin.id, idempotencyKey: randomUUID(), reason: 'Synthetic funding',
    points: { kind: 'ISSUE', entries: [{ accountId: issuance.id, delta: -BigInt(amount) }, { accountId: stockA.id, delta: BigInt(amount) }] },
  });
  return { admin, owner, outsider, cashier, manager, trainee, gym, otherGym, a, b, foreign, issuance, stockA, stockB, wallet, offset, money, command };
}

test('committed ledgers balance, cached balances reconcile, and issuance offset may be negative', async () => {
  const f = await fixture();
  await postLedger(db, f.command());
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 50);
  assert.ok((await db.pointAccount.findUniqueOrThrow({ where: { id: f.issuance.id } })).balance < 0);
  const drift = await db.$queryRaw<unknown[]>`SELECT a.id FROM "PointAccount" a LEFT JOIN "PointPosting" p ON p."accountId" = a.id GROUP BY a.id HAVING a.balance <> COALESCE(sum(p.delta),0)`;
  assert.equal(drift.length, 0);
});

test('ten simultaneous retries create one transaction and audit entry', async () => {
  const f = await fixture(); const cmd = f.command();
  const results = await Promise.all(Array.from({ length: 10 }, () => postLedger(db, cmd)));
  assert.equal(new Set(results.map(r => r.pointTransactionId)).size, 1);
  assert.equal(await db.auditLog.count({ where: { entityId: results[0]!.pointTransactionId } }), 1);
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 50);
});

test('a retry with reordered postings returns original result; changed payload/actor conflicts', async () => {
  const f = await fixture(); const cmd = f.command();
  const first = await postLedger(db, cmd);
  assert.deepEqual(await postLedger(db, { ...cmd, points: { ...cmd.points!, entries: [...cmd.points!.entries].reverse() } }), first);
  await assert.rejects(postLedger(db, { ...cmd, reason: 'Different purpose' }), /IDEMPOTENCY_CONFLICT/);
  const admin2 = await db.user.create({ data: { role: 'PLATFORM_ADMIN', displayName: 'Second admin', phoneE164: `+20${++phone}` } });
  await assert.rejects(postLedger(db, { ...cmd, actorId: admin2.id }), /IDEMPOTENCY_CONFLICT/);
});

test('two concurrent transfers of 40 from 50 succeed once and never overdraw', async () => {
  const f = await fixture(); await postLedger(db, f.command());
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => transferStock(db, {
    actorId: f.owner.id, fromBranchId: f.a.id, toBranchId: f.b.id, points: 40, idempotencyKey: randomUUID(),
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 10);
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockB.id } })).balance, 40);
});

test('owner transfer replay is stable; manager, cashier and foreign owner cannot transfer', async () => {
  const f = await fixture(); await postLedger(db, f.command());
  const cmd = { actorId: f.owner.id, fromBranchId: f.a.id, toBranchId: f.b.id, points: 10, idempotencyKey: randomUUID() };
  assert.deepEqual(await transferStock(db, cmd), await transferStock(db, cmd));
  for (const actor of [f.cashier, f.manager, f.outsider]) await assert.rejects(transferStock(db, { ...cmd, actorId: actor.id, idempotencyKey: randomUUID() }), /BRANCH_ACCESS_DENIED/);
  await assert.rejects(transferStock(db, { ...cmd, toBranchId: f.foreign.id, idempotencyKey: randomUUID() }), /BRANCH_ACCESS_DENIED/);
});

test('same owner cannot transfer between different gyms they own', async () => {
  const f = await fixture(); await postLedger(db, f.command());
  await db.gym.update({ where: { id: f.otherGym.id }, data: { ownerId: f.owner.id } });
  await assert.rejects(transferStock(db, { actorId: f.owner.id, fromBranchId: f.a.id, toBranchId: f.foreign.id, points: 1, idempotencyKey: randomUUID() }), /BRANCH_ACCESS_DENIED/);
});

test('cashier/manager permission requires an active assignment in the exact branch', async () => {
  const f = await fixture();
  await db.$transaction(tx => requireBranchAccess(tx, f.cashier.id, f.a.id, 'SELL_POINTS'));
  await assert.rejects(db.$transaction(tx => requireBranchAccess(tx, f.cashier.id, f.b.id, 'SELL_POINTS')), /BRANCH_ACCESS_DENIED/);
  await db.$transaction(tx => requireBranchAccess(tx, f.owner.id, f.a.id, 'SELL_POINTS'));
  await assert.rejects(db.$transaction(tx => requireBranchAccess(tx, f.owner.id, f.foreign.id, 'SELL_POINTS')), /BRANCH_ACCESS_DENIED/);
  await db.staffAssignment.updateMany({ where: { userId: f.cashier.id }, data: { active: false } });
  await assert.rejects(db.$transaction(tx => requireBranchAccess(tx, f.cashier.id, f.a.id, 'SELL_POINTS')), /BRANCH_ACCESS_DENIED/);
  await db.user.update({ where: { id: f.owner.id }, data: { isActive: false } });
  await assert.rejects(transferStock(db, { actorId: f.owner.id, fromBranchId: f.a.id, toBranchId: f.b.id, points: 1, idempotencyKey: randomUUID() }), /ACCESS_DENIED/);
});

test('non-admin cannot call the generic financial primitive', async () => {
  const f = await fixture();
  await assert.rejects(postLedger(db, { ...f.command(), actorId: f.cashier.id }), /ACCESS_DENIED/);
});

test('a failing money leg rolls back the points, headers and audit atomically', async () => {
  const f = await fixture(); const cmd = f.command();
  cmd.money = { kind: 'ADJUSTMENT', entries: [{ accountId: f.money.id, delta: -1n }, { accountId: f.offset.id, delta: 1n }] };
  await assert.rejects(postLedger(db, cmd), /INSUFFICIENT_FUNDS/);
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 0);
  assert.equal(await db.pointTransaction.count({ where: { idempotencyKey: cmd.idempotencyKey } }), 0);
  assert.equal(await db.moneyTransaction.count({ where: { idempotencyKey: cmd.idempotencyKey } }), 0);
});

test('money remains exact beyond JavaScript safe integers and reconciles', async () => {
  const f = await fixture(); const amount = 9007199254740993n;
  const result = await postLedger(db, { actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Synthetic precision test',
    money: { kind: 'ADJUSTMENT', entries: [{ accountId: f.offset.id, delta: -amount }, { accountId: f.money.id, delta: amount }] } });
  assert.equal((await db.moneyAccount.findUniqueOrThrow({ where: { id: f.money.id } })).balancePiasters, amount);
  const sum = (await db.moneyPosting.findMany({ where: { transactionId: result.moneyTransactionId } })).reduce((s, e) => s + e.deltaPiasters, 0n);
  assert.equal(sum, 0n);
});

test('a late money FK failure rolls back already-written point postings and balances', async () => {
  const f = await fixture(); const cmd = f.command();
  cmd.money = { kind: 'ADJUSTMENT', reversalOfId: randomUUID(), entries: [
    { accountId: f.offset.id, delta: -100n }, { accountId: f.money.id, delta: 100n },
  ] };
  await assert.rejects(postLedger(db, cmd));
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 0);
  assert.equal(await db.pointTransaction.count({ where: { idempotencyKey: cmd.idempotencyKey } }), 0);
  assert.equal(await db.moneyTransaction.count({ where: { idempotencyKey: cmd.idempotencyKey } }), 0);
});

test('money races cannot overdraw and cached piasters reconcile with immutable postings', async () => {
  const f = await fixture();
  const reserved = await db.moneyAccount.create({ data: { type: 'GYM_RESERVED', gymId: f.gym.id } });
  await postLedger(db, { actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Synthetic receivable',
    money: { kind: 'ADJUSTMENT', entries: [{ accountId: f.offset.id, delta: -5000n }, { accountId: f.money.id, delta: 5000n }] } });
  const results = await Promise.allSettled(Array.from({ length: 2 }, () => postLedger(db, {
    actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Synthetic reserve race',
    money: { kind: 'WITHDRAWAL_RESERVE', entries: [{ accountId: f.money.id, delta: -4000n }, { accountId: reserved.id, delta: 4000n }] },
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await db.moneyAccount.findUniqueOrThrow({ where: { id: f.money.id } })).balancePiasters, 1000n);
  assert.equal((await db.moneyAccount.findUniqueOrThrow({ where: { id: reserved.id } })).balancePiasters, 4000n);
  await assert.rejects(db.moneyAccount.update({ where: { id: f.money.id }, data: { balancePiasters: 1001n } }));
  await assert.rejects(db.moneyPosting.deleteMany({ where: { accountId: reserved.id } }));
  const drift = await db.$queryRaw<unknown[]>`SELECT a.id FROM "MoneyAccount" a LEFT JOIN "MoneyPosting" p ON p."accountId" = a.id GROUP BY a.id HAVING a."balancePiasters" <> COALESCE(sum(p."deltaPiasters"),0)`;
  assert.equal(drift.length, 0);
});

test('exact reversal preserves original records, is replayable and cannot be applied twice', async () => {
  const f = await fixture(); const result = await postLedger(db, f.command());
  const input = { actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Synthetic funding reversal', pointTransactionId: result.pointTransactionId };
  const reversal = await reverseLedger(db, input);
  assert.deepEqual(await reverseLedger(db, input), reversal);
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 0);
  assert.equal(await db.pointPosting.count({ where: { transactionId: result.pointTransactionId } }), 2);
  await assert.rejects(reverseLedger(db, { ...input, idempotencyKey: randomUUID() }));
});

test('cannot reverse half of a point/money bundle', async () => {
  const f = await fixture(); const cmd = f.command();
  cmd.money = { kind: 'ADJUSTMENT', entries: [{ accountId: f.offset.id, delta: -100n }, { accountId: f.money.id, delta: 100n }] };
  const result = await postLedger(db, cmd);
  await assert.rejects(reverseLedger(db, { actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Partial bundle', pointTransactionId: result.pointTransactionId }), /INCOMPLETE_REVERSAL/);
  await reverseLedger(db, { ...result, actorId: f.admin.id, idempotencyKey: randomUUID(), reason: 'Full bundle' });
  assert.equal((await db.moneyAccount.findUniqueOrThrow({ where: { id: f.money.id } })).balancePiasters, 0n);
});

test('invalid amounts, unbalanced, duplicate accounts, and missing accounts fail without postings', async () => {
  const f = await fixture();
  for (const points of [0, -1, 0.1, Infinity, 2147483648]) {
    assert.throws(() => transferStock(db, { actorId: f.owner.id, fromBranchId: f.a.id, toBranchId: f.b.id, points, idempotencyKey: randomUUID() }), /INVALID_TRANSFER/);
  }
  const cmd = f.command(); cmd.points!.entries[0]!.delta = -49n;
  await assert.rejects(postLedger(db, cmd), /INVALID_POSTINGS/);
  await assert.rejects(postLedger(db, { ...f.command(), points: { kind: 'TRANSFER', entries: [{ accountId: f.stockA.id, delta: -1n }, { accountId: f.stockA.id, delta: 1n }] } }), /INVALID_POSTINGS/);
  const missing = f.command(); missing.points!.entries[1]!.accountId = randomUUID();
  await assert.rejects(postLedger(db, missing), /ACCOUNT_NOT_FOUND/);
});

test('database rejects invalid ownership, duplicate wallets and cross-gym money scope', async () => {
  const f = await fixture();
  await assert.rejects(db.pointAccount.create({ data: { type: 'TRAINEE_WALLET' } }));
  await assert.rejects(db.pointAccount.create({ data: { type: 'TRAINEE_WALLET', ownerUserId: f.trainee.id } }));
  await assert.rejects(db.pointAccount.create({ data: { type: 'BRANCH_INVENTORY', branchId: f.a.id, ownerUserId: f.trainee.id } }));
  await assert.rejects(db.pointAccount.create({ data: { type: 'BRANCH_INVENTORY', branchId: f.foreign.id, expiresAt: new Date() } }));
  await assert.rejects(db.moneyAccount.create({ data: { type: 'GYM_AVAILABLE', gymId: f.gym.id, branchId: f.foreign.id } }));
  await assert.rejects(db.staffAssignment.create({ data: { userId: f.cashier.id, branchId: f.b.id, role: 'PLATFORM_ADMIN' } }));
});

test('database blocks negative/unsupported balances, identity edits, ledger edits and late postings', async () => {
  const f = await fixture(); const r = await postLedger(db, f.command());
  await assert.rejects(db.pointAccount.update({ where: { id: f.stockA.id }, data: { balance: -1 } }));
  await assert.rejects(db.pointAccount.update({ where: { id: f.stockA.id }, data: { balance: 999 } }));
  await assert.rejects(db.pointAccount.create({ data: { type: 'TRAINEE_WALLET', ownerUserId: f.admin.id, balance: 100 } }));
  await assert.rejects(db.pointAccount.update({ where: { id: f.wallet.id }, data: { ownerUserId: f.admin.id } }));
  await assert.rejects(db.pointTransaction.update({ where: { id: r.pointTransactionId }, data: { reason: 'Tamper' } }));
  await assert.rejects(db.pointPosting.deleteMany({ where: { transactionId: r.pointTransactionId } }));
  await assert.rejects(db.pointPosting.create({ data: { transactionId: r.pointTransactionId!, accountId: f.stockB.id, delta: 1 } }));
  await assert.rejects(db.auditLog.deleteMany({ where: { entityId: r.pointTransactionId } }));
});

test('unsealed or unbalanced raw SQL transactions cannot commit; trigger changes roll back', async () => {
  const f = await fixture();
  await assert.rejects(db.pointTransaction.create({ data: { actorId: f.admin.id, idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64), reason: 'Unsealed', kind: 'ISSUE' } }));
  await assert.rejects(db.$transaction(async tx => {
    const t = await tx.pointTransaction.create({ data: { actorId: f.admin.id, idempotencyKey: randomUUID(), requestHash: 'a'.repeat(64), reason: 'Unbalanced', kind: 'ISSUE' } });
    await tx.pointPosting.create({ data: { transactionId: t.id, accountId: f.issuance.id, delta: -100 } });
    await tx.pointPosting.create({ data: { transactionId: t.id, accountId: f.stockA.id, delta: 50 } });
    await tx.pointTransaction.update({ where: { id: t.id }, data: { posted: true } });
  }));
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.stockA.id } })).balance, 0);
});

test('sessions store only hashes; invalid, expired, logged-out and disabled sessions fail', async () => {
  const f = await fixture(); const app = buildApp(db);
  try {
    const token = await createSession(db, f.trainee.id, new Date(Date.now() + 60000));
    const session = await db.authSession.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    assert.notEqual(session.tokenHash, token);
    const request = () => app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
    assert.equal((await request()).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${f.admin.id}` } })).statusCode, 401);
    await db.user.update({ where: { id: f.trainee.id }, data: { isActive: false } });
    assert.equal((await request()).statusCode, 401);
    await db.user.update({ where: { id: f.trainee.id }, data: { isActive: true } });
    await db.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await request()).statusCode, 401);
    await db.authSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 60000) } });
    assert.equal((await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } })).statusCode, 204);
    assert.equal((await request()).statusCode, 401);
  } finally { await app.close(); }
});

