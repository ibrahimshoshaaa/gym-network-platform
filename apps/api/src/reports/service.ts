import {chargeSummary} from '../charges/service.js';
import {authority} from "../auth/delegation.js";
import { platformFinance } from "./platform.js";
import { Prisma, type PrismaClient } from "@prisma/client";
import { requireActor, requireGymOwner } from "../auth/authorization.js";
import { DomainError } from "../domain/errors.js";
import { parse } from "../gyms/validation.js";
import { readBranch } from "../operations/service.js";
import {
  csvCell,
  filterSchema,
  period,
  rowsSchema,
  type Filter,
  type Kind,
} from "./validation.js";
type Tx = Prisma.TransactionClient;
type Scope = {
  gymId?: string;
  branchId?: string;
  admin: boolean;
  finance: boolean;
  purchases: boolean;
};
export type ReportRow = {
  id: string;
  referenceId: string;
  eventAt: Date;
  gymId: string | null;
  gymName: string | null;
  branchId: string | null;
  branchName: string | null;
  status: string;
  points: string | null;
  amountPiasters: string;
  actorId: string | null;
};
async function scope(tx: Tx, actorId: string, f: Filter): Promise<Scope> {
  const actor = await requireActor(tx, actorId),
    admin = actor.role === "PLATFORM_ADMIN";
  let gymId = f.gymId;
  if (f.branchId) {
    const b = await readBranch(tx, actorId, f.branchId);
    if (gymId && gymId !== b.gymId)
      throw new DomainError("BRANCH_ACCESS_DENIED");
    gymId = b.gymId;
  }
  if (admin)
    return {
      gymId,
      branchId: f.branchId,
      admin: true,
      finance: !f.branchId,
      purchases: true,
    };
  if (!gymId) throw new DomainError("GYM_ACCESS_DENIED");
  const gym = await tx.gym.findUnique({ where: { id: gymId } });
  const owner = Boolean(gym?.ownerId === actorId && gym.ownerAcceptedAt)||(await authority(tx,actorId,gymId)).full;
  if (owner) {
    await requireGymOwner(tx, actorId, gymId, false);
    return {
      gymId,
      branchId: f.branchId,
      admin: false,
      finance: !f.branchId,
      purchases: true,
    };
  }
  if (!f.branchId) throw new DomainError("BRANCH_ACCESS_DENIED");
  await readBranch(tx, actorId, f.branchId);
  return {
    gymId,
    branchId: f.branchId,
    admin: false,
    finance: false,
    purchases: false,
  };
}
// Every source exposes the same minimal columns. No contact, beneficiary,
// image, token, transfer reference, reason text or request hash is selected.
function source(kind: Kind, now: Date): Prisma.Sql {
  switch (kind) {
    case "TOPUPS":
      return Prisma.sql`SELECT t.id,t."createdAt" AS "eventAt",t."reviewedAt" AS "completedAt",g.id AS "gymId",g.name AS "gymName",b.id AS "branchId",b.name AS "branchName",t.status::text AS status,t.points::bigint AS points,t."chargePiasters" AS amount,t."requestorUserId" AS "actorId",(t.status='APPROVED' AND EXISTS(SELECT 1 FROM "PointTransaction" p WHERE p.id=t."pointTransactionId" AND p.posted)) AS sealed FROM "TopupRequest" t LEFT JOIN "Branch" b ON b.id=t."receivingBranchId" LEFT JOIN "Gym" g ON g.id=coalesce(t."receivingGymId",b."gymId") UNION ALL SELECT d.id,d."createdAt",d."createdAt",g.id,g.name,b.id,b.name,'APPROVED'::text,d.points::bigint,d."chargePiasters",d."actorId",p.posted FROM "PointDispatch" d JOIN "PointTransaction" p ON p.id=d."pointTransactionId" LEFT JOIN "Gym" g ON g.id=d."gymId" LEFT JOIN "Branch" b ON b.id=d."branchId" WHERE d.kind='ADMIN_TOPUP'`;
    case "SALES":
      return Prisma.sql`SELECT s.id,s."createdAt" AS "eventAt",s."createdAt" AS "completedAt",g.id AS "gymId",g.name AS "gymName",b.id AS "branchId",b.name AS "branchName",'RECORDED'::text AS status,s.points::bigint AS points,s."chargePiasters" AS amount,s."cashierId" AS "actorId",true AS sealed FROM "PointSale" s JOIN "Branch" b ON b.id=s."branchId" JOIN "Gym" g ON g.id=b."gymId" UNION ALL SELECT d.id,d."createdAt",d."createdAt",g.id,g.name,NULL::uuid,NULL::text,'RECORDED'::text,d.points::bigint,d."chargePiasters",d."actorId",p.posted FROM "PointDispatch" d JOIN "Gym" g ON g.id=d."gymId" JOIN "PointTransaction" p ON p.id=d."pointTransactionId" WHERE d.kind='GYM_SALE'`;
    case "VISITS":
      return Prisma.sql`SELECT v.id,v."startedAt" AS "eventAt",v."startedAt" AS "completedAt",g.id AS "gymId",g.name AS "gymName",b.id AS "branchId",b.name AS "branchName",CASE WHEN v.status='ACTIVE' AND v."expiresAt"<=${now} THEN 'EXPIRED' ELSE v.status::text END AS status,v."pointsCharged"::bigint AS points,v."settlementPiasters" AS amount,v."cashierId" AS "actorId",true AS sealed FROM "Visit" v JOIN "Branch" b ON b.id=v."branchId" JOIN "Gym" g ON g.id=b."gymId"`;
    case "CANCELLATIONS":
      return Prisma.sql`SELECT c.id,v.id AS "referenceId",v."cancelledAt" AS "eventAt",v."cancelledAt" AS "completedAt",g.id AS "gymId",g.name AS "gymName",b.id AS "branchId",b.name AS "branchName",'CANCELLED'::text AS status,v."pointsCharged"::bigint AS points,v."settlementPiasters" AS amount,c."actorId",true AS sealed FROM "VisitCancellation" c JOIN "Visit" v ON v.id=c."visitId" JOIN "Branch" b ON b.id=v."branchId" JOIN "Gym" g ON g.id=b."gymId"`;
    case "WITHDRAWALS":
      return Prisma.sql`SELECT w.id,w."requestedAt" AS "eventAt",w."paidAt" AS "completedAt",g.id AS "gymId",g.name AS "gymName",NULL::uuid AS "branchId",NULL::text AS "branchName",w.status::text AS status,NULL::bigint AS points,w."amountPiasters" AS amount,w."requestorId" AS "actorId",(w."paidAt" IS NOT NULL) AS sealed FROM "WithdrawalRequest" w JOIN "Gym" g ON g.id=w."gymId"`;
  }
}
function scoped(s: Scope) {
  return Prisma.sql`true ${s.gymId ? Prisma.sql`AND r."gymId"=${s.gymId}::uuid` : Prisma.empty} ${s.branchId ? Prisma.sql`AND r."branchId"=${s.branchId}::uuid` : Prisma.empty}`;
}
async function aggregate(
  tx: Tx,
  s: Scope,
  kind: Kind,
  p: ReturnType<typeof period>,
  now: Date,
  completed = false,
) {
  const date = completed
    ? Prisma.sql`r."completedAt"`
    : Prisma.sql`r."eventAt"`;
  const [row] = await tx.$queryRaw<
    { count: string; points: string; amountPiasters: string }[]
  >(
    Prisma.sql`SELECT count(*)::text AS count,coalesce(sum(r.points),0)::text AS points,coalesce(sum(r.amount),0)::text AS "amountPiasters" FROM (${source(kind, now)}) r WHERE ${scoped(s)} AND ${date}>=${p.start} AND ${date}<${p.end} ${completed ? Prisma.sql`AND r.sealed` : Prisma.empty}`,
  );
  return row!;
}
async function reportTransaction<T>(
  db: PrismaClient,
  run: (tx: Tx) => Promise<T>,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
        return run(tx);
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2028" ||
        (error.code === "P2010" && String(error.meta?.code) === "57014"))
    )
      throw new DomainError("REPORT_BUSY");
    throw error;
  }
}
async function alerts(tx: Tx, s: Scope, now: Date) {
  const topupSource = source("TOPUPS", now);
  const [topups] = s.purchases
    ? await tx.$queryRaw<{ count: string; oldestAt: Date | null }[]>(
        Prisma.sql`SELECT count(*)::text AS count,min(r."eventAt") AS "oldestAt" FROM (${topupSource}) r WHERE ${scoped(s)} AND r.status='PENDING'`,
      )
    : [];
  const [reviews] = await tx.$queryRaw<
    { count: string; oldestAt: Date | null }[]
  >(
    Prisma.sql`SELECT count(*)::text AS count,min(q."createdAt") AS "oldestAt" FROM "OperationReview" q JOIN "Branch" b ON b.id=q."branchId" WHERE q.status='PENDING' ${s.gymId ? Prisma.sql`AND b."gymId"=${s.gymId}::uuid` : Prisma.empty} ${s.branchId ? Prisma.sql`AND b.id=${s.branchId}::uuid` : Prisma.empty}`,
  );
  const [withdrawals] = s.finance
    ? await tx.$queryRaw<
        {
          requested: string;
          approved: string;
          overdue: string;
          disputed: string;
        }[]
      >(
        Prisma.sql`SELECT count(*) FILTER(WHERE status='REQUESTED')::text AS requested,count(*) FILTER(WHERE status='APPROVED')::text AS approved,count(*) FILTER(WHERE status='APPROVED' AND "dueAt"<=${now})::text AS overdue,count(*) FILTER(WHERE status='DISPUTED')::text AS disputed FROM "WithdrawalRequest" WHERE true ${s.gymId ? Prisma.sql`AND "gymId"=${s.gymId}::uuid` : Prisma.empty}`,
      )
    : [];
  return {
    topups: topups ?? null,
    reviews: reviews!,
    withdrawals: withdrawals ?? null,
  };
}
export async function reportSummary(
  db: PrismaClient,
  actorId: string,
  input: unknown,
) {
  const f = parse(filterSchema, input),
    p = period(f);
  return reportTransaction(db, async (tx) => {
    const s = await scope(tx, actorId, f),
      asOf = new Date();
    const [topups, sales, visits, cancellations, paidWithdrawals, backlog] =
      await Promise.all([
        s.purchases
          ? aggregate(tx, s, "TOPUPS", p, asOf, true)
          : Promise.resolve(null),
        aggregate(tx, s, "SALES", p, asOf),
        aggregate(tx, s, "VISITS", p, asOf),
        aggregate(tx, s, "CANCELLATIONS", p, asOf),
        s.finance
          ? aggregate(tx, s, "WITHDRAWALS", p, asOf, true)
          : Promise.resolve(null),
        alerts(tx, s, asOf),
      ]);
    const balances = s.finance
      ? await tx.$queryRaw<{ type: string; balancePiasters: string }[]>(
          Prisma.sql`SELECT type::text AS type,coalesce(sum("balancePiasters"),0)::text AS "balancePiasters" FROM "MoneyAccount" WHERE type<>'PLATFORM_OFFSET' ${s.gymId ? Prisma.sql`AND "gymId"=${s.gymId}::uuid` : Prisma.empty} GROUP BY type ORDER BY type`,
        )
      : null;
    const [stock] = await tx.$queryRaw<{ points: string }[]>(
      Prisma.sql`SELECT coalesce(sum(a.balance),0)::text AS points FROM "PointAccount" a LEFT JOIN "Branch" b ON b.id=a."branchId" WHERE a.type IN ('BRANCH_INVENTORY','GYM_INVENTORY') ${s.gymId ? Prisma.sql`AND coalesce(a."gymId",b."gymId")=${s.gymId}::uuid` : Prisma.empty} ${s.branchId ? Prisma.sql`AND b.id=${s.branchId}::uuid` : Prisma.empty}`,
    );
    let reconciliation = null;
    if (s.admin && !s.gymId && !s.branchId) {
      const pointAccounts = await tx.$queryRaw<
        { type: string; balance: string }[]
      >`SELECT type::text AS type,coalesce(sum(balance),0)::text AS balance FROM "PointAccount" GROUP BY type ORDER BY type`;
      const [money] = await tx.$queryRaw<
        { difference: string }[]
      >`SELECT coalesce(sum("balancePiasters"),0)::text AS difference FROM "MoneyAccount"`;
      reconciliation = {
        points: pointAccounts,
        pointDifference: pointAccounts
          .reduce((n, x) => n + BigInt(x.balance), 0n)
          .toString(),
        moneyDifference: money!.difference,
      };
    }
    return {
      platformFinance: s.admin && !s.gymId && !s.branchId ? await platformFinance(tx,asOf) : null,
      asOf,
      period: {
        from: f.from,
        to: f.to,
        start: p.start,
        endExclusive: p.end,
        timeZone: "Africa/Cairo",
      },
      scope: {
        gymId: s.gymId ?? null,
        branchId: s.branchId ?? null,
        finance: s.finance,
      },
      topups,
      sales,
      visits,
      cancellations,
      netVisitPoints: (
        BigInt(visits.points) - BigInt(cancellations.points)
      ).toString(),
      netVisitReceivablesPiasters: (
        BigInt(visits.amountPiasters) - BigInt(cancellations.amountPiasters)
      ).toString(),
      paidWithdrawals,
      currentStockPoints: stock!.points,
      currentBalances: balances,
      serviceCharges:s.finance&&s.gymId&&!s.branchId?await chargeSummary(tx,s.gymId):null,
      alerts: backlog,
      reconciliation,
    };
  });
}
export async function reportRows(
  db: PrismaClient,
  actorId: string,
  input: unknown,
  exporting = false,
) {
  const f = parse(rowsSchema, input),
    p = period(f);
  return reportTransaction(db, async (tx) => {
    const s = await scope(tx, actorId, f),
      asOf = new Date();
    if (
      (f.kind === "WITHDRAWALS" && !s.finance) ||
      (f.kind === "TOPUPS" && !s.purchases)
    )
      throw new DomainError("ACCESS_DENIED");
    const take = exporting ? 5001 : f.limit + 1;
    const rows = await tx.$queryRaw<ReportRow[]>(
      Prisma.sql`SELECT r.id,${f.kind === "CANCELLATIONS" ? Prisma.sql`r."referenceId"` : Prisma.sql`r.id`} AS "referenceId",r."eventAt",r."gymId",r."gymName",r."branchId",r."branchName",r.status,r.points::text AS points,r.amount::text AS "amountPiasters",r."actorId" FROM (${source(f.kind, asOf)}) r WHERE ${scoped(s)} AND r."eventAt">=${p.start} AND r."eventAt"<${p.end} ${f.status ? Prisma.sql`AND r.status=${f.status}` : Prisma.empty} ${!exporting && f.cursor ? Prisma.sql`AND r.id>${f.cursor}::uuid` : Prisma.empty} ORDER BY r.id ASC LIMIT ${take}`,
    );
    if (exporting) {
      if (rows.length > 5000) throw new DomainError("EXPORT_TOO_LARGE");
      return {
        asOf,
        kind: f.kind,
        filterStatus: f.status ?? null,
        items: rows,
        nextCursor: null,
      };
    }
    return {
      asOf,
      kind: f.kind,
      filterStatus: f.status ?? null,
      items: rows.slice(0, f.limit),
      nextCursor: rows.length > f.limit ? rows[f.limit - 1]!.id : null,
    };
  });
}
export function reportCsv(rows: ReportRow[]) {
  const headers = [
    "id",
    "reference_id",
    "event_at_utc",
    "gym_id",
    "gym_name",
    "branch_id",
    "branch_name",
    "status",
    "points",
    "amount_piasters",
    "actor_id",
  ];
  return (
    "\uFEFF" +
    [
      headers,
      ...rows.map((r) => [
        r.id,
        r.referenceId,
        r.eventAt.toISOString(),
        r.gymId,
        r.gymName,
        r.branchId,
        r.branchName,
        r.status,
        r.points,
        r.amountPiasters,
        r.actorId,
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}

