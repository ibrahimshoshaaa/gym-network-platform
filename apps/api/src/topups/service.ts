import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient, type TopupRequest } from '@prisma/client';
import { requireActor, requireAdmin } from '../auth/authorization.js';
import { serializable, postInTransaction } from '../ledger/service.js';
import { audit } from '../gyms/service.js';
import { parse } from '../gyms/validation.js';
import { DomainError } from '../domain/errors.js';
import { maxMoney, methodTypeSchema, moneySchema } from './settings.js';


const selection = { kind: z.literal('TRAINEE'), points: z.number().int().positive().max(2147483647).optional(), amountPiasters: moneySchema.optional(), packageId: z.string().uuid().optional(), packageVersion: z.number().int().positive().optional() };
const validSelection = (v: z.infer<z.ZodObject<typeof selection>>) => v.kind === 'TRAINEE' && [v.points,v.amountPiasters,v.packageId].filter(x=>x!==undefined).length===1 && Boolean(v.packageId)===Boolean(v.packageVersion);
export const quoteSchema = z.object(selection).strict().refine(validSelection);
export const submitSchema = z.object({ ...selection, pricingVersion: z.number().int().positive(), receiptId: z.string().uuid(), paymentMethod: methodTypeSchema, paymentMethodVersion: z.number().int().positive() }).strict().refine(validSelection);
export const reviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('REJECTED'), reason: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ decision: z.literal('APPROVED'), reason: z.string().trim().min(1).max(1000), paymentReference: z.string().trim().min(3).max(150), receivedAmountPiasters: moneySchema, fundsReceived: z.literal(true), receiptReviewed: z.literal(true) }).strict(),
]);
type Tx = Prisma.TransactionClient;
type Selection = z.infer<typeof quoteSchema>;

export function calculateQuote(unitPrice: bigint, discountBps: number, selection: { points?: number; amountPiasters?: string }) {
  const numerator = unitPrice * BigInt(10000 - discountBps);
  const requested = selection.amountPiasters ? BigInt(selection.amountPiasters) : undefined;
  const points = selection.points === undefined ? requested! * 10000n / numerator : BigInt(selection.points);
  const charge = (points * numerator + 9999n) / 10000n;
  if (points <= 0n || points > 2147483647n || charge <= 0n || charge > maxMoney) throw new DomainError('INVALID_INPUT');
  return { points: Number(points), chargePiasters: charge, requestedAmountPiasters: requested, unallocatedPiasters: requested === undefined ? 0n : requested - charge };
}

async function eligibility(tx:Tx,actorId:string,data:Selection){

 const user=await requireActor(tx,actorId);if(user.role!=='TRAINEE')throw new DomainError('ACCESS_DENIED');
}
async function quote(tx: Tx, actorId: string, data: Selection) {
  await eligibility(tx, actorId, data);
  const policy = await tx.pricingPolicy.findFirst({ orderBy: { version: 'desc' } });
  if (!policy) throw new DomainError('PRICING_NOT_CONFIGURED');
  let points = data.points;
  if (data.packageId) {
    const pack = await tx.topupPackage.findUnique({ where: { id: data.packageId } });
    if (!pack?.enabled || pack.kind !== data.kind || pack.version !== data.packageVersion) throw new DomainError('PACKAGE_UNAVAILABLE');
    points = pack.points;
  }
  const discountBps = 0;
  const calculation = calculateQuote(policy.pointPricePiasters, discountBps, { points, amountPiasters: data.amountPiasters });
  return { ...calculation, policy, discountBps };
}

export const topupView = (r: TopupRequest) => ({ id: r.id, kind: r.kind, requestorUserId: r.requestorUserId, points: r.points, chargePiasters: r.chargePiasters.toString(), unitPricePiasters: r.unitPricePiasters?.toString() ?? null, discountBps: r.discountBps, redemptionBps: r.redemptionBps, policyId: r.policyId, status: r.status, receiptId: r.receiptId, paymentMethod: r.paymentMethodType, paymentAccount: r.paymentAccount, paymentAccountName: r.paymentAccountName, reviewedAt: r.reviewedAt, reviewReason: r.reviewReason, pointTransactionId: r.pointTransactionId, createdAt: r.createdAt });
export function getQuote(db: PrismaClient, actorId: string, input: unknown) {
  const data = parse(quoteSchema, input);
  return db.$transaction(async tx => {
    const q = await quote(tx, actorId, data);
    return { points: q.points, chargePiasters: q.chargePiasters.toString(), pricingVersion: q.policy.version, unitPricePiasters: q.policy.pointPricePiasters.toString(), discountBps: q.discountBps, requestedAmountPiasters: q.requestedAmountPiasters?.toString() ?? null, unallocatedPiasters: q.unallocatedPiasters.toString() };
  });
}

