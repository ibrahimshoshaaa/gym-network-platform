import {authority,requirePermission} from "../auth/delegation.js";
import {allocateWithdrawal} from "./allocation.js";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type WithdrawalRequest,
} from "@prisma/client";
import { z } from "zod";
import { requireAdmin, requireGymOwner } from "../auth/authorization.js";
import { DomainError } from "../domain/errors.js";
import { parse } from "../gyms/validation.js";
import { audit } from "../gyms/service.js";
import { postInTransaction, serializable } from "../ledger/service.js";
import { moneySchema } from "../topups/settings.js";
import { phoneSchema } from "../auth/validation.js";
import { uuid } from "../operations/service.js";
import { calendarSchema, withdrawalDeadline } from "./calendar.js";
type Tx = Prisma.TransactionClient;
const reason = z.string().trim().min(5).max(1000);
const destination = { branchId: z.string().uuid().optional(), destinationName: z.string().trim().min(2).max(150) };
export const requestSchema = z.discriminatedUnion("paymentMethod", [
  z
    .object({
      paymentMethod: z.literal("INSTAPAY"),
      destinationAccount: z.string().trim().min(3).max(150),
      ...destination,
      amountPiasters: moneySchema,
    })
    .strict(),
  z
    .object({
      paymentMethod: z.literal("WALLET"),
      destinationAccount: phoneSchema,
      ...destination,
      amountPiasters: moneySchema,
    })
    .strict(),
]);
export const decisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("APPROVE"),
      reason,
      calendarVersion: z.number().int().positive(),
      destinationVerified: z.literal(true),
    })
    .strict(),
  z.object({ decision: z.literal("REJECT"), reason }).strict(),
]);
export const paymentSchema = z
  .object({
    transferReference: z
      .string()
      .trim()
      .min(3)
      .max(150)
      .transform((s) => s.toUpperCase()),
    proofReceiptId: uuid,
    transferredAmountPiasters: moneySchema,
    fundsTransferred: z.literal(true),
    proofReviewed: z.literal(true),
    reason,
    delayReason: reason.optional(),
  })
  .strict();
export const feedbackSchema = z
  .object({ kind: z.enum(["RECEIVED", "DISPUTE"]), reason })
  .strict();
