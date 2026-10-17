import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  Prisma,
  type PrismaClient,
  type PointSale,
  type Visit,
} from "@prisma/client";
import {
  requireActor,
  requireAdmin,
  requireBranchAccess,
  requireGymOwner,
} from "../auth/authorization.js";
import { hashToken } from "../auth/sessions.js";
import { phoneSchema } from "../auth/validation.js";
import { parse } from "../gyms/validation.js";
import { audit } from "../gyms/service.js";
import { postInTransaction, serializable } from "../ledger/service.js";
import { DomainError } from "../domain/errors.js";
import { maxMoney, moneySchema } from "../topups/settings.js";
export const uuid = z.string().uuid();
export const quantity = z.number().int().positive().max(2147483647);
export const saleQuoteSchema = z
  .object({ traineeId: uuid, points: quantity })
  .strict();
export const saleSchema = saleQuoteSchema
  .extend({
    pricingVersion: quantity,
    receivedAmountPiasters: moneySchema,
    fundsReceived: z.literal(true),
  })
  .strict();
export const qrSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export const entrySchema = qrSchema
  .extend({
    pricingVersion: quantity,
    branchPricingVersion: quantity,
    presenceConfirmed: z.literal(true),
  })
  .strict();
type Tx = Prisma.TransactionClient;
const digest = (input: unknown) =>
  createHash("sha256").update(JSON.stringify(input)).digest("hex");
