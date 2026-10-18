import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { browseBranches, branchDetails } from "../src/directory/service.js";
import { buildApp } from "../src/app.js";
import { createSession } from "../src/auth/sessions.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/(gym_ci|gym_test)$/.test(url.pathname)
)
  throw new Error("Disposable local test database required");
const db = new PrismaClient();
after(async () => db.$disconnect());
const code = (p: Promise<unknown>, expected: string) =>
  assert.rejects(p, (e: unknown) =>
    Boolean(e && typeof e === "object" && "code" in e && e.code === expected),
  );
async function fixture() {
  const tag = randomUUID(),
    user = (role: "TRAINEE" | "GYM_OWNER" | "PLATFORM_ADMIN") =>
      db.user.create({
        data: {
          role,
          displayName: "Private Directory Identity",
          phoneE164: `+20priv${randomUUID()}`,
          email: `private-${randomUUID()}@example.test`,
        },
      });
  const trainee = await user("TRAINEE"),
    owner = await user("GYM_OWNER"),
    admin = await user("PLATFORM_ADMIN"),
    other = await user("GYM_OWNER");
  const gym = await db.gym.create({
      data: {
        ownerId: owner.id,
        name: `Gym ${tag}`,
        description: "Business description",
        contactPhone: "+201000000001",
        status: "ACTIVE",
        ownerAcceptedAt: new Date(),
      },
    }),
    otherGym = await db.gym.create({
      data: {
        ownerId: other.id,
        name: `Other ${tag}`,
        status: "ACTIVE",
        ownerAcceptedAt: new Date(),
      },
    });
  const branch = (
    gymId = gym.id,
    data: Partial<Prisma.BranchUncheckedCreateInput> = {},
  ) =>
    db.branch.create({
      data: {
        gymId,
        name: `Branch ${tag}`,
        status: "ACTIVE",
        visitPricePoints: 25,
        sessionMinutes: 90,
        pricingVersion: 1,
        priceApprovedAt: new Date(),
        priceApprovedById: admin.id,
        address: "Synthetic street",
        governorate: "المنوفية",
        city: "شبين الكوم",
        latitude: 30.5,
        longitude: 31.0,
        openingHours: "من ٨ صباحًا إلى ١١ مساءً",
        ...data,
      },
    });
  const a = await branch(),
    b = await branch(otherGym.id, { contactPhone: "+201000000002" });
  return { tag, trainee, owner, admin, other, gym, otherGym, a, b, branch };
}
test("trainee directory spans eligible gyms while returning only business data and never changing ledgers", async () => {
  const f = await fixture(),
    before = [
      await db.pointTransaction.count(),
      await db.moneyTransaction.count(),
    ];
  const page = await browseBranches(db, f.trainee.id, { q: f.tag });
  assert.equal(page.items.length, 2);
  assert.deepEqual(
    new Set(page.items.map((b) => b.id)),
    new Set([f.a.id, f.b.id]),
  );
  const detail = await branchDetails(db, f.trainee.id, f.a.id);
  assert.equal(detail.branch.visitPricePoints, 25);
  assert.equal(detail.branch.sessionMinutes, 90);
  assert.equal(detail.branch.contactPhone, "+201000000001");
  assert.equal(detail.branch.latitude, "30.5000000");
  assert.equal(detail.branch.gym.description, "Business description");
  const text = JSON.stringify(page) + JSON.stringify(detail);
  for (const forbidden of [
    f.owner.phoneE164,
    f.owner.email!,
    f.owner.displayName,
    "ownerId",
    "balancePiasters",
    "pointAccounts",
    "passwordHash",
    "tokenHash",
    "requestHash",
  ])
    assert.equal(text.includes(forbidden), false);
  assert.deepEqual(
    [await db.pointTransaction.count(), await db.moneyTransaction.count()],
    before,
  );
});
test("pending/suspended/unapproved/incomplete branches and unavailable gyms/owners are hidden from both list and detail", async () => {
  const f = await fixture();
  const invalid: Partial<Prisma.BranchUncheckedCreateInput>[] = [
    { status: "PENDING" },
    { status: "SUSPENDED" },
    { pricingVersion: 0 },
    { priceApprovedAt: null },
    { latitude: null, longitude: null },
    { address: "" },
    { address: "   " },
    { governorate: "" },
    { city: "" },
  ];
  for (const data of invalid) {
    const b = await f.branch(f.gym.id, data);
    assert.equal(
      (await browseBranches(db, f.trainee.id, { q: f.tag })).items.some(
        (x) => x.id === b.id,
      ),
      false,
    );
    await code(branchDetails(db, f.trainee.id, b.id), "NOT_FOUND");
  }
  for (const data of [
    { status: "SUSPENDED" as const },
    { status: "PENDING" as const },
    { ownerAcceptedAt: null },
  ]) {
    await db.gym.update({ where: { id: f.gym.id }, data });
    await code(branchDetails(db, f.trainee.id, f.a.id), "NOT_FOUND");
    await db.gym.update({
      where: { id: f.gym.id },
      data: { status: "ACTIVE", ownerAcceptedAt: new Date() },
    });
  }
  await db.user.update({
    where: { id: f.owner.id },
    data: { isActive: false },
  });
  await code(branchDetails(db, f.trainee.id, f.a.id), "NOT_FOUND");
  assert.equal(
    (await browseBranches(db, f.trainee.id, { q: f.tag })).items.length,
    1,
  );
});
test("literal search, exact city/governorate filters and keyset pages do not broaden scopes or duplicate records", async () => {
  const f = await fixture();
  const special = await f.branch(f.gym.id, {
    name: `${f.tag} %_\\ name`,
    governorate: "Cairo",
    city: "Nasr City",
  });
  const unique = await browseBranches(db, f.trainee.id, { q: `${f.tag} %_\\` });
  assert.deepEqual(
    unique.items.map((x) => x.id),
    [special.id],
  );
  assert.equal(
    (await browseBranches(db, f.trainee.id, { q: "' OR 1=1 --" })).items.length,
    0,
  );
  assert.equal(
    (
      await browseBranches(db, f.trainee.id, {
        q: f.tag,
        governorate: "cairo",
        city: "nasr city",
      })
    ).items.length,
    1,
  );
  assert.equal(
    (await browseBranches(db, f.trainee.id, { q: f.tag, city: "Nasr" })).items
      .length,
    0,
  );
  const all = await browseBranches(db, f.trainee.id, { q: f.tag }),
    first = await browseBranches(db, f.trainee.id, { q: f.tag, limit: 1 }),
    second = await browseBranches(db, f.trainee.id, {
      q: f.tag,
      limit: 1,
      cursor: first.nextCursor,
    });
  assert.equal(all.items.length, 3);
  assert.equal(first.items.length, 1);
  assert.notEqual(first.items[0]!.id, second.items[0]!.id);
});
test("detail rechecks live visibility and approved price so a stale result never permits a stopped visit", async () => {
  const f = await fixture();
  await browseBranches(db, f.trainee.id, { q: f.tag });
  await db.branch.update({
    where: { id: f.a.id },
    data: { visitPricePoints: 35, sessionMinutes: 120, pricingVersion: 2 },
  });
  const updated = await branchDetails(db, f.trainee.id, f.a.id);
  assert.equal(updated.branch.visitPricePoints, 35);
  assert.equal(updated.branch.pricingVersion, 2);
  await db.branch.update({
    where: { id: f.a.id },
    data: { status: "SUSPENDED" },
  });
  await code(branchDetails(db, f.trainee.id, f.a.id), "NOT_FOUND");
  await code(branchDetails(db, f.trainee.id, randomUUID()), "NOT_FOUND");
  for (const actor of [f.owner.id, f.admin.id])
    await code(browseBranches(db, actor, {}), "ACCESS_DENIED");
});
test("HTTP directory requires active trainee authentication, validates input and keeps responses private", async (t) => {
  const f = await fixture(),
    app = buildApp(db);
  t.after(async () => app.close());
  const token = await createSession(
      db,
      f.trainee.id,
      new Date(Date.now() + 60000),
    ),
    owner = await createSession(db, f.owner.id, new Date(Date.now() + 60000));
  const get = (path: string, bearer = token) =>
    app.inject({
      method: "GET",
      url: path,
      headers: { authorization: `Bearer ${bearer}` },
    });
  assert.equal(
    (await app.inject({ method: "GET", url: "/directory/branches" }))
      .statusCode,
    401,
  );
  assert.equal((await get("/directory/branches", owner)).statusCode, 403);
  const r = await get(`/directory/branches?q=${f.tag}`);
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["cache-control"], "no-store");
  assert.equal(r.json().items.length, 2);
  assert.equal((await get(`/directory/branches/${f.a.id}`)).statusCode, 200);
  assert.equal(
    (await get("/directory/branches?status=SUSPENDED")).statusCode,
    400,
  );
  assert.equal((await get("/directory/branches/not-a-uuid")).statusCode, 400);
  await db.user.update({
    where: { id: f.trainee.id },
    data: { isActive: false },
  });
  assert.equal((await get("/directory/branches")).statusCode, 401);
});