export const reasonSchema = z.object({ reason }).strict();
const digest = (x: unknown) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
export function withdrawalView(w: WithdrawalRequest) {
  return {
    id: w.id,
    gymId: w.gymId,
    branchId:w.branchId,
    amountPiasters: w.amountPiasters.toString(),
    status: w.status,
    paymentMethod: w.paymentMethod,
    destinationAccount: w.destinationAccount,
    destinationName: w.destinationName,
    requestedAt: w.requestedAt,
    acceptedAt: w.acceptedAt,
    dueAt: w.dueAt,
    paidAt: w.paidAt,
    proofReceiptId: w.proofReceiptId,
    transferReference: w.transferReference,
    reviewReason: w.reviewReason,
    rejectionReason: w.rejectionReason,
    closedAt: w.closedAt,
    delayReason: w.delayReason,
    overdue:
      w.status === "APPROVED" && Boolean(w.dueAt && w.dueAt <= new Date()),
    reserveTransactionId: w.reserveTransactionId,
    releaseTransactionId: w.releaseTransactionId,
    paymentTransactionId: w.paymentTransactionId,
  };
}
export async function publishCalendar(
  db: PrismaClient,
  actorId: string,
  input: unknown,
) {
  const data = parse(calendarSchema, input);
  try {
    return await serializable(db, async (tx) => {
      await requireAdmin(tx, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('withdrawal-calendar',0))`;
      const latest = await tx.withdrawalCalendar.findFirst({
        orderBy: { version: "desc" },
      });
      if ((latest?.version ?? 0) !== data.expectedVersion)
        throw new DomainError("STALE_SETTINGS");
      // Validate that the supplied calendar can produce an actual cutoff now.
      withdrawalDeadline(new Date(), data);
      const { expectedVersion, ...settings } = data;
      const row = await tx.withdrawalCalendar.create({
        data: {
          ...settings,
          workdays: [...data.workdays].sort(),
          holidays: [...data.holidays].sort(),
          version: expectedVersion + 1,
          createdById: actorId,
        },
      });
      await audit(
        tx,
        actorId,
        "WITHDRAWAL_CALENDAR_PUBLISHED",
        row.id,
        "Explicit workweek, holidays, inclusion rule and Cairo cutoff configured",
      );
      return row;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new DomainError("STALE_SETTINGS");
    throw error;
  }
}
async function account(
  tx: Tx,
  gymId: string,
  type: "GYM_AVAILABLE" | "GYM_RESERVED" | "GYM_PAID",
) {
  await tx.$executeRaw`INSERT INTO "MoneyAccount" (id,type,"gymId") VALUES (${randomUUID()}::uuid,${type}::"MoneyAccountType",${gymId}::uuid) ON CONFLICT DO NOTHING`;
  return tx.moneyAccount.findFirstOrThrow({
    where: { gymId, type, branchId: null },
  });
}
async function move(
  tx: Tx,
  actorId: string,
  id: string,
  amount: bigint,
  gymId: string,
  stage: "RESERVE" | "RELEASE" | "PAYMENT",
  reason: string,
) {
  const from = await account(
    tx,
    gymId,
    stage === "RESERVE" ? "GYM_AVAILABLE" : "GYM_RESERVED",
  );
  const to = await account(
    tx,
    gymId,
    stage === "PAYMENT"
      ? "GYM_PAID"
      : stage === "RESERVE"
        ? "GYM_RESERVED"
        : "GYM_AVAILABLE",
  );
  const r = await postInTransaction(tx, {
    actorId,
    idempotencyKey: `withdraw-${stage}:${id}`,
    referenceId: id,
    reason,
    money: {
      kind:
        stage === "RESERVE"
          ? "WITHDRAWAL_RESERVE"
          : stage === "RELEASE"
            ? "WITHDRAWAL_RELEASE"
            : "WITHDRAWAL_PAYMENT",
      entries: [
        { accountId: from.id, delta: -amount },
        { accountId: to.id, delta: amount },
      ],
    },
  });
  return r.moneyTransactionId!;
}
export async function requestWithdrawal(
  db: PrismaClient,
  actorId: string,
  gymId: string,
  key: string,
  input: unknown,
) {
  const data = parse(requestSchema, input);
  parse(uuid, key);
  const idempotencyKey = `withdraw:${actorId}:${key}`,
    requestHash = digest({ gymId, ...data });
  return serializable(db, async (tx) => {
    const gym = data.branchId?(await requirePermission(tx,actorId,gymId,'REQUEST_WITHDRAWAL',data.branchId)).gym:await requireGymOwner(tx, actorId, gymId, false);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
    const old = await tx.withdrawalRequest.findUnique({
      where: { idempotencyKey },
    });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return withdrawalView(old);
    }
    if (gym.status !== "ACTIVE") throw new DomainError("GYM_INACTIVE");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withdrawal-allocation:${gymId}`},0))`;
    const id = randomUUID(), amountPiasters = BigInt(data.amountPiasters);
    const allocations=await allocateWithdrawal(tx,gymId,amountPiasters,data.branchId);
    const reserveTransactionId = await move(
      tx,
      actorId,
      id,
      amountPiasters,
      gymId,
      "RESERVE",
      "Gym owner requested manual withdrawal",
    );
    const row = await tx.withdrawalRequest.create({
      data: {
        id,
        gymId,
        requestorId: actorId,
        branchId:data.branchId,allocationVersion:1,allocations:{create:allocations},
        amountPiasters,
        paymentMethod: data.paymentMethod,
        destinationAccount: data.destinationAccount,
        destinationName: data.destinationName,
        idempotencyKey,
        requestHash,
        reserveTransactionId,
      },
    });
    await audit(
      tx,
      actorId,
      "WITHDRAWAL_REQUESTED",
      id,
      "Amount reserved atomically; no external transfer executed",
    );
    return withdrawalView(row);
  });
}
async function actionTransaction<T>(
  db: PrismaClient,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await serializable(db, run);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target).includes("withdrawalId")
    )
      return serializable(db, run);
    throw error;
  }
}
async function command(
  db: PrismaClient,
  actorId: string,
  id: string,
  key: string,
  kind: string,
  data: { reason: string },
  owner: boolean,
  run: (tx: Tx, row: WithdrawalRequest) => Promise<void>,
) {
  parse(uuid, key);
  const idempotencyKey = `withdrawact:${actorId}:${key}`,
    requestHash = digest({ id, kind, ...data });
  return actionTransaction(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey},0))`;
    await tx.$queryRaw`SELECT id FROM "WithdrawalRequest" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!row) throw new DomainError("NOT_FOUND");
    if (owner){if(row.branchId)await requirePermission(tx,actorId,row.gymId,'REQUEST_WITHDRAWAL',row.branchId);else await requireGymOwner(tx, actorId, row.gymId, false);}
    else await requireAdmin(tx, actorId);
    const old = await tx.withdrawalAction.findUnique({
      where: { idempotencyKey },
    });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return withdrawalView(row);
    }
    await run(tx, row);
    await tx.withdrawalAction.create({
      data: {
        withdrawalId: id,
        actorId,
        kind,
        reason: data.reason,
        idempotencyKey,
        requestHash,
      },
    });
    await audit(tx, actorId, `WITHDRAWAL_${kind}`, id, data.reason);
    return withdrawalView(
      await tx.withdrawalRequest.findUniqueOrThrow({ where: { id } }),
    );
  });
}
export async function cancelWithdrawal(
  db: PrismaClient,
  actorId: string,
  id: string,
  key: string,
  input: unknown,
) {
  const data = parse(reasonSchema, input);
  return command(
    db,
    actorId,
    id,
    key,
    "CANCEL",
    data,
    true,
    async (tx, row) => {
      if (row.status !== "REQUESTED") throw new DomainError("INVALID_STATE");
      const releaseTransactionId = await move(
        tx,
        actorId,
        id,
        row.amountPiasters,
        row.gymId,
        "RELEASE",
        data.reason,
      );
      await tx.withdrawalRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          closedAt: new Date(),
          closedById: actorId,
          rejectionReason: data.reason,
          releaseTransactionId,
        },
      });
    },
  );
}
export async function decideWithdrawal(
  db: PrismaClient,
  actorId: string,
  id: string,
  key: string,
  input: unknown,
) {
  const data = parse(decisionSchema, input);
  return command(
    db,
    actorId,
    id,
    key,
    data.decision,
    data,
    false,
    async (tx, row) => {
      if (data.decision === "REJECT") {
        if (!["REQUESTED", "APPROVED"].includes(row.status))
          throw new DomainError("INVALID_STATE");
        const releaseTransactionId = await move(
          tx,
          actorId,
          id,
          row.amountPiasters,
          row.gymId,
          "RELEASE",
          data.reason,
        );
        await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "REJECTED",
            closedAt: new Date(),
            closedById: actorId,
            rejectionReason: data.reason,
            releaseTransactionId,
          },
        });
      } else {
        if (row.status !== "REQUESTED") throw new DomainError("INVALID_STATE");
        if (
          (await account(tx, row.gymId, "GYM_RESERVED")).balancePiasters <
          row.amountPiasters
        )
          throw new DomainError("INSUFFICIENT_FUNDS");
        const gym = await requireGymOwner(
          tx,
          row.requestorId,
          row.gymId,
          false,
        );
        if (gym.status !== "ACTIVE") throw new DomainError("GYM_INACTIVE");
        const calendar = await tx.withdrawalCalendar.findFirst({
          orderBy: { version: "desc" },
        });
        if (!calendar) throw new DomainError("CALENDAR_NOT_CONFIGURED");
        if (calendar.version !== data.calendarVersion)
          throw new DomainError("STALE_SETTINGS");
        const acceptedAt = new Date(),
          dueAt = withdrawalDeadline(acceptedAt, calendar);
        await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "APPROVED",
            acceptedAt,
            dueAt,
            calendarId: calendar.id,
            reviewedById: actorId,
            reviewReason: data.reason,
          },
        });
      }
    },
  );
}
export async function payWithdrawal(
  db: PrismaClient,
  actorId: string,
  id: string,
  key: string,
  input: unknown,
) {
  const data = parse(paymentSchema, input);
  try {
    return await command(
      db,
      actorId,
      id,
      key,
      "PAY",
      data,
      false,
      async (tx, row) => {
        if (row.status !== "APPROVED") throw new DomainError("INVALID_STATE");
        if (BigInt(data.transferredAmountPiasters) !== row.amountPiasters)
          throw new DomainError("PAYMENT_AMOUNT_MISMATCH");
        if (row.dueAt && row.dueAt <= new Date() && !data.delayReason)
          throw new DomainError("DELAY_REASON_REQUIRED");
        await tx.$queryRaw`SELECT id FROM "ReceiptEvidence" WHERE id=${data.proofReceiptId}::uuid FOR UPDATE`;
        const proof = await tx.receiptEvidence.findUnique({
          where: { id: data.proofReceiptId },
        });
        if (!proof || proof.ownerUserId !== actorId)
          throw new DomainError("RECEIPT_ACCESS_DENIED");
        if (
          (await tx.topupRequest.findUnique({
            where: { receiptId: proof.id },
          })) ||
          (await tx.withdrawalRequest.findUnique({
            where: { proofReceiptId: proof.id },
          }))
        )
          throw new DomainError("RECEIPT_ALREADY_USED");
        if (
          await tx.withdrawalRequest.findUnique({
            where: { transferReference: data.transferReference },
          })
        )
          throw new DomainError("PAYMENT_REFERENCE_USED");
        const paymentTransactionId = await move(
          tx,
          actorId,
          id,
          row.amountPiasters,
          row.gymId,
          "PAYMENT",
          data.reason,
        );
        await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "PAID",
            paidAt: new Date(),
            paidById: actorId,
            proofReceiptId: proof.id,
            transferReference: data.transferReference,
            delayReason: data.delayReason,
            paymentTransactionId,
          },
        });
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (String(error.meta?.target).includes("proofReceiptId"))
        throw new DomainError("RECEIPT_ALREADY_USED");
      if (String(error.meta?.target).includes("transferReference"))
        throw new DomainError("PAYMENT_REFERENCE_USED");
    }
    throw error;
  }
}
export async function feedbackWithdrawal(
  db: PrismaClient,
  actorId: string,
  id: string,
  key: string,
  input: unknown,
) {
  const data = parse(feedbackSchema, input);
  return command(
    db,
    actorId,
    id,
    key,
    data.kind,
    data,
    true,
    async (tx, row) => {
      if (
        row.status !== "PAID" ||
        (await tx.withdrawalFeedback.findUnique({
          where: { withdrawalId: id },
        }))
      )
        throw new DomainError("INVALID_STATE");
      await tx.withdrawalFeedback.create({
        data: { withdrawalId: id, actorId, ...data },
      });
      if (data.kind === "DISPUTE")
        await tx.withdrawalRequest.update({
          where: { id },
          data: { status: "DISPUTED" },
        });
      // A disputed payment is still money already sent. Never debit unrelated
      // available earnings or create a second payout when a complaint is opened.
    },
  );
}
