import {saveDelegation} from "./delegations.js";
import {authority,requirePermission} from "../auth/delegation.js";
import { approveBranchSetup } from "./setup.js";
import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import { authenticate } from '../auth/sessions.js';
import { requireActor, requireAdmin, requireGymOwner } from '../auth/authorization.js';
import { DomainError } from '../domain/errors.js';
import { createGym, updateGym, createBranch, updateBranch, requestPricing, reviewPricing, setGymStatus, setBranchStatus, inviteStaff, setStaffActive, revokeInvitation, reissueOwnerInvitation } from './service.js';
import { parse } from './validation.js';

const idSchema = z.string().uuid();
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), cursor: idSchema.optional() }).strict();
function id(request: FastifyRequest, key: string) { return parse(idSchema, (request.params as Record<string, string>)[key]); }
function pagination(request: FastifyRequest) {
  const query = parse(pageSchema, request.query);
  return { take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), orderBy: { id: 'asc' as const } };
}
function page<T extends { id: string }>(rows: T[], take: number) { return { items: rows.slice(0, take - 1), nextCursor: rows.length === take ? rows[take - 2]!.id : null }; }
export async function actorId(db: PrismaClient, request: FastifyRequest) {
  const user = await authenticate(db, request.headers.authorization);
  if (!user) throw new DomainError('UNAUTHENTICATED');
  return user.id;
}

