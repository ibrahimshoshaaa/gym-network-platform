import {authority} from "../auth/delegation.js";
import { Prisma,type PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorId } from "../gyms/routes.js";
import { requireActor, requireAdmin } from "../auth/authorization.js";
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
  app.get('/reports/platform-balances',async r=>{
    const id=await actorId(db,r);await requireAdmin(db,id);await consumeAuthLimit(db,'platform-balances',id,60,900);
    const q=parse(z.object({kind:z.enum(['TRAINEES','GYMS']),cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(25).default(25)}).strict(),r.query);
    return db.$transaction(async tx=>{await requireAdmin(tx,id);await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    if(q.kind==='TRAINEES'){
      const rows=await tx.pointAccount.findMany({where:{type:'TRAINEE_WALLET',...(q.cursor?{id:{gt:q.cursor}}:{})},orderBy:{id:'asc'},take:q.limit+1,select:{id:true,balance:true,expiresAt:true,ownerUser:{select:{displayName:true}}}});
      return {items:rows.slice(0,q.limit).map(a=>({id:a.id,name:a.ownerUser?.displayName??'حساب متدرب',points:String(a.balance),expiresAt:a.expiresAt})),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};
    }
    const gyms=await tx.gym.findMany({where:q.cursor?{id:{gt:q.cursor}}:{},orderBy:{id:'asc'},take:q.limit+1,select:{id:true,name:true}}),ids=gyms.slice(0,q.limit).map(g=>g.id);
    if(!ids.length)return {items:[],nextCursor:null};
    const [stocks,money]=await Promise.all([
      tx.$queryRaw<{gymId:string;points:string}[]>(Prisma.sql`SELECT coalesce(a."gymId",b."gymId") AS "gymId",sum(a.balance)::text AS points FROM "PointAccount" a LEFT JOIN "Branch" b ON b.id=a."branchId" WHERE a.type IN ('BRANCH_INVENTORY','GYM_INVENTORY') AND coalesce(a."gymId",b."gymId") IN (${Prisma.join(ids.map(id=>Prisma.sql`${id}::uuid`))}) GROUP BY coalesce(a."gymId",b."gymId")`),
      tx.moneyAccount.groupBy({by:['gymId','type'],where:{gymId:{in:ids},type:{in:['GYM_AVAILABLE','GYM_RESERVED','GYM_DISPUTED']}},_sum:{balancePiasters:true}})
    ]);
    const due=await tx.gymServiceCharge.groupBy({by:['gymId'],where:{gymId:{in:ids},voidedAt:null,dueAt:{lte:new Date()}},_sum:{amountPiasters:true}});
    const collected=await tx.gymChargeCollection.groupBy({by:['gymId'],where:{gymId:{in:ids}},_sum:{amountPiasters:true}});
    return {items:gyms.slice(0,q.limit).map(g=>{const amount=(t:string)=>money.find(m=>m.gymId===g.id&&m.type===t)?._sum.balancePiasters??0n;const available=amount('GYM_AVAILABLE'),reserved=amount('GYM_RESERVED'),disputed=amount('GYM_DISPUTED');const debt=(due.find(c=>c.gymId===g.id)?._sum.amountPiasters??0n)-(collected.find(c=>c.gymId===g.id)?._sum.amountPiasters??0n);return {...g,debtPiasters:debt.toString(),netAvailablePiasters:(available>debt?available-debt:0n).toString(),points:stocks.find(s=>s.gymId===g.id)?.points??'0',available:available.toString(),reserved:reserved.toString(),disputed:disputed.toString(),total:(available+reserved+disputed).toString()};}),nextCursor:gyms.length>q.limit?gyms[q.limit-1]!.id:null};
    },{isolationLevel:'RepeatableRead',timeout:15000});
  });

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
        items: await Promise.all(gyms.slice(0, q.limit).map(async (g) => ({
          id: g.id,
          name: g.name,
          canFinance: admin || Boolean(g.ownerId === id && g.ownerAcceptedAt)||(await authority(tx,id,g.id)).full,
        }))),
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
          Boolean(g?.ownerId === id && g.ownerAcceptedAt)||(await authority(tx,id,gymId)).full;
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

