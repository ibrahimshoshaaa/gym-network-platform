import {chargeSummary,settleGymCharges} from '../charges/service.js';
import {authority,requirePermission} from "../auth/delegation.js";
import {branchEntitlements} from "./allocation.js";
import { withdrawalBalances } from "./balances.js";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import { requireAdmin, requireGymOwner } from "../auth/authorization.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { uuid } from "../operations/service.js";
import { DomainError } from "../domain/errors.js";
import {
  cancelWithdrawal,
  decideWithdrawal,
  feedbackWithdrawal,
  payWithdrawal,
  publishCalendar,
  requestWithdrawal,
  withdrawalView,
} from "./service.js";
const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: uuid.optional(),
    branchId:uuid.optional(),
  })
  .strict();
export function registerWithdrawalRoutes(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.get('/operations/branches/:branchId/entitlements',async r=>{const actor=await actorId(db,r),branchId=parse(uuid,(r.params as {branchId:string}).branchId);return db.$transaction(async tx=>{const branch=await tx.branch.findUnique({where:{id:branchId}});if(!branch)throw new DomainError('NOT_FOUND');await requirePermission(tx,actor,branch.gymId,'REQUEST_WITHDRAWAL',branchId);const row=(await branchEntitlements(tx,branch.gymId)).find(b=>b.id===branchId)!;const net=BigInt((await chargeSummary(tx,branch.gymId)).netAvailablePiasters);const available=row.available<net?row.available:net;return {...row,earned:row.earned.toString(),committed:row.committed.toString(),disputed:row.disputed.toString(),available:available.toString()};},{isolationLevel:'RepeatableRead'});});
  for(const admin of [false,true])app.get(admin?'/admin/gyms/:gymId/service-charges':'/gyms/:gymId/service-charges',async r=>{
   const actor=await actorId(db,r),gymId=parse(uuid,(r.params as {gymId:string}).gymId);
   if(admin)await requireAdmin(db,actor);else await requireGymOwner(db,actor,gymId,false);
   return settleGymCharges(db,gymId,actor);
  });
  app.get("/admin/withdrawal-calendar", async (r) => {
    await requireAdmin(db, await actorId(db, r));
    return {
      calendar: await db.withdrawalCalendar.findFirst({
        orderBy: { version: "desc" },
      }),
    };
  });
  app.post("/admin/withdrawal-calendar", async (r) =>
    publishCalendar(db, await actorId(db, r), r.body),
  );
  app.post("/gyms/:gymId/withdrawals", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "withdraw-submit", id, 20, 900);
    return requestWithdrawal(
      db,
      id,
      parse(uuid, (r.params as { gymId: string }).gymId),
      parse(uuid, r.headers["idempotency-key"]),
      r.body,
    );
  });
  for (const admin of [false, true])
    app.get(
      admin ? "/admin/withdrawals" : "/gyms/:gymId/withdrawals",
      async (r) => {
        const id = await actorId(db, r),
          q = parse(pageSchema, r.query),
          gymId = admin
            ? undefined
            : parse(uuid, (r.params as { gymId: string }).gymId);
        return db.$transaction(async (tx) => {
          if (admin) await requireAdmin(tx, id);
          else if(q.branchId)await requirePermission(tx,id,gymId!,'REQUEST_WITHDRAWAL',q.branchId);else await requireGymOwner(tx, id, gymId!, false);
          const rows = await tx.withdrawalRequest.findMany({
            where: {...(gymId?{gymId}:{}),...(q.branchId?{branchId:q.branchId}:{})},
            take: q.limit + 1,
            orderBy: { id: "asc" },
            ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
          });
          return {
            items: rows.slice(0, q.limit).map(withdrawalView),
            nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
          };
        });
      },
    );
  app.get("/withdrawals/:id", async (r) => {
    const actor = await actorId(db, r),
      id = parse(uuid, (r.params as { id: string }).id);
    return db.$transaction(async (tx) => {
      const row = await tx.withdrawalRequest.findUnique({ where: { id } });
      if (!row) throw new DomainError("NOT_FOUND");
      const user = await tx.user.findUniqueOrThrow({ where: { id: actor } });
      if (user.role === "PLATFORM_ADMIN") await requireAdmin(tx, actor);
      else if(row.branchId)await requirePermission(tx,actor,row.gymId,'REQUEST_WITHDRAWAL',row.branchId);else await requireGymOwner(tx, actor, row.gymId, false);
      const gym = await tx.gym.findUniqueOrThrow({
        where: { id: row.gymId },
        select: { name: true },
      });
      return {
        withdrawal: withdrawalView(row),
        gymName: gym.name,
        serviceCharges: user.role==='PLATFORM_ADMIN'||(await authority(tx,actor,row.gymId)).full?await chargeSummary(tx,row.gymId):null,
        balances: user.role==='PLATFORM_ADMIN'||(await authority(tx,actor,row.gymId)).full?await withdrawalBalances(tx,row):null,
        feedback: await tx.withdrawalFeedback.findUnique({
          where: { withdrawalId: id },
        }),
        actions: await tx.withdrawalAction.findMany({
          where: { withdrawalId: id },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            kind: true,
            actorId: true,
            reason: true,
            createdAt: true,
          },
        }),
      };
    }, { isolationLevel: "RepeatableRead", timeout: 10000 });
  });
  for (const action of ["cancel", "feedback", "review", "payment"] as const)
    app.post(
      `${["review", "payment"].includes(action) ? "/admin" : ""}/withdrawals/:id/${action}`,
      async (r) => {
        const actor = await actorId(db, r),
          id = parse(uuid, (r.params as { id: string }).id),
          key = parse(uuid, r.headers["idempotency-key"]);
        await consumeAuthLimit(db, "withdraw-action", actor, 60, 900);
        return {
          cancel: cancelWithdrawal,
          feedback: feedbackWithdrawal,
          review: decideWithdrawal,
          payment: payWithdrawal,
        }[action](db, actor, id, key, r.body);
      },
    );
}
