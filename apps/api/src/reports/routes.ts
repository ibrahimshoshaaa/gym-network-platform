import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { requireActor } from "../auth/authorization.js";
import { parse } from "../gyms/validation.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { uuid } from "../operations/service.js";
import { DomainError } from "../domain/errors.js";
import { reportCsv, reportRows, reportSummary } from "./service.js";
import { rowsSchema } from "./validation.js";
const page = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: uuid.optional(),
  })
  .strict();
export function registerReportRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/reports/gyms", async (r) => {
    const id = await actorId(db, r),
      q = parse(page, r.query);
    return db.$transaction(async (tx) => {
      const user = await requireActor(tx, id),
        admin = user.role === "PLATFORM_ADMIN";
      const gyms = await tx.gym.findMany({
        where: admin
          ? {}
          : {
              OR: [
                { ownerId: id, ownerAcceptedAt: { not: null } },
                {
                  branches: {
                    some: { staff: { some: { userId: id, active: true } } },
                  },
                },
              ],
            },
        orderBy: { id: "asc" },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        select: { id: true, name: true, ownerId: true, ownerAcceptedAt: true },
      });
      return {
        items: gyms.slice(0, q.limit).map((g) => ({
          id: g.id,
          name: g.name,
          canFinance: admin || Boolean(g.ownerId === id && g.ownerAcceptedAt),
        })),
        nextCursor: gyms.length > q.limit ? gyms[q.limit - 1]!.id : null,
      };
    });
  });
  app.get("/reports/gyms/:gymId/branches", async (r) => {
    const id = await actorId(db, r),
      gymId = parse(uuid, (r.params as { gymId: string }).gymId),
      q = parse(page, r.query);
    return db.$transaction(async (tx) => {
      const user = await requireActor(tx, id),
        g = await tx.gym.findUnique({ where: { id: gymId } }),
        all =
          user.role === "PLATFORM_ADMIN" ||
          Boolean(g?.ownerId === id && g.ownerAcceptedAt);
      if (
        !all &&
        !(await tx.staffAssignment.findFirst({
          where: { userId: id, active: true, branch: { gymId } },
        }))
      )
        throw new DomainError("GYM_ACCESS_DENIED");
      const branches = await tx.branch.findMany({
        where: {
          gymId,
          ...(!all ? { staff: { some: { userId: id, active: true } } } : {}),
        },
        select: { id: true, gymId: true, name: true },
        orderBy: { id: "asc" },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      return {
        items: branches.slice(0, q.limit),
        nextCursor:
          branches.length > q.limit ? branches[q.limit - 1]!.id : null,
      };
    });
  });
  app.get("/reports/summary", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "report-summary", id, 60, 900);
    return reportSummary(db, id, r.query);
  });
  app.get("/reports/rows", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "report-rows", id, 120, 900);
    return reportRows(db, id, r.query);
  });
  app.get("/reports/export", async (r, reply) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "report-export", id, 10, 900);
    const f = parse(rowsSchema, r.query);
    if (f.cursor) throw new DomainError("INVALID_INPUT");
    const data = await reportRows(db, id, f, true);
    return reply
      .type("text/csv; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename="gym-report-${f.kind.toLowerCase()}-${f.from}-${f.to}.csv"`,
      )
      .header("X-Content-Type-Options", "nosniff")
      .send(reportCsv(data.items));
  });
}
