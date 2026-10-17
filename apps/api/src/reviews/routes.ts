import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "../domain/errors.js";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import { requireActor, requireAdmin } from "../auth/authorization.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { uuid, saleView, visitView } from "../operations/service.js";
import {
  cancelVisit,
  decideReview,
  requestReview,
  reviewView,
} from "./service.js";
export function registerReviewRoutes(app: FastifyInstance, db: PrismaClient) {
  app.post(
    "/operations/branches/:branchId/visits/:visitId/cancel",
    async (r) => {
      const id = await actorId(db, r);
      const p = parse(
        z.object({ branchId: uuid, visitId: uuid }).strict(),
        r.params,
      );
      await consumeAuthLimit(db, "visit-cancel", id, 30, 900);
      return cancelVisit(
        db,
        id,
        p.branchId,
        p.visitId,
        parse(uuid, r.headers["idempotency-key"]),
        r.body,
      );
    },
  );
  app.post("/operation-reviews", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "operation-review", id, 20, 900);
    return requestReview(
      db,
      id,
      parse(uuid, r.headers["idempotency-key"]),
      r.body,
    );
  });
  for (const admin of [false, true])
    app.get(
      admin ? "/admin/operation-reviews" : "/operation-reviews",
      async (r) => {
        const id = await actorId(db, r);
        const q = parse(
          z
            .object({
              limit: z.coerce.number().int().min(1).max(100).default(25),
              cursor: uuid.optional(),
            })
            .strict(),
          r.query,
        );
        return db.$transaction(async (tx) => {
          if (admin) await requireAdmin(tx, id);
          else await requireActor(tx, id);
          const rows = await tx.operationReview.findMany({
            where: admin ? {} : { requestorId: id },
            orderBy: { id: "asc" },
            take: q.limit + 1,
            ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
          });
          return {
            items: rows.slice(0, q.limit).map(reviewView),
            nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
          };
        });
      },
    );
  app.get("/admin/operation-reviews/:id", async (r) => {
    const actor = await actorId(db, r),
      id = parse(uuid, (r.params as { id: string }).id);
    return db.$transaction(async (tx) => {
      await requireAdmin(tx, actor);
      const row = await tx.operationReview.findUnique({ where: { id } });
      if (!row) throw new DomainError("NOT_FOUND");
      const branch = await tx.branch.findUniqueOrThrow({
        where: { id: row.branchId },
        include: { gym: true },
      });
      const target = row.visitId
        ? visitView(
            await tx.visit.findUniqueOrThrow({ where: { id: row.visitId } }),
          )
        : saleView(
            await tx.pointSale.findUniqueOrThrow({
              where: { id: row.saleId! },
            }),
          );
      return {
        review: reviewView(row),
        branchName: branch.name,
        gymName: branch.gym.name,
        target,
      };
    });
  });
  app.post("/admin/operation-reviews/:id/review", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "operation-decision", id, 60, 900);
    return decideReview(
      db,
      id,
      parse(uuid, (r.params as { id: string }).id),
      r.body,
    );
  });
}