test("nearby ranking covers all eligible results with stable distance and UUID pagination", async () => {
 const f=await fixture();
 const near=await f.branch(f.gym.id,{name:"Near "+f.tag,latitude:30.5001,longitude:31.0001});
 const far=await f.branch(f.gym.id,{name:"Far "+f.tag,latitude:31,longitude:32});
 await f.branch(f.gym.id,{name:"Hidden "+f.tag,latitude:30.5,longitude:31,status:"SUSPENDED"});
 const query={q:f.tag,latitude:30.5,longitude:31};
 const all=await browseBranches(db,f.trainee.id,query);
 assert.equal(all.items.length,4);
 assert.deepEqual(new Set(all.items.slice(0,2).map(x=>x.id)),new Set([f.a.id,f.b.id]));
 assert.equal(all.items[2]!.id,near.id);
 assert.equal(all.items[3]!.id,far.id);
 assert.ok(all.items[2]!.distanceKm!>0 && all.items[2]!.distanceKm!<0.1);
 assert.ok(all.items[3]!.distanceKm!>100);
 const ids:string[]=[];
 let cursor:string|undefined;
 do {
  const page=await browseBranches(db,f.trainee.id,{...query,limit:1,...(cursor?{cursor}:{})});
  ids.push(...page.items.map(x=>x.id));
  cursor=page.nextCursor??undefined;
 } while(cursor);
 assert.deepEqual(ids,all.items.map(x=>x.id));
 await db.branch.update({where:{id:f.a.id},data:{city:"مدينة "+f.tag}});
 const region=await browseBranches(db,f.trainee.id,{q:"مدينة "+f.tag,latitude:30.5,longitude:31});
 assert.ok(region.items.some(x=>x.id===f.a.id));
 await code(browseBranches(db,f.owner.id,query),"ACCESS_DENIED");
});
