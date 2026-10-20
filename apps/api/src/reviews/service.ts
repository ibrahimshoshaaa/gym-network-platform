import {authority} from "../auth/delegation.js";
import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type OperationReview,
} from "@prisma/client";
import { z } from "zod";
import {
  requireActor,
  requireAdmin,
  requireBranchAccess,
} from "../auth/authorization.js";
import { DomainError } from "../domain/errors.js";
import { audit } from "../gyms/service.js";
import { parse } from "../gyms/validation.js";
import { postInTransaction, serializable } from "../ledger/service.js";
import { uuid, visitView } from "../operations/service.js";
type Tx = Prisma.TransactionClient;
const reason = z.string().trim().min(5).max(1000);
export const cancellationSchema = z.object({ reason }).strict();
export const requestSchema = z
  .object({
    kind: z.enum(["VISIT_CANCEL", "SALE_CORRECTION"]),
    targetId: uuid,
    reason,
    evidenceText: z.string().trim().min(10).max(2000),
    evidenceId: uuid.optional(),
  })
  .strict();
export const reviewSchema = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), reason })
  .strict();
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function reviewView(r: OperationReview) {
  return {
    id: r.id,
    kind: r.kind,
    targetId: r.visitId ?? r.saleId!,
    branchId: r.branchId,
    reason: r.reason,
    evidenceText: r.evidenceText,
    evidenceId: r.evidenceId,
    status: r.status,
    reviewReason: r.reviewReason,
    reviewedAt: r.reviewedAt,
    createdAt: r.createdAt,
  };
}
async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}
async function visit(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Visit" WHERE id=${id}::uuid FOR UPDATE`;
  const v = await tx.visit.findUnique({ where: { id } });
  if (!v) throw new DomainError("NOT_FOUND");
  return v;
}
async function reverseVisit(
  tx: Tx,
  actorId: string,
  visitId: string,
  key: string,
  requestHash: string,
  reason: string,
  reviewId?: string,
) {
  const v = await visit(tx, visitId);
  if (v.status === "CANCELLED")
    throw new DomainError("VISIT_ALREADY_CANCELLED");
  const originalPoints = await tx.pointTransaction.findUniqueOrThrow({
    where: { id: v.pointTransactionId },
    include: {
      reversedBy: { select: { id: true } },
      postings: { include: { account: true } },
    },
  });
  const originalMoney = await tx.moneyTransaction.findUniqueOrThrow({
    where: { id: v.moneyTransactionId },
    include: {
      reversedBy: { select: { id: true } },
      postings: { include: { account: true } },
    },
  });
  const wallet = originalPoints.postings.find(
    (p) => p.account.type === "TRAINEE_WALLET",
  );
  const available = originalMoney.postings.find(
    (p) => p.account.type === "GYM_AVAILABLE",
  );
  const redeemed = originalPoints.postings.find(
    (p) => p.account.type === "REDEEMED",
  );
  const offset = originalMoney.postings.find(
    (p) => p.account.type === "PLATFORM_OFFSET",
  );
  const host = await tx.branch.findUniqueOrThrow({ where: { id: v.branchId } });
  if (
    originalPoints.postings.length !== 2 ||
    originalMoney.postings.length !== 2 ||
    originalPoints.reversedBy ||
    originalMoney.reversedBy ||
    wallet?.delta !== -v.pointsCharged ||
    redeemed?.delta !== v.pointsCharged ||
    available?.deltaPiasters !== v.settlementPiasters ||
    offset?.deltaPiasters !== -v.settlementPiasters ||
    available?.account.gymId !== host.gymId ||
    available?.account.branchId !== null ||
    !originalPoints.posted ||
    originalPoints.kind !== "VISIT" ||
    !originalMoney.posted ||
    originalMoney.kind !== "VISIT_SETTLEMENT" ||
    !wallet ||
    wallet.account.ownerUserId !== v.traineeId ||
    !available
  )
    throw new DomainError("SETTLEMENT_REVIEW_REQUIRED");
  // A reversal is not a new top-up: never renew or revive expired points.
  if (!wallet.account.expiresAt || wallet.account.expiresAt <= new Date())
    throw new DomainError("WALLET_EXPIRY_REVIEW_REQUIRED");
  // Aggregated available cash does not prove this particular visit was unpaid.
  // Until payouts allocate settlement lots, any intervening non-reversal debit
  // requires an explicit settlement review, even if later visits refilled cash.
  if(await tx.financialHold.count({where:{visitId:v.id,state:"OPEN"}}))throw new DomainError("SETTLEMENT_REVIEW_REQUIRED");
  const outflow = await tx.moneyPosting.findFirst({
    where: {
      accountId: available.accountId,
      deltaPiasters: { lt: 0n },
      transaction: {
        createdAt: { gte: originalMoney.createdAt },
        kind: { notIn: ["VISIT_REVERSAL","DISPUTE_HOLD","DISPUTE_RELEASE"] },
      },
    },
  });
  if (outflow || available.account.balancePiasters < v.settlementPiasters)
    throw new DomainError("SETTLEMENT_REVIEW_REQUIRED");
  const id = randomUUID();
  const posted = await postInTransaction(tx, {
    actorId,
    idempotencyKey: key,
    referenceId: id,
    reason,
    points: {
      kind: "VISIT_REVERSAL",
      reversalOfId: originalPoints.id,
      entries: originalPoints.postings.map((p) => ({
        accountId: p.accountId,
        delta: -BigInt(p.delta),
      })),
    },
    money: {
      kind: "VISIT_REVERSAL",
      reversalOfId: originalMoney.id,
      entries: originalMoney.postings.map((p) => ({
        accountId: p.accountId,
        delta: -p.deltaPiasters,
      })),
    },
  });
  const cancellation = await tx.visitCancellation.create({
    data: {
      id,
      visitId,
      actorId,
      reason,
      reviewId,
      idempotencyKey: key,
      requestHash,
      pointTransactionId: posted.pointTransactionId!,
      moneyTransactionId: posted.moneyTransactionId!,
    },
  });
  const cancelled = await tx.visit.update({
    where: { id: visitId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: actorId,
      cancellationReason: reason,
    },
  });
  await audit(tx, actorId, "VISIT_CANCELLED", visitId, reason);
  return {
    id: cancellation.id,
    visit: visitView(cancelled),
    pointTransactionId: cancellation.pointTransactionId,
    moneyTransactionId: cancellation.moneyTransactionId,
  };
}
export async function cancelVisit(
  db: PrismaClient,
  actorId: string,
  branchId: string,
  visitId: string,
  key: string,
  input: unknown,
) {
  const data = parse(cancellationSchema, input);
  parse(uuid, key);
  const idempotencyKey = `cancel:${actorId}:${key}`,
    requestHash = digest({ branchId, visitId, ...data });
  return serializable(db, async (tx) => {
    await requireBranchAccess(tx, actorId, branchId, "CANCEL_VISIT");
    await lock(tx, idempotencyKey);
    const old = await tx.visitCancellation.findUnique({
      where: { idempotencyKey },
    });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return {
        id: old.id,
        visit: visitView(
          await tx.visit.findUniqueOrThrow({ where: { id: old.visitId } }),
        ),
        pointTransactionId: old.pointTransactionId,
        moneyTransactionId: old.moneyTransactionId,
      };
    }
    const v = await visit(tx, visitId);
    if (v.branchId !== branchId) throw new DomainError("BRANCH_ACCESS_DENIED");
    if (
      Date.now() - v.startedAt.getTime() > 10 * 60000 ||
      v.startedAt > new Date()
    )
      throw new DomainError("CANCEL_WINDOW_CLOSED");
    if (await tx.operationReview.findUnique({ where: { visitId } }))
      throw new DomainError("OPERATION_REVIEW_EXISTS");
    return reverseVisit(
      tx,
      actorId,
      visitId,
      idempotencyKey,
      requestHash,
      data.reason,
    );
  });
}
async function reviewSerializable<T>(
  db: PrismaClient,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await serializable(db, run);
  } catch (error) {
    // A waiting serializable snapshot can miss the case just committed under
    // another key. Refresh it to replay the winner or report a scoped conflict.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      ["visitId", "saleId"].some((column) =>
        String(error.meta?.target).includes(column),
      )
    )
      return serializable(db, run);
    throw error;
  }
}
export async function requestReview(
  db: PrismaClient,
  actorId: string,
  key: string,
  input: unknown,
) {
  const data = parse(requestSchema, input);
  parse(uuid, key);
  const idempotencyKey = `opreview:${actorId}:${key}`,
    requestHash = digest(data);
  return reviewSerializable(db, async (tx) => {
    const actor = await requireActor(tx, actorId);
    await lock(tx, idempotencyKey);
    // Serialize different keys for the same target, too. A second request never
    // replaces the first requestor's evidence or terminal decision.
    await lock(tx, `review-target:${data.kind}:${data.targetId}`);
    const target =
      data.kind === "VISIT_CANCEL"
        ? await visit(tx, data.targetId)
        : await tx.pointSale.findUnique({ where: { id: data.targetId } });
    if (!target) throw new DomainError("NOT_FOUND");
    const branch = await tx.branch.findUniqueOrThrow({
      where: { id: target.branchId },
      include: { gym: true },
    });
    const assignment = await tx.staffAssignment.findFirst({
      where: { userId: actorId, branchId: branch.id, active: true },
    });
    if (
      actor.role !== "PLATFORM_ADMIN" &&
      target.traineeId !== actorId &&
      !(branch.gym.ownerId === actorId && branch.gym.ownerAcceptedAt) &&
      !assignment && !(await authority(tx,actorId,branch.gymId,branch.id)).full
    )
      throw new DomainError("BRANCH_ACCESS_DENIED");
    const old = await tx.operationReview.findUnique({
      where: { idempotencyKey },
    });
    if (old) {
      if (old.requestHash !== requestHash)
        throw new DomainError("IDEMPOTENCY_CONFLICT");
      return reviewView(old);
    }
    if (
      data.kind === "VISIT_CANCEL" &&
      "status" in target &&
      target.status === "CANCELLED"
    )
      throw new DomainError("VISIT_ALREADY_CANCELLED");
    if (
      await tx.operationReview.findFirst({
        where:
          data.kind === "VISIT_CANCEL"
            ? { visitId: data.targetId }
            : { saleId: data.targetId },
      })
    )
      throw new DomainError("OPERATION_REVIEW_EXISTS");
    if (
      data.evidenceId &&
      !(await tx.receiptEvidence.findFirst({
        where: { id: data.evidenceId, ownerUserId: actorId },
      }))
    )
      throw new DomainError("RECEIPT_ACCESS_DENIED");
    const r = await tx.operationReview.create({
      data: {
        kind: data.kind,
        ...(data.kind === "VISIT_CANCEL"
          ? { visitId: data.targetId }
          : { saleId: data.targetId }),
        branchId: branch.id,
        requestorId: actorId,
        reason: data.reason,
        evidenceText: data.evidenceText,
        evidenceId: data.evidenceId,
        idempotencyKey,
        requestHash,
      },
    });
    await audit(tx, actorId, "OPERATION_REVIEW_REQUESTED", r.id, data.reason);
    return reviewView(r);
  });
}
export async function decideReview(
  db: PrismaClient,
  actorId: string,
  reviewId: string,
  input: unknown,
) {
  const data = parse(reviewSchema, input);
  return serializable(db, async (tx) => {
    await requireAdmin(tx, actorId);
    await tx.$queryRaw`SELECT id FROM "OperationReview" WHERE id=${reviewId}::uuid FOR UPDATE`;
    const r = await tx.operationReview.findUnique({ where: { id: reviewId } });
    if (!r) throw new DomainError("NOT_FOUND");
    const status = data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    if (r.status !== "PENDING") {
      if (
        r.status === status &&
        r.reviewReason === data.reason &&
        r.reviewedById === actorId
      )
        return reviewView(r);
      throw new DomainError("INVALID_STATE");
    }
    if (data.decision === "APPROVE") {
      if (r.kind === "SALE_CORRECTION")
        throw new DomainError("SALE_REFUND_POLICY_REQUIRED");
      await reverseVisit(
        tx,
        actorId,
        r.visitId!,
        `reviewcancel:${r.id}`,
        digest({ reviewId, ...data }),
        data.reason,
        r.id,
      );
    }
    const updated = await tx.operationReview.update({
      where: { id: reviewId },
      data: {
        status,
        reviewReason: data.reason,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
    });
    await audit(tx, actorId, "OPERATION_REVIEW_DECIDED", reviewId, data.reason);
    return reviewView(updated);
  });
}
