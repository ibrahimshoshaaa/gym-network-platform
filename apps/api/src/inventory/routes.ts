import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import { readBranch } from "../operations/service.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { transferStock } from "../ledger/service.js";
import { id, pageSchema, transferSchema } from "./validation.js";
export function registerInventoryRoutes(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.post("/gyms/:gymId/stock-transfers", async (r, reply) => {
    const owner = await actorId(db, r),
      gymId = parse(id, (r.params as { gymId: string }).gymId),
      data = parse(transferSchema, r.body),
      key = parse(id, r.headers["idempotency-key"]);
    await consumeAuthLimit(db, "stock-transfer", owner, 120, 3600);
    const result = await transferStock(db, {
      actorId: owner,
      gymId,
      ...data,
      idempotencyKey: `stock:${owner}:${key}`,
    });
    return reply.code(201).send({ id: result.pointTransactionId, ...data });
  });
  app.get("/inventory/branches/:branchId", async (r) => {
    const actor = await actorId(db, r),
      branchId = parse(id, (r.params as { branchId: string }).branchId);
    return db.$transaction(async (tx) => {
      const branch = await readBranch(tx, actor, branchId);
      const account = await tx.pointAccount.findUnique({
        where: { type_branchId: { type: "BRANCH_INVENTORY", branchId } },
      });
      return {
        id: branch.id,
        gymId: branch.gymId,
        name: branch.name,
        status: branch.status,
        gymStatus: branch.gym.status,
        stock: account?.balance ?? 0,
      };
    });
  });
  app.get("/inventory/branches/:branchId/movements", async (r) => {
    const actor = await actorId(db, r),
      branchId = parse(id, (r.params as { branchId: string }).branchId),
      p = parse(pageSchema, r.query);
    await consumeAuthLimit(db, "stock-history", actor, 120, 900);
    return db.$transaction(
      async (tx) => {
        const branch = await readBranch(tx, actor, branchId);
        const rows = await tx.pointPosting.findMany({
          where: {
            account: { type: "BRANCH_INVENTORY", branchId },
            transaction: { posted: true },
            ...(p.cursor ? { id: { gt: p.cursor } } : {}),
          },
          orderBy: { id: "asc" },
          take: p.limit + 1,
          select: {
            id: true,
            delta: true,
            transaction: {
              select: {
                id: true,
                kind: true,
                createdAt: true,
                actorId: true,
                referenceId: true,
                postings: {
                  select: {
                    delta: true,
                    account: {
                      select: {
                        type: true,
                        branchId: true,
                        branch: { select: { gymId: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        return {
          items: rows.slice(0, p.limit).map((row) => ({
            id: row.id,
            delta: row.delta,
            transactionId: row.transaction.id,
            kind: row.transaction.kind,
            operation:
              row.transaction.kind === "TRANSFER"
                ? row.transaction.postings.filter(
                    (p) => p.account.type === "BRANCH_INVENTORY",
                  ).length === 2
                  ? "BRANCH_TRANSFER"
                  : row.transaction.postings.some(
                        (p) => p.account.type === "TRAINEE_WALLET",
                      )
                    ? "SALE"
                    : "TRANSFER"
                : row.transaction.kind,
            createdAt: row.transaction.createdAt,
            actorId: row.transaction.actorId,
            referenceId: row.transaction.referenceId,
            otherBranchId:
              row.transaction.kind === "TRANSFER"
                ? (row.transaction.postings.find(
                    (p) =>
                      p.account.type === "BRANCH_INVENTORY" &&
                      p.account.branchId !== branchId &&
                      p.account.branch?.gymId === branch.gymId,
                  )?.account.branchId ?? null)
                : null,
          })),
          nextCursor: rows.length > p.limit ? rows[p.limit - 1]!.id : null,
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  });
}