export async function submitTopup(db: PrismaClient, actorId: string, key: string, input: unknown) {
  const data = parse(submitSchema, input);if(data.kind!=='TRAINEE')throw new DomainError('ACCESS_DENIED'); parse(z.string().uuid(), key);
  const idempotencyKey = `topup:${actorId}:${key}`;
  const requestHash = createHash('sha256').update(JSON.stringify({ kind: data.kind, points: data.points, amountPiasters: data.amountPiasters, packageId: data.packageId, packageVersion: data.packageVersion, pricingVersion: data.pricingVersion, receiptId: data.receiptId, paymentMethod: data.paymentMethod, paymentMethodVersion: data.paymentMethodVersion })).digest('hex');
  try {
    return await serializable(db, async tx => {
      await requireActor(tx, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${idempotencyKey}, 0))`;
      const old = await tx.topupRequest.findUnique({ where: { idempotencyKey } });
      if (old) { if (old.requestHash !== requestHash) throw new DomainError('IDEMPOTENCY_CONFLICT'); return topupView(old); }
      const q = await quote(tx, actorId, data);
      if (q.policy.version !== data.pricingVersion) throw new DomainError('STALE_SETTINGS');
      const method = await tx.paymentMethod.findUnique({ where: { type: data.paymentMethod } });
      if (!method?.enabled) throw new DomainError('PAYMENT_METHOD_UNAVAILABLE');
      if (method.version !== data.paymentMethodVersion) throw new DomainError('STALE_SETTINGS');
      await tx.$queryRaw`SELECT id FROM "ReceiptEvidence" WHERE id=${data.receiptId}::uuid FOR UPDATE`;
      const receipt = await tx.receiptEvidence.findUnique({ where: { id: data.receiptId } });
      if (!receipt || receipt.ownerUserId !== actorId) throw new DomainError('RECEIPT_ACCESS_DENIED');
      if (await tx.financialEvidenceUse.findUnique({where:{receiptId:receipt.id}}) || await tx.topupRequest.findUnique({ where: { receiptId: receipt.id } }) || await tx.withdrawalRequest.findUnique({ where: { proofReceiptId: receipt.id } })) throw new DomainError('RECEIPT_ALREADY_USED');
      const request = await tx.topupRequest.create({ data: {
        requestorUserId: actorId, kind: data.kind, points: q.points, chargePiasters: q.chargePiasters,
        receiptObjectKey: receipt.objectKey, receiptId: receipt.id, policyId: q.policy.id, unitPricePiasters: q.policy.pointPricePiasters, discountBps: q.discountBps, redemptionBps: q.policy.redemptionBps,
        paymentMethodType: method.type, paymentAccount: method.account, paymentAccountName: method.accountName, idempotencyKey, requestHash,
      } });
      await audit(tx, actorId, 'TOPUP_SUBMITTED', request.id, 'Manual transfer evidence submitted; no points issued');
      return topupView(request);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('RECEIPT_ALREADY_USED');
    throw e;
  }
}

export async function reviewTopup(db: PrismaClient, actorId: string, requestId: string, input: unknown) {
  const data = parse(reviewSchema, input);
  try {
    return await serializable(db, async tx => {
      await requireAdmin(tx, actorId);
      await tx.$queryRaw`SELECT id FROM "TopupRequest" WHERE id = ${requestId}::uuid FOR UPDATE`;
      const request = await tx.topupRequest.findUnique({ where: { id: requestId } });
      if (!request) throw new DomainError('NOT_FOUND');
      if (request.status !== 'PENDING') {
        if (request.status === data.decision) {
          if (data.decision === 'APPROVED' && (request.paymentReference !== data.paymentReference.toUpperCase() || request.chargePiasters !== BigInt(data.receivedAmountPiasters))) throw new DomainError('IDEMPOTENCY_CONFLICT');
          return topupView(request);
        }
        throw new DomainError('INVALID_STATE');
      }
      if (data.decision === 'REJECTED') {
        const result = await tx.topupRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date(), reviewReason: data.reason } });
        await audit(tx, actorId, 'TOPUP_REJECTED', requestId, data.reason); return topupView(result);
      }
      if (!request.kind || !request.policyId || !request.receiptId) throw new DomainError('LEGACY_REQUEST_REVIEW_REQUIRED');
      if (BigInt(data.receivedAmountPiasters) !== request.chargePiasters) throw new DomainError('PAYMENT_AMOUNT_MISMATCH');
      await eligibility(tx, request.requestorUserId, { kind: request.kind });
      const paymentReference = data.paymentReference.toUpperCase();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'payment-reference:'+paymentReference},0))`;
      if (await tx.topupRequest.findUnique({ where: { paymentReference } }) || await tx.pointDispatch.findUnique({where:{paymentReference}})) throw new DomainError('PAYMENT_REFERENCE_USED');
      const issuance = await tx.pointAccount.findFirst({ where: { type: 'ISSUANCE' } });
      const destination=await tx.pointAccount.findUnique({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:request.requestorUserId}}});
      if (!issuance || !destination) throw new DomainError('ACCOUNT_NOT_FOUND');
      if (request.kind === 'TRAINEE' && destination.balance > 0 && destination.expiresAt && destination.expiresAt <= new Date()) throw new DomainError('WALLET_EXPIRY_REVIEW_REQUIRED');
      const posting = await postInTransaction(tx, { actorId, idempotencyKey: `approved-topup:${requestId}`, reason: data.reason, referenceId: requestId,
        points: { kind: 'ISSUE', entries: [{ accountId: issuance.id, delta: -BigInt(request.points) }, { accountId: destination.id, delta: BigInt(request.points) }] } });
      if (request.kind === 'TRAINEE') await tx.pointAccount.update({ where: { id: destination.id }, data: { expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } });
      const result = await tx.topupRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', reviewedById: actorId, reviewedAt: new Date(), reviewReason: data.reason, paymentReference, pointTransactionId: posting.pointTransactionId } });
      await audit(tx, actorId, 'TOPUP_APPROVED', requestId, data.reason);
      return topupView(result);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('PAYMENT_REFERENCE_USED');
    throw e;
  }
}