export function registerGymRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get('/me/access', async request => {
    const userId = await actorId(db, request);
    return { ownedGyms: await db.gym.findMany({ where: {ownerAcceptedAt:{not:null},OR:[{ownerId:userId},{delegations:{some:{userId,active:true,fullAccess:true,branchId:null}},branches:{some:{staff:{some:{userId,role:'BRANCH_MANAGER',active:true}}}}}]}, select: { id: true, name: true, status: true }, take: 100 }),
      assignments: await db.staffAssignment.findMany({ where: { userId, active: true }, select: { id: true, role: true, branch: { select: { id: true, name: true, status: true, gymId: true, gym: { select: { status: true } } } } }, take: 100 }) };
  });
  app.post('/admin/gyms', { bodyLimit: 8192 }, async (r, reply) => reply.code(201).send(await createGym(db, await actorId(db, r), r.body)));
  app.get('/admin/gyms', async r => {
    const userId = await actorId(db, r); const args = pagination(r);
    return db.$transaction(async tx => { await requireAdmin(tx, userId); return page(await tx.gym.findMany({ ...args, include: { owner: { select: { id: true, displayName: true, email: true, phoneE164: true, isActive: true } } } }), args.take); });
  });
  app.get('/admin/gyms/:gymId', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId');
    return db.$transaction(async tx => {
      await requireAdmin(tx, userId);
      const gym = await tx.gym.findUnique({ where: { id: gymId }, include: { owner: { select: { id: true, displayName: true, email: true, phoneE164: true, isActive: true } } } });
      if (!gym) throw new DomainError('NOT_FOUND');
      return gym;
    });
  });
  app.get('/admin/gyms/:gymId/branches', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId'), args = pagination(r);
    return db.$transaction(async tx => {
      await requireAdmin(tx, userId);
      if (!await tx.gym.findUnique({ where: { id: gymId }, select: { id: true } })) throw new DomainError('NOT_FOUND');
      return page(await tx.branch.findMany({ ...args, where: { gymId }, include: { pointAccounts: { where: { type: 'BRANCH_INVENTORY' }, select: { balance: true } },pricingRequests:{where:{status:'PENDING'},orderBy:{createdAt:'desc'},take:1} } }), args.take);
    });
  });
  app.get('/admin/gyms/:gymId/invitations', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId'), args = pagination(r);
    return db.$transaction(async tx => { await requireAdmin(tx, userId);
      if (!await tx.gym.findUnique({ where: { id: gymId }, select: { id: true } })) throw new DomainError('NOT_FOUND');
      return page(await tx.staffInvitation.findMany({ ...args, where: { gymId, type: 'OWNER' }, select: { id: true, userId: true, branchId: true, type: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, user: { select: { displayName: true, email: true, phoneE164: true } }, branch: { select: { name: true } } } }), args.take);
    });
  });
  app.post('/admin/gyms/:gymId/branches/:branchId/approve-setup',async r=>approveBranchSetup(db,await actorId(db,r),id(r,'gymId'),id(r,'branchId'),r.body));
  app.patch('/admin/gyms/:gymId/status', async r => setGymStatus(db, await actorId(db, r), id(r, 'gymId'), r.body));
  app.post('/admin/gyms/:gymId/owner-invitations', async r => reissueOwnerInvitation(db, await actorId(db, r), id(r, 'gymId')));
  app.patch('/admin/branches/:branchId/status', async r => setBranchStatus(db, await actorId(db, r), id(r, 'branchId'), r.body));
  app.get('/admin/price-change-requests', async r => {
    const userId = await actorId(db, r); const args = pagination(r);
    return db.$transaction(async tx => { await requireAdmin(tx, userId); return page(await tx.branchPricingRequest.findMany({ ...args, where: { status: 'PENDING' }, include: { branch: { select: { id: true, name: true, gymId: true, gym: { select: { name: true, status: true } } } } } }), args.take); });
  });
  app.post('/admin/price-change-requests/:requestId/review', async r => reviewPricing(db, await actorId(db, r), id(r, 'requestId'), r.body));
  app.put('/gyms/:gymId/delegations',async r=>saveDelegation(db,await actorId(db,r),id(r,'gymId'),r.body));
  app.get('/gyms/:gymId/delegations',async r=>{const actor=await actorId(db,r),gymId=id(r,'gymId');await requireActor(db,actor);const gym=await db.gym.findUnique({where:{id:gymId}});if(gym?.ownerId!==actor)throw new DomainError('GYM_ACCESS_DENIED');return {items:await db.staffDelegation.findMany({where:{gymId},orderBy:{id:'asc'},take:500})};});
  app.get('/gyms', async r => {
    const userId = await actorId(db, r); const args = pagination(r);
    return page(await db.gym.findMany({ ...args, where: {ownerAcceptedAt:{not:null},OR:[{ownerId:userId},{delegations:{some:{userId,active:true,fullAccess:true,branchId:null}},branches:{some:{staff:{some:{userId,role:'BRANCH_MANAGER',active:true}}}}}]} }), args.take);
  });
  app.get('/gyms/:gymId', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId');
    return db.$transaction(async tx => ({...await requireGymOwner(tx,userId,gymId,false),canDelegate:(await tx.gym.findUnique({where:{id:gymId}}))?.ownerId===userId}));
  });
  app.patch('/gyms/:gymId', async r => updateGym(db, await actorId(db, r), id(r, 'gymId'), r.body));
  app.get('/gyms/:gymId/branches', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId'), args = pagination(r);
    return db.$transaction(async tx => { await requireGymOwner(tx, userId, gymId, false); return page(await tx.branch.findMany({ ...args, where: { gymId }, include: { pointAccounts: { where: { type: 'BRANCH_INVENTORY' }, select: { balance: true } } } }), args.take); });
  });
  app.post('/gyms/:gymId/branches', { bodyLimit: 8192 }, async (r, reply) => reply.code(201).send(await createBranch(db, await actorId(db, r), id(r, 'gymId'), r.body)));
  app.patch('/gyms/:gymId/branches/:branchId', async r => updateBranch(db, await actorId(db, r), id(r, 'gymId'), id(r, 'branchId'), r.body));
  app.post('/gyms/:gymId/branches/:branchId/price-change-requests', async (r, reply) => reply.code(201).send(await requestPricing(db, await actorId(db, r), id(r, 'gymId'), id(r, 'branchId'), r.body)));
  app.get('/gyms/:gymId/branches/:branchId/pricing-history', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId'), branchId = id(r, 'branchId'), args = pagination(r);
    return db.$transaction(async tx => {
      await requireGymOwner(tx, userId, gymId, false);
      if (!await tx.branch.findFirst({ where: { id: branchId, gymId }, select: { id: true } })) throw new DomainError('BRANCH_ACCESS_DENIED');
      return page(await tx.branchPricingRequest.findMany({ ...args, where: { branchId } }), args.take);
    });
  });
  app.post('/gyms/:gymId/staff-invitations', { bodyLimit: 8192 }, async (r, reply) => reply.code(201).send(await inviteStaff(db, await actorId(db, r), id(r, 'gymId'), r.body)));
  app.get('/gyms/:gymId/staff', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId');
    const query = parse(pageSchema.extend({ branchId: idSchema.optional() }), r.query);
    const args = { take: query.limit + 1, orderBy: { id: 'asc' as const },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) };
    return db.$transaction(async tx => { if(query.branchId&&!(await authority(tx,userId,gymId)).full)await requirePermission(tx,userId,gymId,'MANAGE_CASHIERS',query.branchId);else await requireGymOwner(tx, userId, gymId, false); const canDelegate=(await tx.gym.findUnique({where:{id:gymId}}))?.ownerId===userId;const result=page(await tx.staffAssignment.findMany({ ...args, where: { branch: { gymId }, ...(query.branchId ? { branchId: query.branchId } : {}) }, select: { id: true, branchId: true, role: true, active: true, branch: { select: { name: true } }, user: { select: { id: true, displayName: true, email: true, phoneE164: true } } } }), args.take);return {...result,items:result.items.map(s=>({...s,canDelegate}))}; });
  });
  app.patch('/gyms/:gymId/staff/:assignmentId', async r => setStaffActive(db, await actorId(db, r), id(r, 'gymId'), id(r, 'assignmentId'), r.body));
  app.get('/gyms/:gymId/invitations', async r => {
    const userId = await actorId(db, r), gymId = id(r, 'gymId'), args = pagination(r);
    return db.$transaction(async tx => { await requireGymOwner(tx, userId, gymId, false); return page(await tx.staffInvitation.findMany({ ...args, where: { gymId }, select: { id: true, userId: true, branchId: true, type: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true, user: { select: { displayName: true, email: true, phoneE164: true } }, branch: { select: { name: true } } } }), args.take); });
  });
  app.post('/invitations/:invitationId/revoke', async r => revokeInvitation(db, await actorId(db, r), id(r, 'invitationId')));
  app.get('/branches/:branchId/manage', async r => {
    const userId = await actorId(db, r), branchId = id(r, 'branchId');
    return db.$transaction(async tx => {
      const user = await requireActor(tx, userId);
      const branch = await tx.branch.findUnique({ where: { id: branchId }, include: { gym: { include: { owner: { select: { isActive: true } } } } } });
      if (!branch || branch.gym.status !== 'ACTIVE' || !branch.gym.ownerAcceptedAt || !branch.gym.owner.isActive || branch.status === 'SUSPENDED') throw new DomainError('BRANCH_ACCESS_DENIED');
      const owns = branch.gym.ownerId === userId && branch.gym.ownerAcceptedAt;
      if (user.role !== 'PLATFORM_ADMIN' && !owns && !await tx.staffAssignment.findFirst({ where: { userId, branchId, active: true } })&&!(await authority(tx,userId,branch.gymId,branchId)).full) throw new DomainError('BRANCH_ACCESS_DENIED');
      const { gym: _gym, ...metadata } = branch;
      return metadata;
    });
  });
  app.get('/branches', async r => {
    const args = pagination(r);
    const where: Prisma.BranchWhereInput = { status: 'ACTIVE', priceApprovedAt: { not: null }, pricingVersion: { gt: 0 }, latitude: { not: null }, longitude: { not: null }, gym: { status: 'ACTIVE', owner: { isActive: true }, ownerAcceptedAt: { not: null } } };
    const rows = await db.branch.findMany({ ...args, where, select: { id: true, name: true, address: true, governorate: true, city: true, latitude: true, longitude: true, contactPhone: true, openingHours: true, visitPricePoints: true, sessionMinutes: true, gym: { select: { id: true, name: true } } } });
    return page(rows, args.take);
  });
}

