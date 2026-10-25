import {authority,requirePermission} from '../auth/delegation.js';
import { createHash, randomUUID } from 'node:crypto';
import {collectDueCharges} from '../charges/service.js';
import { Prisma, type PrismaClient, type PointTxKind, type MoneyTxKind } from '@prisma/client';
import { requireAdmin, requireBranchAccess, requireGymOwner } from '../auth/authorization.js';
import { DomainError } from '../domain/errors.js';

type Entry = { accountId: string; delta: bigint };
type Leg<K> = { kind: K; entries: Entry[]; reversalOfId?: string };
export type LedgerCommand = {
  actorId: string; idempotencyKey: string; reason: string; referenceId?: string;
  points?: Leg<PointTxKind>; money?: Leg<MoneyTxKind>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxInt = 2147483647n;
const maxBigInt = 9223372036854775807n;

// Flush after domain rows (visits, holds and allocations) have been saved, so
// branch attribution sees the same completed operation as the money ledger.
const chargeQueue = new WeakMap<Prisma.TransactionClient, Map<string,string|undefined>>();
export function queueChargeCollection(tx:Prisma.TransactionClient,gymId:string,actorId?:string){
  let gyms=chargeQueue.get(tx);
  if(!gyms){gyms=new Map();chargeQueue.set(tx,gyms);}
  gyms.set(gymId,actorId??gyms.get(gymId));
}

function normalize<K>(leg: Leg<K> | undefined, max: bigint): Leg<K> | undefined {
  if (!leg) return;
  if (leg.entries.length < 2 || leg.entries.length > 100) throw new DomainError('INVALID_POSTINGS');
  const entries = leg.entries.map(e => ({ accountId: e.accountId.toLowerCase(), delta: e.delta }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  if (new Set(entries.map(e => e.accountId)).size !== entries.length ||
      entries.some(e => !uuid.test(e.accountId) || typeof e.delta !== 'bigint' || e.delta === 0n || e.delta > max || e.delta < -max) ||
      entries.reduce((sum, e) => sum + e.delta, 0n) !== 0n) throw new DomainError('INVALID_POSTINGS');
  return { kind: leg.kind, entries, ...(leg.reversalOfId ? { reversalOfId: leg.reversalOfId.toLowerCase() } : {}) };
}

function prepare(command: LedgerCommand) {
  if (!uuid.test(command.actorId) || !command.idempotencyKey.trim() || command.idempotencyKey.length > 128 ||
      !command.reason.trim() || command.reason.length > 1000 || (!command.points && !command.money) ||
      (command.referenceId && !uuid.test(command.referenceId))) throw new DomainError('INVALID_COMMAND');
  const normalized = { ...command, actorId: command.actorId.toLowerCase(),
    points: normalize(command.points, maxInt), money: normalize(command.money, maxBigInt) };
  // Explicit field order and canonical posting order make retries insensitive
  // to JSON object ordering. Actor, both legs and reason are bound to the key.
  const requestHash = createHash('sha256').update(JSON.stringify({
    actorId: normalized.actorId, reason: normalized.reason, referenceId: normalized.referenceId,
    points: normalized.points, money: normalized.money,
  }, (_, value) => typeof value === 'bigint' ? value.toString() : value)).digest('hex');
  return { command: normalized, requestHash };
}

export async function serializable<T>(db: PrismaClient, run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(async tx=>{
      try {
        const result=await run(tx);
        const gyms=chargeQueue.get(tx);
        for(const gymId of [...(gyms?.keys()??[])].sort()){
          const actor=gyms!.get(gymId)??(await tx.gym.findUniqueOrThrow({where:{id:gymId},select:{ownerId:true}})).ownerId;
          await collectDueCharges(tx,gymId,actor,randomUUID());
        }
        return result;
      } finally {chargeQueue.delete(tx);}
    }, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error) {
      // A waiting serializable transaction can retain a snapshot from before
      // another request inserted its unique key. Retry that unique-key race
      // too; the next snapshot either replays or reports a payload conflict.
      const keyRace = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' &&
        String(error.meta?.target).includes('idempotencyKey');
      const rawConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2010' &&
        ['40001', '40P01'].includes(String(error.meta?.code));
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || keyRace || rawConflict) && attempt < 8) continue;
      throw error;
    }
  }
}

