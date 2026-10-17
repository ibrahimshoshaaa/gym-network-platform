import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { postLedger } from "../src/ledger/service.js";
import { createSession } from "../src/auth/sessions.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/(gym_ci|gym_test)$/.test(url.pathname)
)
  throw new Error("Disposable local test database required");
const db = new PrismaClient();
after(async () => db.$disconnect());
async function fixture(t: { after: (fn: () => Promise<unknown>) => void }) {
  const user = (role: "GYM_OWNER" | "CASHIER" | "PLATFORM_ADMIN") =>
    db.user.create({
      data: {
        role,
        displayName: "Synthetic Inventory User",
        phoneE164: `+20inv${randomUUID()}`,
      },
    });
  const owner = await user("GYM_OWNER"),
    admin = await user("PLATFORM_ADMIN"),
    cashier = await user("CASHIER"),
    outsider = await user("GYM_OWNER");
  const gym = await db.gym.create({
      data: {
        ownerId: owner.id,
        name: "Synthetic Inventory Gym",
        status: "ACTIVE",
        ownerAcceptedAt: new Date(),
      },
    }),
    foreignGym = await db.gym.create({
      data: {
        ownerId: owner.id,
        name: "Another Owned Gym",
        status: "ACTIVE",
        ownerAcceptedAt: new Date(),
      },
    });
  const branch = (gymId: string) =>
    db.branch.create({
      data: {
        gymId,
        name: "Synthetic Inventory Branch",
        status: "ACTIVE",
        visitPricePoints: 20,
        sessionMinutes: 60,
      },
    });
  const a = await branch(gym.id),
    b = await branch(gym.id),
    foreign = await branch(foreignGym.id);
  const stock = async (branchId: string) =>
    db.pointAccount.create({ data: { type: "BRANCH_INVENTORY", branchId } });
  const source = await stock(a.id),
    target = await stock(b.id);
  await stock(foreign.id);
  await db.staffAssignment.create({
    data: { userId: cashier.id, branchId: a.id, role: "CASHIER" },
  });
  const issuance =
    (await db.pointAccount.findFirst({ where: { type: "ISSUANCE" } })) ??
    (await db.pointAccount.create({ data: { type: "ISSUANCE" } }));
  const issue = (accountId: string, points: bigint) =>
    postLedger(db, {
      actorId: admin.id,
      idempotencyKey: randomUUID(),
      reason: "Synthetic inventory funding",
      points: {
        kind: "ISSUE",
        entries: [
          { accountId: issuance.id, delta: -points },
          { accountId, delta: points },
        ],
      },
    });
  await issue(source.id, 50n);
  const app = buildApp(db);
  t.after(async () => app.close());
  const sessions = new Map<string, string>();
  for (const u of [owner, admin, cashier, outsider])
    sessions.set(
      u.id,
      await createSession(db, u.id, new Date(Date.now() + 3600000)),
    );
  const get = (path: string, actor = owner.id) =>
    app.inject({
      method: "GET",
      url: path,
      headers: { authorization: `Bearer ${sessions.get(actor)}` },
    });
  const transfer = (
    options: {
      actor?: string;
      key?: string;
      gymId?: string;
      body?: Record<string, unknown>;
    } = {},
  ) =>
    app.inject({
      method: "POST",
      url: `/gyms/${options.gymId ?? gym.id}/stock-transfers`,
      headers: {
        authorization: `Bearer ${sessions.get(options.actor ?? owner.id)}`,
        "idempotency-key": options.key ?? randomUUID(),
      },
      payload: {
        fromBranchId: a.id,
        toBranchId: b.id,
        points: 10,
        ...options.body,
      },
    });
  return {
    owner,
    admin,
    cashier,
    outsider,
    gym,
    foreignGym,
    a,
    b,
    foreign,
    source,
    target,
    get,
    transfer,
    issue,
  };
}
test("HTTP concurrent retries transfer once and both branch histories show one shared immutable reference", async (t) => {
  const f = await fixture(t),
    key = randomUUID(),
    before = await db.pointTransaction.count();
  const moneyBefore = await db.moneyTransaction.count(),
    issuanceBefore = await db.pointAccount.findFirstOrThrow({
      where: { type: "ISSUANCE" },
    });
  const replies = await Promise.all(
    Array.from({ length: 6 }, () => f.transfer({ key })),
  );
  for (const r of replies) assert.equal(r.statusCode, 201, r.body);
  assert.equal(new Set(replies.map((r) => r.json().id)).size, 1);
  const id = replies[0]!.json().id;
  assert.equal(await db.pointTransaction.count(), before + 1);
  assert.equal(await db.moneyTransaction.count(), moneyBefore);
  assert.equal(
    (
      await db.pointAccount.findUniqueOrThrow({
        where: { id: issuanceBefore.id },
      })
    ).balance,
    issuanceBefore.balance,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.source.id } }))
      .balance,
    40,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.target.id } }))
      .balance,
    10,
  );
  const first = (await f.get(`/inventory/branches/${f.a.id}/movements`))
      .json()
      .items.find((x: { transactionId: string }) => x.transactionId === id),
    second = (await f.get(`/inventory/branches/${f.b.id}/movements`)).json()
      .items[0];
  assert.equal(first.delta, -10);
  assert.equal(second.delta, 10);
  assert.equal(second.transactionId, id);
  assert.equal(first.otherBranchId, f.b.id);
  assert.equal(second.otherBranchId, f.a.id);
  assert.equal(
    (await f.transfer({ key, body: { points: 11 } })).json().code,
    "IDEMPOTENCY_CONFLICT",
  );
});
test("competing HTTP transfers cannot overspend and failed transfer leaves no ledger entry", async (t) => {
  const f = await fixture(t),
    before = await db.pointTransaction.count();
  const replies = await Promise.all([
    f.transfer({ body: { points: 40 } }),
    f.transfer({ body: { points: 40 } }),
  ]);
  assert.deepEqual(replies.map((r) => r.statusCode).sort(), [201, 409]);
  assert.equal(
    replies.find((r) => r.statusCode === 409)!.json().code,
    "INSUFFICIENT_POINTS",
  );
  assert.equal(await db.pointTransaction.count(), before + 1);
});
test("only actual owner transfers inside route gym; staff, admin and cross-gym requests are denied", async (t) => {
  const f = await fixture(t);
  for (const actor of [f.cashier.id, f.outsider.id, f.admin.id])
    assert.equal((await f.transfer({ actor })).statusCode, 403);
  assert.equal((await f.transfer({ gymId: f.foreignGym.id })).statusCode, 403);
  assert.equal(
    (await f.transfer({ body: { toBranchId: f.foreign.id } })).statusCode,
    403,
  );
  assert.equal(
    (await f.get(`/inventory/branches/${f.b.id}`, f.cashier.id)).statusCode,
    403,
  );
  assert.equal(
    (await f.get(`/inventory/branches/${f.a.id}/movements`, f.outsider.id))
      .statusCode,
    403,
  );
  assert.equal(
    (await f.get(`/inventory/branches/${f.a.id}/movements`, f.cashier.id))
      .statusCode,
    200,
  );
  await db.staffAssignment.updateMany({
    where: { userId: f.cashier.id },
    data: { active: false },
  });
  assert.equal(
    (await f.get(`/inventory/branches/${f.a.id}/movements`, f.cashier.id))
      .statusCode,
    403,
  );
});
test("invalid transfer payloads cannot choose ledger accounts or bypass whole point limits", async (t) => {
  const f = await fixture(t),
    before = await db.pointTransaction.count();
  for (const body of [
    { points: 0 },
    { points: -1 },
    { points: 1.1 },
    { points: 2147483648 },
    { toBranchId: f.a.id },
    { actorId: f.admin.id },
    { idempotencyKey: randomUUID() },
  ])
    assert.equal((await f.transfer({ body })).statusCode, 400);
  assert.equal(await db.pointTransaction.count(), before);
});
test("suspension blocks stock movement while private history remains readable and pages remain scoped", async (t) => {
  const f = await fixture(t);
  await f.transfer();
  await db.branch.update({
    where: { id: f.b.id },
    data: { status: "SUSPENDED" },
  });
  assert.equal((await f.transfer()).statusCode, 403);
  const p = await f.get(`/inventory/branches/${f.a.id}/movements?limit=1`);
  assert.equal(p.statusCode, 200);
  assert.equal(p.headers["cache-control"], "no-store");
  assert.equal(p.json().items.length, 1);
  assert.ok(p.json().nextCursor);
  const next = await f.get(
    `/inventory/branches/${f.a.id}/movements?limit=1&cursor=${p.json().nextCursor}`,
  );
  assert.equal(next.statusCode, 200);
  assert.notEqual(next.json().items[0].id, p.json().items[0].id);
  assert.equal(
    /tokenHash|phoneE164|passwordHash|requestHash/.test(p.body),
    false,
  );
  const balance = await f.get(`/inventory/branches/${f.b.id}`);
  assert.equal(balance.statusCode, 200);
  assert.equal(balance.json().stock, 10);
});
