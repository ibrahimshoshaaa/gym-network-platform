import {authority,requirePermission} from '../auth/delegation.js';
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient, type UserRole } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { requireActor, requireAdmin, requireGymOwner } from '../auth/authorization.js';
import { hashToken } from '../auth/sessions.js';
import { publicIdentity } from '../auth/trainees.js';
import { serializable } from '../ledger/service.js';
import { parse, gymCreateSchema, gymUpdateSchema, branchCreateSchema, branchUpdateSchema, priceSchema, reviewSchema, gymStatusSchema, branchStatusSchema, staffInviteSchema, staffActiveSchema } from './validation.js';

type Tx = Prisma.TransactionClient;
export const audit = (tx: Tx, actorId: string, action: string, entityId: string, reason: string) =>
  tx.auditLog.create({ data: { actorId, action, entityId, reason } });

export async function contactUser(tx: Tx, contact: { displayName: string; email: string; phone: string }, role: UserRole) {
  const existing = await tx.user.findFirst({ where: { OR: [{ email: contact.email }, { phoneE164: contact.phone }] }, include: { password: true } });
  if (existing) {
    if (existing.email !== contact.email || existing.phoneE164 !== contact.phone || existing.role === 'PLATFORM_ADMIN' || (!existing.isActive && existing.password)) throw new DomainError('ACCOUNT_UNAVAILABLE');
    return existing;
  }
  return tx.user.create({ data: { displayName: contact.displayName, email: contact.email, phoneE164: contact.phone, role, isActive: false } });
}

