import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { traineeVisits, walletMovements, walletSummary } from "./service.js";
export function registerWalletRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/trainee/wallet", async (r) => {
    const actor = await actorId(db, r);
    parse(z.object({}).strict(), r.query);
    await consumeAuthLimit(db, "wallet-read", actor, 120, 900);
    return walletSummary(db, actor);
  });
  app.get("/trainee/wallet/movements", async (r) => {
    const actor = await actorId(db, r);
    await consumeAuthLimit(db, "wallet-history", actor, 120, 900);
    return walletMovements(db, actor, r.query);
  });
  for (const active of [false, true])
    app.get(
      active ? "/trainee/active-visits" : "/trainee/visits",
      async (r) => {
        const actor = await actorId(db, r);
        await consumeAuthLimit(db, "trainee-visits", actor, 120, 900);
        return traineeVisits(db, actor, r.query, active);
      },
    );
}