const label = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return [parts[0], ...parts.slice(1).map((p) => `${Array.from(p)[0]}.`)].join(
    " ",
  );
};
export async function readBranch(tx: Tx, actorId: string, branchId: string) {
  const actor = await requireActor(tx, actorId);
  const branch = await tx.branch.findUnique({
    where: { id: branchId },
    include: { gym: true },
  });
  if (!branch) throw new DomainError("BRANCH_ACCESS_DENIED");
  if (
    actor.role !== "PLATFORM_ADMIN" &&
    !(branch.gym.ownerId === actorId && branch.gym.ownerAcceptedAt) &&
    !(await tx.staffAssignment.findFirst({
      where: { userId: actorId, branchId, active: true },
    }))
  )
    throw new DomainError("BRANCH_ACCESS_DENIED");
  return branch;
}
async function trainee(tx: Tx, id: string) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user?.isActive || user.role !== "TRAINEE")
    throw new DomainError("TRAINEE_UNAVAILABLE");
  return user;
}
async function policy(tx: Tx) {
  const p = await tx.pricingPolicy.findFirst({ orderBy: { version: "desc" } });
  if (!p) throw new DomainError("PRICING_NOT_CONFIGURED");
  return p;
}
async function wallet(tx: Tx, id: string, allowEmpty = false) {
  const account = await tx.pointAccount.findUnique({
    where: { type_ownerUserId: { type: "TRAINEE_WALLET", ownerUserId: id } },
  });
  if (!account) throw new DomainError("ACCOUNT_NOT_FOUND");
  if (
    account.expiresAt &&
    account.expiresAt <= new Date() &&
    (account.balance > 0 || !allowEmpty)
  )
    throw new DomainError("WALLET_EXPIRY_REVIEW_REQUIRED");
  if (!allowEmpty && !account.expiresAt)
    throw new DomainError("WALLET_EXPIRY_REVIEW_REQUIRED");
  return account;
}
export function saleView(s: PointSale) {
  return {
    id: s.id,
    branchId: s.branchId,
    traineeId: s.traineeId,
    traineeLabel: s.traineeLabel,
    phoneLast4: s.phoneLast4,
    cashierId: s.cashierId,
    points: s.points,
    chargePiasters: s.chargePiasters.toString(),
    unitPricePiasters: s.unitPricePiasters.toString(),
    pricingVersion: s.pricingVersion,
    pointTransactionId: s.pointTransactionId,
    createdAt: s.createdAt,
  };
}
export function visitView(v: Visit) {
  return {
    id: v.id,
    traineeId: v.traineeId,
    branchId: v.branchId,
    pointsCharged: v.pointsCharged,
    settlementPiasters: v.settlementPiasters.toString(),
    status:
      v.status === "ACTIVE" && v.expiresAt <= new Date() ? "EXPIRED" : v.status,
    startedAt: v.startedAt,
    expiresAt: v.expiresAt,
    branchPricingVersion: v.branchPricingVersion,
  };
}
export function lookupTrainee(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  input: unknown,
) {
  const { phone } = parse(z.object({ phone: phoneSchema }).strict(), input);
  return db.$transaction(async (tx) => {
    await requireBranchAccess(tx, actorId, branchId, "SELL_POINTS");
    const user = await tx.user.findUnique({ where: { phoneE164: phone } });
    if (!user?.isActive || user.role !== "TRAINEE")
      throw new DomainError("TRAINEE_UNAVAILABLE");
    return {
      id: user.id,
      label: label(user.displayName),
      phoneLast4: user.phoneE164.slice(-4),
    };
  });
}
async function saleQuote(
  tx: Tx,
  actorId: string,
  branchId: string,
  input: z.infer<typeof saleQuoteSchema>,
) {
  await requireBranchAccess(tx, actorId, branchId, "SELL_POINTS");
  const user = await trainee(tx, input.traineeId);
  await wallet(tx, user.id, true);
  const p = await policy(tx),
    charge = BigInt(input.points) * p.pointPricePiasters;
  if (charge > maxMoney) throw new DomainError("INVALID_INPUT");
  const stock = await tx.pointAccount.findUnique({
    where: { type_branchId: { type: "BRANCH_INVENTORY", branchId } },
  });
  if (!stock) throw new DomainError("ACCOUNT_NOT_FOUND");
  return { user, p, charge, stock };
}
export function quoteSale(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  input: unknown,
) {
  const data = parse(saleQuoteSchema, input);
  return db.$transaction(async (tx) => {
    const q = await saleQuote(tx, actorId, branchId, data);
    return {
      points: data.points,
      chargePiasters: q.charge.toString(),
      pricingVersion: q.p.version,
      stock: q.stock.balance,
      traineeLabel: label(q.user.displayName),
      phoneLast4: q.user.phoneE164.slice(-4),
    };
  });
}
export function sellPoints(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  key: string,
  input: unknown,
) {
  const data = parse(saleSchema, input);
  parse(uuid, key);
  const idempotencyKey = `sale:${actorId}:${key}`,
    requestHash = digest({ branchId, ...data });
  return serializable(db, async (tx) => {
    await requireBranchAccess(tx, actorId, branchId, "SELL_POINTS");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
    const old = await tx.pointSale.findUnique({ where: { idempotencyKey } });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return saleView(old);
    }
    const q = await saleQuote(tx, actorId, branchId, data);
    if (q.p.version !== data.pricingVersion)
      throw new DomainError("STALE_SETTINGS");
    if (q.charge !== BigInt(data.receivedAmountPiasters))
      throw new DomainError("PAYMENT_AMOUNT_MISMATCH");
    const destination = await wallet(tx, data.traineeId, true),
      id = randomUUID();
    const posted = await postInTransaction(tx, {
      actorId,
      idempotencyKey,
      referenceId: id,
      reason: "Cashier confirmed collection; branch stock sale to trainee",
      points: {
        kind: "TRANSFER",
        entries: [
          { accountId: q.stock.id, delta: -BigInt(data.points) },
          { accountId: destination.id, delta: BigInt(data.points) },
        ],
      },
    });
    await tx.pointAccount.update({
      where: { id: destination.id },
      data: { expiresAt: new Date(Date.now() + 90 * 86400000) },
    });
    const sale = await tx.pointSale.create({
      data: {
        id,
        cashierId: actorId,
        branchId,
        traineeId: data.traineeId,
        traineeLabel: label(q.user.displayName),
        phoneLast4: q.user.phoneE164.slice(-4),
        points: data.points,
        chargePiasters: q.charge,
        unitPricePiasters: q.p.pointPricePiasters,
        policyId: q.p.id,
        pricingVersion: q.p.version,
        idempotencyKey,
        requestHash,
        pointTransactionId: posted.pointTransactionId!,
      },
    });
    await audit(
      tx,
      actorId,
      "CASHIER_POINTS_SOLD",
      id,
      "Cash collected by distributing gym; no platform cash or hosting receivable posted",
    );
    return saleView(sale);
  });
}
export async function issueQr(
  db: PrismaClient,
  actorId: string,
  bearer: string,
) {
  const token = randomBytes(32).toString("base64url");
  return serializable(db, async (tx) => {
    await trainee(tx, actorId);
    const session = await tx.authSession.findUnique({
      where: { tokenHash: hashToken(bearer) },
    });
    if (
      !session ||
      session.userId !== actorId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw new DomainError("UNAUTHENTICATED");
    const expiresAt = new Date(
      Math.min(Date.now() + 60000, session.expiresAt.getTime()),
    );
    const data = {
      tokenHash: hashToken(token),
      sessionId: session.id,
      expiresAt,
      consumedAt: null,
      visitId: null,
    };
    await tx.qrTicket.upsert({
      where: { userId: actorId },
      create: { userId: actorId, ...data },
      update: data,
    });
    return { token, expiresAt, serverTime: new Date() };
  });
}
async function ticket(tx: Tx, token: string, branchId: string) {
  const qr = await tx.qrTicket.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!qr || qr.expiresAt <= new Date()) throw new DomainError("QR_INVALID");
  const session = await tx.authSession.findUnique({
    where: { id: qr.sessionId },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.userId !== qr.userId
  )
    throw new DomainError("QR_INVALID");
  const user = await trainee(tx, qr.userId);
  if (qr.consumedAt) {
    const previous = qr.visitId
      ? await tx.visit.findUnique({ where: { id: qr.visitId } })
      : null;
    if (
      !previous ||
      previous.branchId !== branchId ||
      previous.status !== "ACTIVE" ||
      previous.expiresAt <= new Date()
    )
      throw new DomainError("QR_ALREADY_USED");
  }
  return { qr, user };
}
async function visitQuote(
  tx: Tx,
  actorId: string,
  branchId: string,
  token: string,
) {
  const branch = await requireBranchAccess(
    tx,
    actorId,
    branchId,
    "SELL_POINTS",
  );
  if (!branch.priceApprovedAt || branch.pricingVersion < 1)
    throw new DomainError("BRANCH_NOT_READY");
  const { qr, user } = await ticket(tx, token, branchId),
    p = await policy(tx);
  const active = await tx.visit.findFirst({
    where: {
      traineeId: user.id,
      branchId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
  });
  const account = active ? null : await wallet(tx, user.id);
  const settlement =
    (BigInt(branch.visitPricePoints) *
      p.pointPricePiasters *
      BigInt(p.redemptionBps) +
      9999n) /
    10000n;
  if (settlement <= 0n || settlement > maxMoney)
    throw new DomainError("INVALID_INPUT");
  return { branch, qr, user, p, active, account, settlement };
}
export function previewVisit(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  input: unknown,
) {
  const data = parse(qrSchema, input);
  return db.$transaction(async (tx) => {
    const q = await visitQuote(tx, actorId, branchId, data.token);
    return {
      traineeLabel: label(q.user.displayName),
      phoneLast4: q.user.phoneE164.slice(-4),
      points: q.branch.visitPricePoints,
      balance: q.account?.balance ?? null,
      sessionMinutes: q.branch.sessionMinutes,
      pricingVersion: q.p.version,
      branchPricingVersion: q.branch.pricingVersion,
      alreadyActive: Boolean(q.active),
      visit: q.active ? visitView(q.active) : null,
      qrExpiresAt: q.qr.expiresAt,
    };
  });
}
async function visitAccounts(tx: Tx, gymId: string) {
  await tx.$executeRaw`INSERT INTO "PointAccount" (id,type) VALUES (${randomUUID()}::uuid,'REDEEMED') ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`INSERT INTO "MoneyAccount" (id,type) VALUES (${randomUUID()}::uuid,'PLATFORM_OFFSET') ON CONFLICT DO NOTHING`;
  await tx.$executeRaw`INSERT INTO "MoneyAccount" (id,type,"gymId") VALUES (${randomUUID()}::uuid,'GYM_AVAILABLE',${gymId}::uuid) ON CONFLICT DO NOTHING`;
  return {
    redeemed: await tx.pointAccount.findFirstOrThrow({
      where: { type: "REDEEMED" },
    }),
    offset: await tx.moneyAccount.findFirstOrThrow({
      where: { type: "PLATFORM_OFFSET" },
    }),
    available: await tx.moneyAccount.findFirstOrThrow({
      where: { type: "GYM_AVAILABLE", gymId, branchId: null },
    }),
  };
}
export function confirmVisit(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  key: string,
  input: unknown,
) {
  const data = parse(entrySchema, input);
  parse(uuid, key);
  const idempotencyKey = `entry:${actorId}:${key}`,
    requestHash = digest({ branchId, ...data, token: hashToken(data.token) });
  return serializable(db, async (tx) => {
    await requireBranchAccess(tx, actorId, branchId, "SELL_POINTS");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
    const old = await tx.visitEntry.findUnique({ where: { idempotencyKey } });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return {
        visit: visitView(
          await tx.visit.findUniqueOrThrow({ where: { id: old.visitId } }),
        ),
        alreadyActive: old.alreadyActive,
      };
    }
    let q = await visitQuote(tx, actorId, branchId, data.token);
    await tx.$queryRaw`SELECT "userId" FROM "QrTicket" WHERE "userId"=${q.user.id}::uuid FOR UPDATE`;
    q = await visitQuote(tx, actorId, branchId, data.token);
    let visit = q.active;
    if (!visit) {
      if (
        data.pricingVersion !== q.p.version ||
        data.branchPricingVersion !== q.branch.pricingVersion
      )
        throw new DomainError("STALE_SETTINGS");
      await tx.visit.updateMany({
        where: {
          traineeId: q.user.id,
          branchId,
          status: "ACTIVE",
          expiresAt: { lte: new Date() },
        },
        data: { status: "EXPIRED" },
      });
      const accounts = await visitAccounts(tx, q.branch.gymId),
        id = randomUUID();
      const posted = await postInTransaction(tx, {
        actorId,
        idempotencyKey,
        referenceId: id,
        reason: "Cashier confirmed physical attendance",
        points: {
          kind: "VISIT",
          entries: [
            {
              accountId: q.account!.id,
              delta: -BigInt(q.branch.visitPricePoints),
            },
            {
              accountId: accounts.redeemed.id,
              delta: BigInt(q.branch.visitPricePoints),
            },
          ],
        },
        money: {
          kind: "VISIT_SETTLEMENT",
          entries: [
            { accountId: accounts.offset.id, delta: -q.settlement },
            { accountId: accounts.available.id, delta: q.settlement },
          ],
        },
      });
      const startedAt = new Date();
      visit = await tx.visit.create({
        data: {
          id,
          traineeId: q.user.id,
          branchId,
          cashierId: actorId,
          pointsCharged: q.branch.visitPricePoints,
          settlementPiasters: q.settlement,
          policyId: q.p.id,
          unitPricePiasters: q.p.pointPricePiasters,
          redemptionBps: q.p.redemptionBps,
          branchPricingVersion: q.branch.pricingVersion,
          startedAt,
          expiresAt: new Date(
            startedAt.getTime() + q.branch.sessionMinutes * 60000,
          ),
          pointTransactionId: posted.pointTransactionId!,
          moneyTransactionId: posted.moneyTransactionId!,
        },
      });
      await audit(
        tx,
        actorId,
        "VISIT_CONFIRMED",
        id,
        "Points consumed and receivable credited to hosting gym atomically",
      );
    }
    await tx.qrTicket.update({
      where: { userId: q.user.id },
      data: { consumedAt: new Date(), visitId: visit.id },
    });
    await tx.visitEntry.create({
      data: {
        actorId,
        branchId,
        visitId: visit.id,
        alreadyActive: Boolean(q.active),
        idempotencyKey,
        requestHash,
      },
    });
    return { visit: visitView(visit), alreadyActive: Boolean(q.active) };
  });
}