export async function makeInvitation(tx: Tx, input: { actorId: string; gymId: string; userId: string; type: 'OWNER' | 'STAFF'; role: UserRole; branchId?: string }) {
  const scope = `${input.type}:${input.gymId}:${input.branchId ?? ''}:${input.userId}:${input.role}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
  await tx.staffInvitation.updateMany({ where: { gymId: input.gymId, userId: input.userId, type: input.type, role: input.role, branchId: input.branchId ?? null, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  const token = randomBytes(32).toString('base64url');
  const invitation = await tx.staffInvitation.create({ data: {
    type: input.type, tokenHash: hashToken(token), userId: input.userId, gymId: input.gymId,
    branchId: input.branchId, role: input.role, createdById: input.actorId, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
  } });
  await audit(tx, input.actorId, 'INVITATION_CREATED', invitation.id, `${input.type} invitation; previous unconsumed invitations in this scope revoked`);
  return { id: invitation.id, token, expiresAt: invitation.expiresAt };
}

export async function createGym(db: PrismaClient, actorId: string, input: unknown) {
  const data = parse(gymCreateSchema, input);
  try {
    return await serializable(db, async tx => {
      await requireAdmin(tx, actorId);
      const owner = data.owner ? await contactUser(tx, data.owner, 'GYM_OWNER') : await tx.user.findUnique({ where: { id: data.ownerId! } });
      if (!owner || (data.ownerId && (!owner.isActive || owner.role !== 'GYM_OWNER'))) throw new DomainError('ACCOUNT_UNAVAILABLE');
      const gym = await tx.gym.create({ data: { name: data.name, description: data.description, contactPhone: data.contactPhone, ownerId: owner.id, ownerAcceptedAt: data.ownerId ? new Date() : null } });
      const invitation = data.owner ? await makeInvitation(tx, { actorId, gymId: gym.id, userId: owner.id, type: 'OWNER', role: 'GYM_OWNER' }) : undefined;
      await audit(tx, actorId, 'GYM_CREATED', gym.id, 'Platform administrator created pending gym');
      return { gym, owner: publicIdentity(owner), invitation };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('ACCOUNT_UNAVAILABLE');
    throw e;
  }
}

export function reissueOwnerInvitation(db: PrismaClient, actorId: string, gymId: string) {
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    const gym = await tx.gym.findUnique({ where: { id: gymId } });
    if (!gym || gym.ownerAcceptedAt || !['PENDING', 'ACTIVE'].includes(gym.status)) throw new DomainError('INVALID_STATE');
    return makeInvitation(tx, { actorId, gymId, userId: gym.ownerId, type: 'OWNER', role: 'GYM_OWNER' });
  });
}

export function updateGym(db: PrismaClient, actorId: string, gymId: string, input: unknown) {
  const data = parse(gymUpdateSchema, input);
  return serializable(db, async tx => {
    await requireGymOwner(tx, actorId, gymId);
    const gym = await tx.gym.update({ where: { id: gymId }, data });
    await audit(tx, actorId, 'GYM_UPDATED', gym.id, 'Owner updated gym profile');
    return gym;
  });
}

export function setGymStatus(db: PrismaClient, actorId: string, gymId: string, input: unknown) {
  const data = parse(gymStatusSchema, input);
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    await tx.$queryRaw`SELECT id FROM "Gym" WHERE id = ${gymId}::uuid FOR UPDATE`;
    const gym = await tx.gym.findUnique({ where: { id: gymId }, include: { owner: true } });
    if (!gym) throw new DomainError('NOT_FOUND');
    if (gym.status === data.status) return { id: gym.id, status: gym.status };
    const allowed = gym.status === 'PENDING' ? ['ACTIVE', 'REJECTED'] : gym.status === 'ACTIVE' ? ['SUSPENDED'] : gym.status === 'SUSPENDED' ? ['ACTIVE'] : [];
    if (!allowed.includes(data.status) || (data.status === 'ACTIVE' && (!gym.ownerAcceptedAt || !gym.owner.isActive))) throw new DomainError('INVALID_STATE');
    await tx.gym.update({ where: { id: gymId }, data: { status: data.status } });
    await audit(tx, actorId, `GYM_${data.status}`, gymId, data.reason);
    return { id: gymId, status: data.status };
  });
}

export function createBranch(db: PrismaClient, actorId: string, gymId: string, input: unknown) {
  const data = parse(branchCreateSchema, input);
  return serializable(db, async tx => {
    await requireGymOwner(tx, actorId, gymId);
    const branch = await tx.branch.create({ data: { ...data, gymId, status: 'PENDING' } });
    const pricingRequest = await tx.branchPricingRequest.create({ data: {
      branchId: branch.id, requestedById: actorId, visitPricePoints: data.visitPricePoints, sessionMinutes: data.sessionMinutes,
      previousPricePoints: data.visitPricePoints, previousSessionMinutes: data.sessionMinutes, baseVersion: 0, reason: 'Initial branch pricing proposal',
    } });
    await audit(tx, actorId, 'BRANCH_CREATED', branch.id, 'Pending branch and empty independent inventory created; price awaits platform approval');
    return { branch, pricingRequest };
  });
}

async function ownedBranch(tx: Tx, actorId: string, gymId: string, branchId: string, permission?:'EDIT_BRANCH'|'REQUEST_PRICING'|'MANAGE_CASHIERS') {
  if(permission)await requirePermission(tx,actorId,gymId,permission,branchId);else await requireGymOwner(tx, actorId, gymId);
  const branch = await tx.branch.findUnique({ where: { id: branchId } });
  if (!branch || branch.gymId !== gymId) throw new DomainError('BRANCH_ACCESS_DENIED');
  return branch;
}

export function updateBranch(db: PrismaClient, actorId: string, gymId: string, branchId: string, input: unknown) {
  const data = parse(branchUpdateSchema, input);
  return serializable(db, async tx => {
    await ownedBranch(tx, actorId, gymId, branchId, 'EDIT_BRANCH');
    const branch = await tx.branch.update({ where: { id: branchId }, data });
    await audit(tx, actorId, 'BRANCH_UPDATED', branchId, 'Owner updated branch metadata');
    return branch;
  });
}

export async function requestPricing(db: PrismaClient, actorId: string, gymId: string, branchId: string, input: unknown) {
  const data = parse(priceSchema, input);
  try {
    return await serializable(db, async tx => {
      await ownedBranch(tx, actorId, gymId, branchId, 'REQUEST_PRICING');
      await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${branchId}::uuid FOR UPDATE`;
      const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId } });
      const request = await tx.branchPricingRequest.create({ data: { ...data, branchId, requestedById: actorId, baseVersion: branch.pricingVersion, previousPricePoints: branch.visitPricePoints, previousSessionMinutes: branch.sessionMinutes } });
      await audit(tx, actorId, 'PRICE_CHANGE_REQUESTED', request.id, data.reason);
      return request;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('PENDING_REQUEST_EXISTS');
    throw e;
  }
}

export function reviewPricing(db: PrismaClient, actorId: string, requestId: string, input: unknown) {
  const data = parse(reviewSchema, input);
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    const original = await tx.branchPricingRequest.findUnique({ where: { id: requestId } });
    if (!original) throw new DomainError('NOT_FOUND');
    await tx.$queryRaw`SELECT id FROM "Branch" WHERE id = ${original.branchId}::uuid FOR UPDATE`;
    const request = await tx.branchPricingRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== 'PENDING') {
      if (request.status === data.decision) return request;
      throw new DomainError('INVALID_STATE');
    }
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: request.branchId }, include: { gym: true } });
    if (data.decision === 'APPROVED' && branch.gym.status !== 'ACTIVE') throw new DomainError('GYM_INACTIVE');
    if (data.decision === 'APPROVED' && request.baseVersion !== branch.pricingVersion) throw new DomainError('STALE_PRICE_REQUEST');
    if (data.decision === 'APPROVED') await tx.branch.update({ where: { id: branch.id }, data: {
      visitPricePoints: request.visitPricePoints, sessionMinutes: request.sessionMinutes, pricingVersion: { increment: 1 }, priceApprovedAt: new Date(), priceApprovedById: actorId,
    } });
    const result = await tx.branchPricingRequest.update({ where: { id: requestId }, data: { status: data.decision, reviewedById: actorId, reviewedAt: new Date(), reviewReason: data.reason } });
    await audit(tx, actorId, `PRICE_CHANGE_${data.decision}`, requestId, data.reason);
    return result;
  });
}

