import { z } from 'zod';
import { Prisma, type PrismaClient } from '@prisma/client';
import { requireAdmin } from '../auth/authorization.js';
import { serializable } from '../ledger/service.js';
import { audit } from '../gyms/service.js';
import { parse } from '../gyms/validation.js';
import { DomainError } from '../domain/errors.js';

export const maxMoney = 9223372036854775807n;
export const moneySchema = z.string().regex(/^[1-9]\d{0,18}$/).refine(v => BigInt(v) <= maxMoney);
const expectedVersion = z.number().int().min(0).max(2147483646);
export const policySchema = z.object({ expectedVersion, pointPricePiasters: moneySchema, redemptionBps: z.number().int().min(1).max(10000) }).strict();
export const methodTypeSchema = z.enum(['INSTAPAY', 'WALLET']);
export const methodSchema = z.object({ expectedVersion, account: z.string().trim().min(3).max(150), accountName: z.string().trim().min(2).max(150), enabled: z.boolean() }).strict();
export const packageSchema = z.object({ expectedVersion, label: z.string().trim().min(1).max(100), kind: z.literal('TRAINEE'), points: z.number().int().positive().max(2147483647), enabled: z.boolean() }).strict();
export const policyView = (p: { id: string; version: number; pointPricePiasters: bigint; redemptionBps: number }) => ({ id: p.id, version: p.version, pointPricePiasters: p.pointPricePiasters.toString(), redemptionBps: p.redemptionBps });

export async function publishPolicy(db: PrismaClient, actorId: string, input: unknown) {
  const data = parse(policySchema, input);
  try {
    return await serializable(db, async tx => {
      await requireAdmin(tx, actorId);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-pricing-policy', 0))`;
      const current = await tx.pricingPolicy.findFirst({ orderBy: { version: 'desc' } });
      if ((current?.version ?? 0) !== data.expectedVersion) throw new DomainError('STALE_SETTINGS');
      const policy = await tx.pricingPolicy.create({ data: { version: data.expectedVersion + 1, pointPricePiasters: BigInt(data.pointPricePiasters), redemptionBps: data.redemptionBps, createdById: actorId } });
      if (!await tx.pointAccount.findFirst({ where: { type: 'ISSUANCE' } })) await tx.pointAccount.create({ data: { type: 'ISSUANCE' } });
      await audit(tx, actorId, 'PRICING_POLICY_PUBLISHED', policy.id, 'Admin configured point price, trainee pricing and visit settlement ratio');
      return policyView(policy);
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('STALE_SETTINGS');
    throw e;
  }
}

export async function savePaymentMethod(db: PrismaClient, actorId: string, kind: unknown, input: unknown) {
  const type = parse(methodTypeSchema, kind), data = parse(methodSchema, input);
  try { return await serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-method:${type}`}, 0))`;
    const current = await tx.paymentMethod.findUnique({ where: { type } });
    if ((current?.version ?? 0) !== data.expectedVersion) throw new DomainError('STALE_SETTINGS');
    const fields = { account: data.account, accountName: data.accountName, enabled: data.enabled };
    const result = current ? await tx.paymentMethod.update({ where: { id: current.id }, data: { ...fields, version: { increment: 1 } } }) : await tx.paymentMethod.create({ data: { ...fields, type } });
    await audit(tx, actorId, 'PAYMENT_METHOD_UPDATED', result.id, `${type} receiver details updated; existing requests retain their snapshot`);
    return result;
  }); } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('STALE_SETTINGS');
    throw e;
  }
}

export function savePackage(db: PrismaClient, actorId: string, packageId: string | undefined, input: unknown) {
  const data = parse(packageSchema, input);
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    if (packageId) await tx.$queryRaw`SELECT id FROM "TopupPackage" WHERE id = ${packageId}::uuid FOR UPDATE`;
    const current = packageId ? await tx.topupPackage.findUnique({ where: { id: packageId } }) : null;
    if (packageId && !current) throw new DomainError('NOT_FOUND');
    if ((current?.version ?? 0) !== data.expectedVersion) throw new DomainError('STALE_SETTINGS');
    const fields = { label: data.label, kind: data.kind, points: data.points, enabled: data.enabled };
    const result = current ? await tx.topupPackage.update({ where: { id: current.id }, data: { ...fields, version: { increment: 1 } } }) : await tx.topupPackage.create({ data: fields });
    await audit(tx, actorId, 'TOPUP_PACKAGE_SAVED', result.id, 'Admin saved a points quantity package; price is derived from current policy');
    return result;
  });
}
