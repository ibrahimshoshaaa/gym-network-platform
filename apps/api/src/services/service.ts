import type { Prisma, PrismaClient } from '@prisma/client';
import { requireActor, requireAdmin } from '../auth/authorization.js';
import { requirePermission } from '../auth/delegation.js';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { serializable } from '../ledger/service.js';
import { serviceInput, serviceChangeInput, serviceReviewInput, serviceStatusInput } from './validation.js';
import { z } from 'zod';

export function setBookingHours(db: PrismaClient, actor: string, branchId: string, body: unknown) {
  const input = parse(z.object({ openMinute: z.number().int().min(0).max(1439), closeMinute: z.number().int().min(0).max(1439), expectedVersion: z.number().int().min(0) }).strict().refine(v => v.openMinute !== v.closeMinute), body);
  return serializable(db, async tx => {
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid FOR UPDATE`;
    const branch = await editable(tx, actor, branchId);
    if (branch.bookingHoursVersion !== input.expectedVersion) throw new DomainError('STALE_SETTINGS');
    const updated = await tx.branch.update({ where: { id: branchId }, data: { bookingOpenMinute: input.openMinute, bookingCloseMinute: input.closeMinute, bookingHoursVersion: { increment: 1 } } });
    await audit(tx, actor, 'BRANCH_BOOKING_HOURS_CHANGED', branchId, 'Daily opening and closing time in Africa/Cairo');
    return { hours: { openMinute: updated.bookingOpenMinute, closeMinute: updated.bookingCloseMinute, version: updated.bookingHoursVersion, timeZone: 'Africa/Cairo' } };
  });
}

async function editable(tx: Prisma.TransactionClient, actor: string, branchId: string) {
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch) throw new DomainError('NOT_FOUND');
  const authority = await requirePermission(tx, actor, branch.gymId, 'REQUEST_PRICING', branchId);
  if (!['ACTIVE', 'PENDING'].includes(authority.gym.status) || branch.status === 'SUSPENDED') throw new DomainError('GYM_INACTIVE');
  return branch;
}
async function lockService(tx: Prisma.TransactionClient, serviceId: string, branchId: string) {
  await tx.$queryRaw`SELECT id FROM "BranchService" WHERE id=${serviceId}::uuid AND "branchId"=${branchId}::uuid FOR UPDATE`;
  const service = await tx.branchService.findUnique({ where: { id: serviceId } });
  if (!service || service.branchId !== branchId) throw new DomainError('NOT_FOUND');
  return service;
}
export function createService(db: PrismaClient, actor: string, branchId: string, body: unknown) {
  const input = parse(serviceInput, body);
  return serializable(db, async tx => {
    await editable(tx, actor, branchId);
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid FOR UPDATE`;
    if (await tx.branchService.count({ where: { branchId } }) >= 100) throw new DomainError('INVALID_STATE');
    const service = await tx.branchService.create({ data: { branchId, name: input.name, description: input.description } });
    const request = await tx.servicePriceRequest.create({ data: { ...input, serviceId: service.id, baseVersion: 0, requestedById: actor } });
    await audit(tx, actor, 'SERVICE_CREATED', service.id, input.reason);
    return { service, request };
  });
}
export function requestServiceChange(db: PrismaClient, actor: string, branchId: string, serviceId: string, body: unknown) {
  const { expectedVersion, ...input } = parse(serviceChangeInput, body);
  return serializable(db, async tx => {
    await editable(tx, actor, branchId);
    const service = await lockService(tx, serviceId, branchId);
    if (service.version !== expectedVersion) throw new DomainError('STALE_PRICE_REQUEST');
    if (await tx.servicePriceRequest.findFirst({ where: { serviceId, status: 'PENDING' } })) throw new DomainError('PENDING_REQUEST_EXISTS');
    const request = await tx.servicePriceRequest.create({ data: { ...input, serviceId, baseVersion: service.version, requestedById: actor } });
    await audit(tx, actor, 'SERVICE_CHANGE_REQUESTED', request.id, input.reason);
    return request;
  });
}
export function setServiceActive(db: PrismaClient, actor: string, branchId: string, serviceId: string, body: unknown) {
  const input = parse(serviceStatusInput, body);
  return serializable(db, async tx => {
    await editable(tx, actor, branchId);
    const service = await lockService(tx, serviceId, branchId);
    if (service.version !== input.expectedVersion) throw new DomainError('STALE_PRICE_REQUEST');
    if (input.active && !service.approvedAt) throw new DomainError('BRANCH_NOT_READY');
    if (service.active === input.active) return service;
    // Do not silently invalidate a pending review through an availability change.
    if (await tx.servicePriceRequest.findFirst({ where: { serviceId, status: 'PENDING' } })) throw new DomainError('PENDING_REQUEST_EXISTS');
    const result = await tx.branchService.update({ where: { id: serviceId }, data: { active: input.active, version: { increment: 1 } } });
    await audit(tx, actor, input.active ? 'SERVICE_ENABLED' : 'SERVICE_DISABLED', serviceId, 'Owner changed approved service availability');
    return result;
  });
}
export function reviewService(db: PrismaClient, actor: string, requestId: string, body: unknown) {
  const input = parse(serviceReviewInput, body);
  return serializable(db, async tx => {
    await requireAdmin(tx, actor);
    const found = await tx.servicePriceRequest.findUnique({ where: { id: requestId }, include: { service: true } });
    if (!found) throw new DomainError('NOT_FOUND');
    const service = await lockService(tx, found.serviceId, found.service.branchId);
    const request = await tx.servicePriceRequest.findUniqueOrThrow({ where: { id: requestId } });
    // Replaying the same review is safe, but cannot change its decision/reason.
    if (request.status !== 'PENDING') {
      if (request.status === input.decision && request.reviewedById === actor && request.reviewReason === input.reason && request.baseVersion === input.expectedVersion) return { service, request, alreadyApplied: true };
      throw new DomainError('INVALID_STATE');
    }
    if (request.baseVersion !== input.expectedVersion || service.version !== input.expectedVersion) throw new DomainError('STALE_PRICE_REQUEST');
    const now = new Date();
    let updated = service;
    if (input.decision === 'APPROVED') {
      updated = await tx.branchService.update({ where: { id: service.id }, data: {
        name: request.name, description: request.description, points: request.points,
        durationMinutes: request.durationMinutes, approvedAt: now, approvedById: actor,
        // Approve first publication; later reviews must not re-enable an archived service.
        active: service.approvedAt ? service.active : true, version: { increment: 1 },
      } });
    }
    const reviewed = await tx.servicePriceRequest.update({ where: { id: requestId }, data: { status: input.decision, reviewedById: actor, reviewedAt: now, reviewReason: input.reason } });
    await audit(tx, actor, `SERVICE_CHANGE_${input.decision}`, requestId, input.reason);
    return { service: updated, request: reviewed, alreadyApplied: false };
  });
}
export function listServices(db: PrismaClient, actor: string, branchId: string, management: boolean) {
  return db.$transaction(async tx => {
    await requireActor(tx, actor);
    if (management) {
      await editable(tx, actor, branchId);
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
      return { hours: { openMinute: branch.bookingOpenMinute, closeMinute: branch.bookingCloseMinute, version: branch.bookingHoursVersion, timeZone: 'Africa/Cairo' }, items: await tx.branchService.findMany({ where: { branchId }, orderBy: { id: 'asc' }, take: 100,
        include: { requests: { orderBy: { createdAt: 'desc' }, take: 1 } } }) };
    }
    const branch = await tx.branch.findFirst({ where: { id: branchId, status: 'ACTIVE', gym: { status: 'ACTIVE', ownerAcceptedAt: { not: null }, owner: { isActive: true } } } });
    if (!branch) throw new DomainError('NOT_FOUND');
    const items = await tx.branchService.findMany({ where: { branchId, active: true, approvedAt: { not: null } }, orderBy: [{ points: 'asc' }, { id: 'asc' }], take: 100,
      select: { id: true, branchId: true, name: true, description: true, points: true, durationMinutes: true, version: true } });
    const catalogCount = await tx.branchService.count({ where: { branchId } });
    return { items, minimumPoints: items[0]?.points ?? null, serviceBooking: catalogCount > 0, hours: { openMinute: branch.bookingOpenMinute, closeMinute: branch.bookingCloseMinute, version: branch.bookingHoursVersion, timeZone: 'Africa/Cairo' } };
  });
}