// Caller must be an authorized domain service within the same transaction.
export async function postInTransaction(tx: Prisma.TransactionClient, input: LedgerCommand) {
  const { command: c, requestHash } = prepare(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${c.idempotencyKey}, 0))`;
  const [oldPoints, oldMoney] = await Promise.all([
    tx.pointTransaction.findUnique({ where: { idempotencyKey: c.idempotencyKey } }),
    tx.moneyTransaction.findUnique({ where: { idempotencyKey: c.idempotencyKey } }),
  ]);
  if (oldPoints || oldMoney) {
    if (Boolean(oldPoints) !== Boolean(c.points) || Boolean(oldMoney) !== Boolean(c.money) ||
        (oldPoints && (oldPoints.requestHash !== requestHash || !oldPoints.posted)) ||
        (oldMoney && (oldMoney.requestHash !== requestHash || !oldMoney.posted))) throw new DomainError('IDEMPOTENCY_CONFLICT');
    return { pointTransactionId: oldPoints?.id, moneyTransactionId: oldMoney?.id };
  }
  // Lock all affected accounts in a deterministic order before any balance
  // checks or posting. Database triggers apply the balance change exactly once.
  for (const e of c.points?.entries ?? []) {
    const rows = await tx.$queryRaw<{ balance: number; type: string }[]>`SELECT balance, type FROM "PointAccount" WHERE id = ${e.accountId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new DomainError('ACCOUNT_NOT_FOUND');
    if (row.type === 'ARCHIVED') throw new DomainError('ACCESS_DENIED');
    if (row.type !== 'ISSUANCE' && BigInt(row.balance) + e.delta < 0n) throw new DomainError('INSUFFICIENT_POINTS');
  }
  for (const e of c.money?.entries ?? []) {
    const rows = await tx.$queryRaw<{ balancePiasters: bigint; type: string }[]>`SELECT "balancePiasters", type FROM "MoneyAccount" WHERE id = ${e.accountId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new DomainError('ACCOUNT_NOT_FOUND');
    if (row.type !== 'PLATFORM_OFFSET' && row.balancePiasters + e.delta < 0n) throw new DomainError('INSUFFICIENT_FUNDS');
  }
  let pointTransactionId: string | undefined;
  let moneyTransactionId: string | undefined;
  if (c.points) {
    const t = await tx.pointTransaction.create({ data: {
      idempotencyKey: c.idempotencyKey, requestHash, kind: c.points.kind,
      actorId: c.actorId, referenceId: c.referenceId, reason: c.reason, reversalOfId: c.points.reversalOfId,
    } });
    for (const e of c.points.entries) await tx.pointPosting.create({ data: { transactionId: t.id, accountId: e.accountId, delta: Number(e.delta) } });
    await tx.pointTransaction.update({ where: { id: t.id }, data: { posted: true } });
    pointTransactionId = t.id;
  }
  if (c.money) {
    const t = await tx.moneyTransaction.create({ data: {
      idempotencyKey: c.idempotencyKey, requestHash, kind: c.money.kind,
      actorId: c.actorId, referenceId: c.referenceId, reason: c.reason, reversalOfId: c.money.reversalOfId,
    } });
    for (const e of c.money.entries) await tx.moneyPosting.create({ data: { transactionId: t.id, accountId: e.accountId, deltaPiasters: e.delta } });
    await tx.moneyTransaction.update({ where: { id: t.id }, data: { posted: true } });
    moneyTransactionId = t.id;
  }
  await tx.auditLog.create({ data: { actorId: c.actorId, action: 'LEDGER_POSTED', entityId: pointTransactionId ?? moneyTransactionId!, reason: c.reason } });
  if(c.money){
    const credits=await tx.moneyAccount.findMany({where:{id:{in:c.money.entries.filter(e=>e.delta>0n).map(e=>e.accountId)},type:'GYM_AVAILABLE',branchId:null},select:{gymId:true}});
    for(const account of credits)if(account.gymId)queueChargeCollection(tx,account.gymId,c.actorId);
  }
  return { pointTransactionId, moneyTransactionId };
}

// Privileged internal primitive; there is deliberately no HTTP posting route.
export function postLedger(db: PrismaClient, command: LedgerCommand) {
  return serializable(db, async tx => { await requireAdmin(tx, command.actorId); return postInTransaction(tx, command); });
}


// Exact financial reversal is an admin-only primitive, not the cancellation
// policy for visits/sales. Domain approval and paid-out settlement come later.
export function reverseLedger(db: PrismaClient, input: {
  actorId: string; idempotencyKey: string; reason: string; pointTransactionId?: string; moneyTransactionId?: string;
}) {
  return serializable(db, async tx => {
    await requireAdmin(tx, input.actorId);
    const p = input.pointTransactionId ? await tx.pointTransaction.findUnique({ where: { id: input.pointTransactionId }, include: { postings: true } }) : null;
    const m = input.moneyTransactionId ? await tx.moneyTransaction.findUnique({ where: { id: input.moneyTransactionId }, include: { postings: true } }) : null;
    if ((!p && !m) || (input.pointTransactionId && !p?.posted) || (input.moneyTransactionId && !m?.posted)) throw new DomainError('TRANSACTION_NOT_FOUND');
    if(m&&await tx.gymChargeCollection.findUnique({where:{moneyTransactionId:m.id}}))throw new DomainError('DOMAIN_APPROVAL_REQUIRED');
    if(m&&await tx.gymChargeCollectionReversal.findUnique({where:{moneyTransactionId:m.id}}))throw new DomainError('DOMAIN_APPROVAL_REQUIRED');
    // A bundle must be reversed together; mixing unrelated money and points
    // transactions, or reversing only half a bundle, is rejected.
    const key = p?.idempotencyKey ?? m!.idempotencyKey;
    if ((p && m && p.idempotencyKey !== m.idempotencyKey) ||
        (!m && await tx.moneyTransaction.findUnique({ where: { idempotencyKey: key } })) ||
        (!p && await tx.pointTransaction.findUnique({ where: { idempotencyKey: key } }))) throw new DomainError('INCOMPLETE_REVERSAL');
    // Visit/sale policy approvals have not been implemented; the low-level
    // reversal primitive cannot bypass those pending workflows.
    if (p && await tx.pointDispatch.findUnique({ where: { pointTransactionId: p.id } })) throw new DomainError('DOMAIN_APPROVAL_REQUIRED');
    if (p && await tx.topupRequest.findUnique({ where: { pointTransactionId: p.id } })) throw new DomainError('DOMAIN_APPROVAL_REQUIRED');
    if (p && ['VISIT', 'VISIT_REVERSAL', 'HISTORICAL_REVERSAL', 'EXPIRY', 'BOOKING_RESERVE', 'BOOKING_SETTLE'].includes(p.kind) ||
        m && m.kind !== 'ADJUSTMENT') throw new DomainError('DOMAIN_APPROVAL_REQUIRED');
    return postInTransaction(tx, { actorId: input.actorId, idempotencyKey: input.idempotencyKey, reason: input.reason,
      points: p ? { kind: 'ADJUSTMENT', reversalOfId: p.id, entries: p.postings.map(e => ({ accountId: e.accountId, delta: -BigInt(e.delta) })) } : undefined,
      money: m ? { kind: 'ADJUSTMENT', reversalOfId: m.id, entries: m.postings.map(e => ({ accountId: e.accountId, delta: -e.deltaPiasters })) } : undefined,
    });
  });
}

