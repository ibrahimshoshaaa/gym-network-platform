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
  })
  .strict();
export function registerWithdrawalRoutes(
  app: FastifyInstance,
  db: PrismaClient,
) {
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
          else await requireGymOwner(tx, id, gymId!, false);
          const rows = await tx.withdrawalRequest.findMany({
            where: gymId ? { gymId } : {},
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
      else await requireGymOwner(tx, actor, row.gymId, false);
      const gym = await tx.gym.findUniqueOrThrow({
        where: { id: row.gymId },
        select: { name: true },
      });
      return {
        withdrawal: withdrawalView(row),
        gymName: gym.name,
        balances: await withdrawalBalances(tx, row),
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