export function setBranchStatus(db: PrismaClient, actorId: string, branchId: string, input: unknown) {
  const data = parse(branchStatusSchema, input);
  return serializable(db, async tx => {
    await requireAdmin(tx, actorId);
    const branch = await tx.branch.findUnique({ where: { id: branchId }, include: { gym: { include: { owner: true } } } });
    if (!branch) throw new DomainError('NOT_FOUND');
    if (data.status === 'ACTIVE' && (branch.gym.status !== 'ACTIVE' || !branch.gym.owner.isActive || !branch.gym.ownerAcceptedAt || !branch.priceApprovedAt || branch.pricingVersion < 1 || branch.latitude === null || branch.longitude === null || !branch.address || !branch.city || !branch.governorate)) throw new DomainError('BRANCH_NOT_READY');
    if (branch.status === data.status) return branch;
    const updated = await tx.branch.update({ where: { id: branchId }, data: { status: data.status } });
    await audit(tx, actorId, `BRANCH_${data.status}`, branchId, data.reason);
    return updated;
  });
}

export async function inviteStaff(db: PrismaClient, actorId: string, gymId: string, input: unknown) {
  const data = parse(staffInviteSchema, input);
  try {
    return await serializable(db, async tx => {
      const branch = await ownedBranch(tx, actorId, gymId, data.branchId, 'MANAGE_CASHIERS');
      const gym = await tx.gym.findUniqueOrThrow({ where: { id: gymId } });
      if (gym.status !== 'ACTIVE' || branch.status === 'SUSPENDED') throw new DomainError('GYM_INACTIVE');
      const grant=await authority(tx,actorId,gymId,data.branchId);if(!grant.owner&&!grant.full&&data.role!=='CASHIER')throw new DomainError('BRANCH_ACCESS_DENIED');
      const user = await contactUser(tx, data.contact, data.role);
      const assignment = await tx.staffAssignment.findUnique({ where: { userId_branchId_role: { userId: user.id, branchId: branch.id, role: data.role } } });
      if (assignment?.active) throw new DomainError('STAFF_ALREADY_ASSIGNED');
      const invitation = await makeInvitation(tx, { actorId, gymId, branchId: branch.id, userId: user.id, type: 'STAFF', role: data.role });
      return { invitation, user: publicIdentity(user),canDelegate:grant.owner };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new DomainError('ACCOUNT_UNAVAILABLE');
    throw e;
  }
}

export function setStaffActive(db: PrismaClient, actorId: string, gymId: string, assignmentId: string, input: unknown) {
  const data = parse(staffActiveSchema, input);
  return serializable(db, async tx => {
    const assignment = await tx.staffAssignment.findUnique({ where: { id: assignmentId }, include: { branch: true } });
    if (!assignment || assignment.branch.gymId !== gymId) throw new DomainError('BRANCH_ACCESS_DENIED');
    const grant=await requirePermission(tx,actorId,gymId,'MANAGE_CASHIERS',assignment.branchId);
    if(!grant.owner&&!grant.full&&(assignment.role!=='CASHIER'||assignment.userId===actorId))throw new DomainError('BRANCH_ACCESS_DENIED');
    const result = await tx.staffAssignment.update({ where: { id: assignmentId }, data });
    if (!data.active) await tx.staffInvitation.updateMany({ where: { userId: assignment.userId, branchId: assignment.branchId, role: assignment.role, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actorId, data.active ? 'STAFF_ENABLED' : 'STAFF_DISABLED', assignmentId, 'Owner changed branch assignment access');
    return result;
  });
}

export function revokeInvitation(db: PrismaClient, actorId: string, invitationId: string) {
  return serializable(db, async tx => {
    const actor = await requireActor(tx, actorId);
    const invite = await tx.staffInvitation.findUnique({ where: { id: invitationId } });
    if (!invite) throw new DomainError('NOT_FOUND');
    if (actor.role !== 'PLATFORM_ADMIN') {
      await requireGymOwner(tx, actorId, invite.gymId, false);
      if (invite.type !== 'STAFF') throw new DomainError('ACCESS_DENIED');
    }
    if (invite.acceptedAt) throw new DomainError('INVALID_STATE');
    if (!invite.revokedAt) {
      await tx.staffInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
      await audit(tx, actorId, 'INVITATION_REVOKED', invitationId, 'Authorized invitation revocation');
    }
    return { id: invite.id, revoked: true };
  });
}
