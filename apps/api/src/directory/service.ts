import { Prisma, type PrismaClient } from "@prisma/client";
import { requireActor } from "../auth/authorization.js";
import { DomainError } from "../domain/errors.js";
import { parse } from "../gyms/validation.js";
import { directoryQuery } from "./validation.js";
type Tx = Prisma.TransactionClient;
type Branch = {
  id: string;
  name: string;
  address: string;
  governorate: string;
  city: string;
  contactPhone: string | null;
  openingHours: string | null;
  latitude: string;
  longitude: string;
  visitPricePoints: number;
  sessionMinutes: number;
  pricingVersion: number;
  gymId: string;
  gymName: string;
  description: string;
};
// A deliberate public-business projection: never load owner/staff contact,
// stock, ledger balances, receipts or private operational records.
const projection = Prisma.sql`SELECT b.id,b.name,b.address,b.governorate,b.city,coalesce(b."contactPhone",g."contactPhone") AS "contactPhone",b."openingHours",b.latitude::text AS latitude,b.longitude::text AS longitude,b."visitPricePoints",b."sessionMinutes",b."pricingVersion",g.id AS "gymId",g.name AS "gymName",g.description FROM "Branch" b JOIN "Gym" g ON g.id=b."gymId" JOIN "User" u ON u.id=g."ownerId"`;
const eligible = Prisma.sql`b.status='ACTIVE' AND g.status='ACTIVE' AND g."ownerAcceptedAt" IS NOT NULL AND u."isActive" AND b."pricingVersion">0 AND b."priceApprovedAt" IS NOT NULL AND b."visitPricePoints">0 AND b."sessionMinutes">0 AND length(btrim(b.address))>0 AND length(btrim(b.governorate))>0 AND length(btrim(b.city))>0 AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180`;
const view = ({ gymId, gymName, description, ...branch }: Branch) => ({
  ...branch,
  gym: { id: gymId, name: gymName, description },
});
async function read<T>(
  db: PrismaClient,
  actorId: string,
  run: (tx: Tx) => Promise<T>,
) {
  try {
    return await db.$transaction(
      async (tx) => {
        const actor = await requireActor(tx, actorId);
        if (actor.role !== "TRAINEE") throw new DomainError("ACCESS_DENIED");
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
      throw new DomainError("DIRECTORY_BUSY");
    throw e;
  }
}
export async function browseBranches(
  db: PrismaClient,
  actorId: string,
  input: unknown,
) {
  const q = parse(directoryQuery, input);
  return read(db, actorId, async (tx) => {
    const rows = await tx.$queryRaw<Branch[]>(
      Prisma.sql`${projection} WHERE ${eligible} ${q.q ? Prisma.sql`AND (strpos(lower(b.name),lower(${q.q}))>0 OR strpos(lower(g.name),lower(${q.q}))>0)` : Prisma.empty} ${q.governorate ? Prisma.sql`AND lower(b.governorate)=lower(${q.governorate})` : Prisma.empty} ${q.city ? Prisma.sql`AND lower(b.city)=lower(${q.city})` : Prisma.empty} ${q.cursor ? Prisma.sql`AND b.id>${q.cursor}::uuid` : Prisma.empty} ORDER BY b.id ASC LIMIT ${q.limit + 1}`,
    );
    return {
      asOf: new Date(),
      items: rows.slice(0, q.limit).map(view),
      nextCursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
    };
  });
}
export async function branchDetails(
  db: PrismaClient,
  actorId: string,
  id: string,
) {
  return read(db, actorId, async (tx) => {
    const [b] = await tx.$queryRaw<Branch[]>(
      Prisma.sql`${projection} WHERE ${eligible} AND b.id=${id}::uuid`,
    );
    if (!b) throw new DomainError("NOT_FOUND");
    return { asOf: new Date(), branch: view(b) };
  });
}
