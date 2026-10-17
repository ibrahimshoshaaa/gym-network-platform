import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import {
  requireActor,
  requireAdmin,
  requireGymOwner,
} from "../auth/authorization.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { DomainError } from "../domain/errors.js";
import {
  confirmVisit,
  issueQr,
  lookupTrainee,
  previewVisit,
  quoteSale,
  readBranch,
  saleView,
  sellPoints,
  uuid,
  visitView,
} from "./service.js";
const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: uuid.optional(),
  })
  .strict();
function args(r: FastifyRequest) {
  const q = parse(pageSchema, r.query);
  return {
    take: q.limit + 1,
    orderBy: { id: "asc" as const },
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  };
}
function page<T extends { id: string }, U>(
  rows: T[],
  take: number,
  view: (row: T) => U,
) {
  return {
    items: rows.slice(0, take - 1).map(view),
    nextCursor: rows.length === take ? rows[take - 2]!.id : null,
  };
}
const branchId = (r: FastifyRequest) =>
  parse(uuid, (r.params as { branchId: string }).branchId);
export function registerOperationRoutes(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.get("/operations/branches", async (r) => {
    const id = await actorId(db, r);
    return db.$transaction(async (tx) => {
      await requireActor(tx, id);
      const rows = await tx.staffAssignment.findMany({
        where: {
          userId: id,
          active: true,
          branch: {
            status: "ACTIVE",
            gym: {
              status: "ACTIVE",
              ownerAcceptedAt: { not: null },
              owner: { isActive: true },
            },
          },
        },
        select: {
          role: true,
          branch: {
            select: { id: true, name: true, gym: { select: { name: true } } },
          },
        },
        take: 100,
      });
      const map = new Map<
        string,
        {
          id: string;
          name: string;
          gymName: string;
          canSell: boolean;
          canCancel: boolean;
        }
      >();
      for (const row of rows) {
        const old = map.get(row.branch.id);
        map.set(row.branch.id, {
          id: row.branch.id,
          name: row.branch.name,
          gymName: row.branch.gym.name,
          canSell: row.role === "CASHIER" || Boolean(old?.canSell),
          canCancel: row.role === "BRANCH_MANAGER" || Boolean(old?.canCancel),
        });
      }
      return { items: [...map.values()] };
    });
  });
  app.get("/operations/branches/:branchId/summary", async (r) => {
    const id = await actorId(db, r),
      branch = branchId(r);
    return db.$transaction(async (tx) => {
      const b = await readBranch(tx, id, branch);
      return {
        id: b.id,
        name: b.name,
        visitPricePoints: b.visitPricePoints,
        sessionMinutes: b.sessionMinutes,
        stock:
          (
            await tx.pointAccount.findUnique({
              where: {
                type_branchId: { type: "BRANCH_INVENTORY", branchId: branch },
              },
            })
          )?.balance ?? 0,
      };
    });
  });
  app.post("/cashier/branches/:branchId/trainee-lookup", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "trainee-lookup", id, 20, 900);
    return lookupTrainee(db, id, branchId(r), r.body);
  });
  app.post("/cashier/branches/:branchId/sale-quotes", async (r) =>
    quoteSale(db, await actorId(db, r), branchId(r), r.body),
  );
  app.post("/cashier/branches/:branchId/sales", async (r, reply) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "cashier-sale", id, 120, 3600);
    return reply
      .code(201)
      .send(
        await sellPoints(
          db,
          id,
          branchId(r),
          parse(uuid, r.headers["idempotency-key"]),
          r.body,
        ),
      );
  });
  app.post("/cashier/branches/:branchId/visit-previews", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "qr-preview", id, 120, 900);
    return previewVisit(db, id, branchId(r), r.body);
  });
  app.post("/cashier/branches/:branchId/visits", async (r, reply) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "qr-entry", id, 120, 900);
    return reply
      .code(201)
      .send(
        await confirmVisit(
          db,
          id,
          branchId(r),
          parse(uuid, r.headers["idempotency-key"]),
          r.body,
        ),
      );
  });
  app.post("/trainee/qr", async (r) => {
    const id = await actorId(db, r);
    await consumeAuthLimit(db, "qr-issue", id, 12, 60);
    return issueQr(db, id, r.headers.authorization!.slice(7));
  });
  app.get("/trainee/visits", async (r) => {
    const id = await actorId(db, r),
      p = args(r);
    return db.$transaction(async (tx) => {
      const user = await requireActor(tx, id);
      if (user.role !== "TRAINEE") throw new DomainError("ACCESS_DENIED");
      return page(
        await tx.visit.findMany({ ...p, where: { traineeId: id } }),
        p.take,
        visitView,
      );
    });
  });
  for (const kind of ["sales", "visits"] as const)
    app.get(`/operations/branches/:branchId/${kind}`, async (r) => {
      const id = await actorId(db, r),
        branch = branchId(r),
        p = args(r);
      return db.$transaction(async (tx) => {
        await readBranch(tx, id, branch);
        return kind === "sales"
          ? page(
              await tx.pointSale.findMany({
                ...p,
                where: { branchId: branch },
              }),
              p.take,
              saleView,
            )
          : page(
              await tx.visit.findMany({ ...p, where: { branchId: branch } }),
              p.take,
              visitView,
            );
      });
    });
  for (const admin of [false, true])
    app.get(`${admin ? "/admin" : ""}/gyms/:gymId/receivables`, async (r) => {
      const id = await actorId(db, r),
        gymId = parse(uuid, (r.params as { gymId: string }).gymId);
      return db.$transaction(async (tx) => {
        if (admin) await requireAdmin(tx, id);
        else await requireGymOwner(tx, id, gymId, false);
        const rows = await tx.moneyAccount.findMany({
          where: { gymId, branchId: null },
        });
        return {
          gymId,
          accounts: rows.map((a) => ({
            type: a.type,
            balancePiasters: a.balancePiasters.toString(),
          })),
        };
      });
    });
}
