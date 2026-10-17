import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { parse } from "../gyms/validation.js";
import { consumeAuthLimit } from "../auth/throttle.js";
import { browseBranches, branchDetails } from "./service.js";
export function registerDirectoryRoutes(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.get("/directory/branches", async (r) => {
    const actor = await actorId(db, r);
    await consumeAuthLimit(db, "directory", actor, 60, 900);
    return browseBranches(db, actor, r.query);
  });
  app.get("/directory/branches/:branchId", async (r) => {
    const actor = await actorId(db, r);
    await consumeAuthLimit(db, "directory", actor, 60, 900);
    return branchDetails(
      db,
      actor,
      parse(z.string().uuid(), (r.params as { branchId: string }).branchId),
    );
  });
}
