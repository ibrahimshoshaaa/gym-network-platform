import { Prisma, type PrismaClient } from "@prisma/client";
import { requireActor } from "../auth/authorization.js";
import { DomainError } from "../domain/errors.js";
import { parse } from "../gyms/validation.js";
import { movementSchema, pageSchema, walletView } from "./validation.js";
type Tx = Prisma.TransactionClient;
async function read<T>(
  db: PrismaClient,
  actor: string,
  run: (tx: Tx) => Promise<T>,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const user = await requireActor(tx, actor);
        if (user.role !== "TRAINEE") throw new DomainError("ACCESS_DENIED");
        await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
        return run(tx);
      },
      { isolationLevel: "RepeatableRead", timeout: 10000 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === "P2028" ||
        (e.code === "P2010" && String(e.meta?.code) === "57014"))
    )
      throw new DomainError("WALLET_BUSY");
    throw e;
  }
}
export async function walletSummary(db: PrismaClient, actor: string) {
  return read(db, actor, async (tx) => {
    const w = await tx.pointAccount.findUnique({
      where: {
        type_ownerUserId: { type: "TRAINEE_WALLET", ownerUserId: actor },
      },
      select: { balance: true, expiresAt: true },
    });
    if (!w) throw new DomainError("ACCOUNT_NOT_FOUND");
    return walletView(w, new Date());
  });
}
type Movement = {
  sourceLabel:string|null;
  id: string;
  transactionId: string;
  operation: string;
  delta: number;
  postedAt: Date;
  eventAt: Date;
  referenceId: string;
  branchId: string | null;
  branchName: string | null;
  gymName: string | null;
};
export async function walletMovements(
  db: PrismaClient,
  actor: string,
  input: unknown,
) {
  const p = parse(movementSchema, input);
  return read(db, actor, async (tx) => {
    const cursor = p.cursor
      ? await tx.pointPosting.findFirst({
          where: {
            id: p.cursor,
            account: { type: "TRAINEE_WALLET", ownerUserId: actor },
            transaction: { posted: true },
          },
          select: { id: true, transaction: { select: { createdAt: true } } },
        })
      : null;
    if (p.cursor && !cursor) throw new DomainError("INVALID_INPUT");
    const source = Prisma.sql`SELECT p.id,t.id AS "transactionId",t."createdAt" AS "postedAt",coalesce(v."startedAt",cv."cancelledAt",tp."reviewedAt",t."createdAt") AS "eventAt",p.delta,CASE WHEN d.kind='ADMIN_TOPUP' OR tp.id IS NOT NULL THEN 'TOPUP' WHEN d.kind='GYM_SALE' OR s.id IS NOT NULL THEN 'SALE' WHEN v.id IS NOT NULL THEN 'VISIT' WHEN c.id IS NOT NULL THEN 'VISIT_CANCELLATION' WHEN t.kind='EXPIRY' THEN 'EXPIRY' ELSE 'ADJUSTMENT' END AS operation,coalesce(d.id,tp.id,s.id,v.id,cv.id,t."referenceId",t.id) AS "referenceId",b.id AS "branchId",b.name AS "branchName",g.name AS "gymName",CASE WHEN d.kind='GYM_SALE' THEN dg.name||' · محفظة الجيم' WHEN d.kind='ADMIN_TOPUP' THEN 'شحن مباشر من المنصة' ELSE NULL END AS "sourceLabel" FROM "PointPosting" p JOIN "PointAccount" a ON a.id=p."accountId" JOIN "PointTransaction" t ON t.id=p."transactionId" LEFT JOIN "PointDispatch" d ON d."pointTransactionId"=t.id AND d."recipientId"=${actor}::uuid LEFT JOIN "Gym" dg ON dg.id=d."gymId" LEFT JOIN "TopupRequest" tp ON tp."pointTransactionId"=t.id AND tp."requestorUserId"=${actor}::uuid AND tp.kind='TRAINEE' AND tp.status='APPROVED' LEFT JOIN "PointSale" s ON s."pointTransactionId"=t.id AND s."traineeId"=${actor}::uuid LEFT JOIN "Visit" v ON v."pointTransactionId"=t.id AND v."traineeId"=${actor}::uuid LEFT JOIN "VisitCancellation" c ON c."pointTransactionId"=t.id LEFT JOIN "Visit" cv ON cv.id=c."visitId" AND cv."traineeId"=${actor}::uuid LEFT JOIN "Branch" b ON b.id=coalesce(s."branchId",v."branchId",cv."branchId") LEFT JOIN "Gym" g ON g.id=b."gymId" WHERE a.type='TRAINEE_WALLET' AND a."ownerUserId"=${actor}::uuid AND t.posted`;
    const rows = await tx.$queryRaw<Movement[]>(
      Prisma.sql`SELECT r.* FROM (${source}) r WHERE true ${p.operation ? Prisma.sql`AND r.operation=${p.operation}` : Prisma.empty} ${cursor ? Prisma.sql`AND (r."postedAt",r.id)<(${cursor.transaction.createdAt},${cursor.id}::uuid)` : Prisma.empty} ORDER BY r."postedAt" DESC,r.id DESC LIMIT ${p.limit + 1}`,
    );
    return {
      serverTime: new Date(),
      items: rows
        .slice(0, p.limit)
        .map(({ branchId, branchName, gymName, postedAt, ...row }) => ({
          ...row,
          branch: branchId ? { id: branchId, name: branchName, gymName } : null,
        })),
      nextCursor: rows.length > p.limit ? rows[p.limit - 1]!.id : null,
    };
  });
}
export async function traineeVisits(
  db: PrismaClient,
  actor: string,
  input: unknown,
  active = false,
) {
  const p = parse(pageSchema, input);
  return read(db, actor, async (tx) => {
    const now = new Date(),
      cursor = p.cursor
        ? await tx.visit.findFirst({
            where: { id: p.cursor, traineeId: actor },
            select: { id: true, startedAt: true },
          })
        : null;
    if (p.cursor && !cursor) throw new DomainError("INVALID_INPUT");
    const rows = await tx.visit.findMany({
      where: {
        traineeId: actor,
        ...(active ? { status: "ACTIVE", expiresAt: { gt: now } } : {}),
        ...(cursor
          ? {
              OR: [
                { startedAt: { lt: cursor.startedAt } },
                { startedAt: cursor.startedAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: p.limit + 1,
      select: {
        id: true,
        pointsCharged: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        cancelledAt: true,
        cancellationReason: true,
        branch: {
          select: {
            id: true,
            name: true,
            gym: { select: { id: true, name: true } },
          },
        },
      },
    });
    return {
      serverTime: now,
      items: rows
        .slice(0, p.limit)
        .map((v) => ({
          ...v,
          status:
            v.status === "ACTIVE" && v.expiresAt <= now ? "EXPIRED" : v.status,
          serverTime: now,
        })),
      nextCursor: rows.length > p.limit ? rows[p.limit - 1]!.id : null,
    };
  });
}
