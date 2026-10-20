import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  confirmVisit,
  issueQr,
  lookupTrainee,
  previewVisit,
  quoteSale,
  sellPoints,
} from "../src/operations/service.js";
import {
  cancelVisit,
  requestReview,
  decideReview,
} from "../src/reviews/service.js";
import { buildApp } from "../src/app.js";
import {
  postLedger,
  reverseLedger,
  postInTransaction,
} from "../src/ledger/service.js";
import { createSession } from "../src/auth/sessions.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/(gym_ci|gym_test)$/.test(url.pathname)
)
  throw new Error("Disposable local test database required");
const db = new PrismaClient();
after(async () => db.$disconnect());
async function fixture(stock = 100, balance = 80) {
  const user = (
    role:
      | "PLATFORM_ADMIN"
      | "GYM_OWNER"
      | "CASHIER"
      | "BRANCH_MANAGER"
      | "TRAINEE",
  ) =>
    db.user.create({
      data: {
        role,
        displayName: "Synthetic Test Person",
        phoneE164: `+20ops${randomUUID()}`,
      },
    });
  const admin = await user("PLATFORM_ADMIN"),
    owner = await user("GYM_OWNER"),
    cashier = await user("CASHIER"),
    cashier2 = await user("CASHIER"),
    manager = await user("BRANCH_MANAGER"),
    person = await user("TRAINEE");
  const gym = await db.gym.create({
    data: {
      name: "Synthetic Operations Gym",
      ownerId: owner.id,
      status: "ACTIVE",
      ownerAcceptedAt: new Date(),
    },
  });
  const branch = await db.branch.create({
    data: {
      name: "Synthetic Branch",
      gymId: gym.id,
      status: "ACTIVE",
      visitPricePoints: 30,
      sessionMinutes: 120,
      pricingVersion: 1,
      priceApprovedAt: new Date(),
    },
  });
  await db.staffAssignment.createMany({
    data: [
      { userId: cashier.id, branchId: branch.id, role: "CASHIER" },
      { userId: cashier2.id, branchId: branch.id, role: "CASHIER" },
      { userId: manager.id, branchId: branch.id, role: "BRANCH_MANAGER" },
    ],
  });
  const issuance =
    (await db.pointAccount.findFirst({ where: { type: "ISSUANCE" } })) ??
    (await db.pointAccount.create({ data: { type: "ISSUANCE" } }));
  const inventory = await db.pointAccount.create({
      data: { type: "BRANCH_INVENTORY", branchId: branch.id },
    }),
    wallet = await db.pointAccount.create({
      data: {
        type: "TRAINEE_WALLET",
        ownerUserId: person.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
  if (stock)
    await postLedger(db, {
      actorId: admin.id,
      idempotencyKey: randomUUID(),
      reason: "Synthetic stock",
      points: {
        kind: "ISSUE",
        entries: [
          { accountId: issuance.id, delta: -BigInt(stock) },
          { accountId: inventory.id, delta: BigInt(stock) },
        ],
      },
    });
  if (balance)
    await postLedger(db, {
      actorId: admin.id,
      idempotencyKey: randomUUID(),
      reason: "Synthetic wallet",
      points: {
        kind: "ISSUE",
        entries: [
          { accountId: issuance.id, delta: -BigInt(balance) },
          { accountId: wallet.id, delta: BigInt(balance) },
        ],
      },
    });
  if (!(await db.pricingPolicy.findFirst()))
    await db.pricingPolicy.create({
      data: {
        version: 1,
        pointPricePiasters: 100n,
        gymDiscountBps: 1000,
        redemptionBps: 8000,
        createdById: admin.id,
      },
    });
  const p = await db.pricingPolicy.findFirstOrThrow({
      orderBy: { version: "desc" },
    }),
    bearer = await createSession(db, person.id, new Date(Date.now() + 3600000));
  const sale = (points = 20) => ({
    traineeId: person.id,
    points,
    pricingVersion: p.version,
    receivedAmountPiasters: (BigInt(points) * p.pointPricePiasters).toString(),
    fundsReceived: true,
  });
  const qr = () => issueQr(db, person.id, bearer);
  const entry = (token: string) => ({
    token,
    pricingVersion: p.version,
    branchPricingVersion: 1,
    presenceConfirmed: true,
  });
  return {
    admin,
    owner,
    cashier,
    cashier2,
    manager,
    person,
    gym,
    branch,
    inventory,
    wallet,
    p,
    bearer,
    sale,
    qr,
    entry,
  };
}
const code = (promise: Promise<unknown>, code: string) =>
  assert.rejects(
    promise,
    (e: unknown) =>
      typeof e === "object" && e !== null && "code" in e && e.code === code,
  );
for (const role of ['owner', 'manager'] as const) {
  test(`${role} sells points and records attendance in scope without a cashier assignment`, async () => {
    const f = await fixture(), actor = f[role];
    const quote = await quoteSale(db, actor.id, f.branch.id, { traineeId: f.person.id, points: 10 });
    assert.equal(quote.points, 10);
    const sale = await sellPoints(db, actor.id, f.branch.id, randomUUID(), f.sale(10));
    assert.equal(sale.cashierId, actor.id);
    const qr = await f.qr();
    await previewVisit(db, actor.id, f.branch.id, { token: qr.token });
    const entry = await confirmVisit(db, actor.id, f.branch.id, randomUUID(), f.entry(qr.token));
    assert.equal(entry.visit.pointsCharged, 30);
    assert.equal((await db.visit.findUniqueOrThrow({ where: { id: entry.visit.id } })).cashierId, actor.id);
    const session = await createSession(db, actor.id, new Date(Date.now() + 3600000));
    const app = buildApp(db);
    try {
      const response = await app.inject({ method: 'GET', url: '/operations/branches', headers: { authorization: `Bearer ${session}` } });
      assert.equal(response.statusCode, 200);
      const branch = response.json().items.find((b: { id: string }) => b.id === f.branch.id);
      assert.equal(branch.gymId, f.gym.id);
      assert.equal(branch.canSell, true);
      assert.equal(branch.canCancel, true);
    } finally { await app.close(); }
    const other = await fixture();
    await code(quoteSale(db, actor.id, other.branch.id, { traineeId: other.person.id, points: 1 }), 'BRANCH_ACCESS_DENIED');
  });
}
test('owner cancellation returns original points and records the real actor', async () => {
  const f = await fixture(), qr = await f.qr();
  const entry = await confirmVisit(db, f.owner.id, f.branch.id, randomUUID(), f.entry(qr.token));
  await cancelVisit(db, f.owner.id, f.branch.id, entry.visit.id, randomUUID(), { reason: 'Synthetic owner cancelled incorrect attendance' });
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } })).balance, 80);
  assert.equal((await db.visit.findUniqueOrThrow({ where: { id: entry.visit.id } })).cancelledById, f.owner.id);
});
test('owner staff list filters the selected branch before pagination and does not expose another gym', async () => {
  const f = await fixture(), other = await fixture();
  const second = await db.branch.create({ data: { gymId: f.gym.id, name: 'Synthetic second staff branch', status: 'ACTIVE', visitPricePoints: 30, sessionMinutes: 120 } });
  await db.staffAssignment.create({ data: { userId: f.manager.id, branchId: second.id, role: 'BRANCH_MANAGER' } });
  const ownerToken = await createSession(db, f.owner.id, new Date(Date.now() + 3600000));
  const cashierToken = await createSession(db, f.cashier.id, new Date(Date.now() + 3600000));
  const app = buildApp(db);
  try {
    const path = `/gyms/${f.gym.id}/staff`;
    const get = (query: string, token = ownerToken) => app.inject({ method: 'GET', url: `${path}?${query}`, headers: { authorization: `Bearer ${token}` } });
    const first = await get(`branchId=${f.branch.id}&limit=1`);
    assert.equal(first.statusCode, 200);
    const page = first.json();
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].branchId, f.branch.id);
    assert.ok(page.nextCursor);
    const next = (await get(`branchId=${f.branch.id}&limit=1&cursor=${page.nextCursor}`)).json();
    assert.equal(next.items[0].branchId, f.branch.id);
    assert.notEqual(next.items[0].id, page.items[0].id);
    assert.equal((await get(`branchId=${second.id}`)).json().items.length, 1);
    assert.deepEqual((await get(`branchId=${other.branch.id}`)).json().items, []);
    assert.equal((await get(`branchId=${f.branch.id}`, cashierToken)).statusCode, 403);
  } finally { await app.close(); }
});
test("cashier sale conserves points, renews expiry and replays once without posting money", async () => {
  const f = await fixture(),
    key = randomUUID(),
    body = f.sale();
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      sellPoints(db, f.cashier.id, f.branch.id, key, body),
    ),
  );
  assert.equal(new Set(results.map((s) => s.id)).size, 1);
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.inventory.id } }))
      .balance,
    80,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    100,
  );
  assert.equal(
    await db.moneyTransaction.count({ where: { referenceId: results[0]!.id } }),
    0,
  );
  await code(
    sellPoints(db, f.cashier.id, f.branch.id, key, f.sale(21)),
    "IDEMPOTENCY_CONFLICT",
  );
  await code(
    reverseLedger(db, {
      actorId: f.admin.id,
      idempotencyKey: randomUUID(),
      reason: "Needs sale approval",
      pointTransactionId: results[0]!.pointTransactionId,
    }),
    "DOMAIN_APPROVAL_REQUIRED",
  );
  await assert.rejects(
    db.pointSale.update({
      where: { id: results[0]!.id },
      data: { points: 50 },
    }),
  );
});
test("two cashiers cannot oversell stock; stale pricing and unconfirmed money issue nothing", async () => {
  const f = await fixture(50, 0);
  const results = await Promise.allSettled([
    sellPoints(db, f.cashier.id, f.branch.id, randomUUID(), f.sale(40)),
    sellPoints(db, f.cashier2.id, f.branch.id, randomUUID(), f.sale(40)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.inventory.id } }))
      .balance,
    10,
  );
  await code(
    sellPoints(db, f.cashier.id, f.branch.id, randomUUID(), {
      ...f.sale(1),
      receivedAmountPiasters: "1",
    }),
    "PAYMENT_AMOUNT_MISMATCH",
  );
  await code(
    sellPoints(db, f.cashier.id, f.branch.id, randomUUID(), {
      ...f.sale(1),
      pricingVersion: f.p.version + 1,
    }),
    "STALE_SETTINGS",
  );
  await code(
    sellPoints(db, f.cashier.id, f.branch.id, randomUUID(), {
      ...f.sale(1),
      fundsReceived: false,
    }),
    "INVALID_INPUT",
  );
});
test("cashier assignment, trainee activity and expired positive wallets are rechecked", async () => {
  const f = await fixture();
  for (const user of [f.admin])
    await code(
      quoteSale(db, user.id, f.branch.id, {
        traineeId: f.person.id,
        points: 1,
      }),
      "BRANCH_ACCESS_DENIED",
    );
  await db.pointAccount.update({
    where: { id: f.wallet.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await code(
    sellPoints(db, f.cashier.id, f.branch.id, randomUUID(), f.sale()),
    "WALLET_EXPIRY_REVIEW_REQUIRED",
  );
  await db.user.update({
    where: { id: f.person.id },
    data: { isActive: false },
  });
  await code(
    quoteSale(db, f.cashier.id, f.branch.id, {
      traineeId: f.person.id,
      points: 1,
    }),
    "TRAINEE_UNAVAILABLE",
  );
});
test("QRs rotate, bind to login sessions and never disclose identity in token payload", async () => {
  const f = await fixture(),
    first = await f.qr(),
    second = await f.qr();
  assert.notEqual(first.token, second.token);
  assert.equal(second.token.length, 43);
  await code(
    previewVisit(db, f.cashier.id, f.branch.id, { token: first.token }),
    "QR_INVALID",
  );
  await db.authSession.updateMany({
    where: { userId: f.person.id },
    data: { revokedAt: new Date() },
  });
  await code(
    previewVisit(db, f.cashier.id, f.branch.id, { token: second.token }),
    "QR_INVALID",
  );
});
test("parallel scans consume one visit and credit the hosting gym once, independent of stock", async () => {
  const f = await fixture(0, 80),
    qr = await f.qr();
  const results = await Promise.all([
    confirmVisit(
      db,
      f.cashier.id,
      f.branch.id,
      randomUUID(),
      f.entry(qr.token),
    ),
    confirmVisit(
      db,
      f.cashier2.id,
      f.branch.id,
      randomUUID(),
      f.entry(qr.token),
    ),
  ]);
  assert.equal(new Set(results.map((r) => r.visit.id)).size, 1);
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    50,
  );
  const money = await db.moneyAccount.findFirstOrThrow({
    where: { gymId: f.gym.id, type: "GYM_AVAILABLE" },
  });
  const expected =
    (30n * f.p.pointPricePiasters * BigInt(f.p.redemptionBps) + 9999n) / 10000n;
  assert.equal(money.balancePiasters, expected);
  assert.equal(money.branchId, null);
  const fresh = await f.qr(),
    again = await confirmVisit(
      db,
      f.cashier.id,
      f.branch.id,
      randomUUID(),
      f.entry(fresh.token),
    );
  assert.equal(again.alreadyActive, true);
  assert.equal(again.visit.id, results[0]!.visit.id);
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    50,
  );
  await assert.rejects(
    db.visit.update({
      where: { id: again.visit.id },
      data: { pointsCharged: 1 },
    }),
  );
});
test("insufficient funds and revoked cashier assignment roll back visit, token and money together", async () => {
  const f = await fixture(0, 20),
    qr = await f.qr();
  await code(
    confirmVisit(
      db,
      f.cashier.id,
      f.branch.id,
      randomUUID(),
      f.entry(qr.token),
    ),
    "INSUFFICIENT_POINTS",
  );
  assert.equal(await db.visit.count({ where: { traineeId: f.person.id } }), 0);
  assert.equal(
    (await db.qrTicket.findUniqueOrThrow({ where: { userId: f.person.id } }))
      .consumedAt,
    null,
  );
  assert.equal(await db.moneyAccount.count({ where: { gymId: f.gym.id } }), 0);
  await db.staffAssignment.updateMany({
    where: { userId: f.cashier.id },
    data: { active: false },
  });
  await code(
    confirmVisit(
      db,
      f.cashier.id,
      f.branch.id,
      randomUUID(),
      f.entry(qr.token),
    ),
    "BRANCH_ACCESS_DENIED",
  );
});
test("visit retry remains idempotent after QR expiration; expired QR cannot create a new visit", async () => {
  const f = await fixture(),
    qr = await f.qr(),
    key = randomUUID(),
    body = f.entry(qr.token);
  const first = await confirmVisit(db, f.cashier.id, f.branch.id, key, body);
  await db.qrTicket.update({
    where: { userId: f.person.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.equal(
    (await confirmVisit(db, f.cashier.id, f.branch.id, key, body)).visit.id,
    first.visit.id,
  );
  await code(
    confirmVisit(db, f.cashier.id, f.branch.id, randomUUID(), body),
    "QR_INVALID",
  );
});
test("cross-gym QR replay, false physical presence and branch pricing changes are rejected", async () => {
  const f = await fixture(),
    qr = await f.qr();
  await code(
    confirmVisit(db, f.cashier.id, f.branch.id, randomUUID(), {
      ...f.entry(qr.token),
      presenceConfirmed: false,
    }),
    "INVALID_INPUT",
  );
  await code(
    confirmVisit(db, f.cashier.id, f.branch.id, randomUUID(), {
      ...f.entry(qr.token),
      branchPricingVersion: 2,
    }),
    "STALE_SETTINGS",
  );
  const confirmed = await confirmVisit(
    db,
    f.cashier.id,
    f.branch.id,
    randomUUID(),
    f.entry(qr.token),
  );
  const other = await db.branch.create({
    data: {
      gymId: f.gym.id,
      name: "Other Branch",
      status: "ACTIVE",
      visitPricePoints: 20,
      sessionMinutes: 120,
      pricingVersion: 1,
      priceApprovedAt: new Date(),
    },
  });
  await db.staffAssignment.create({
    data: { userId: f.cashier.id, branchId: other.id, role: "CASHIER" },
  });
  await code(
    previewVisit(db, f.cashier.id, other.id, { token: qr.token }),
    "QR_ALREADY_USED",
  );
  assert.equal(confirmed.visit.pointsCharged, 30);
});

test("expired sessions transition inside entry transaction and a fresh QR creates a new paid visit", async (t) => {
  const f = await fixture(0, 100);
  await db.authSession.updateMany({
    where: { userId: f.person.id },
    data: { expiresAt: new Date(Date.now() + 4 * 3600000) },
  });
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  try {
    const firstQr = await f.qr(),
      first = await confirmVisit(
        db,
        f.cashier.id,
        f.branch.id,
        randomUUID(),
        f.entry(firstQr.token),
      );
    t.mock.timers.tick(121 * 60000);
    const secondQr = await f.qr(),
      second = await confirmVisit(
        db,
        f.cashier.id,
        f.branch.id,
        randomUUID(),
        f.entry(secondQr.token),
      );
    assert.notEqual(first.visit.id, second.visit.id);
    assert.equal(
      (await db.visit.findUniqueOrThrow({ where: { id: first.visit.id } }))
        .status,
      "EXPIRED",
    );
    assert.equal(
      (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
        .balance,
      40,
    );
  } finally {
    t.mock.timers.reset();
  }
});

test("distribution gym earns no visit receivable; hosting gym keeps its original rate snapshot", async () => {
  const distributor = await fixture(100, 0),
    host = await fixture(0, 0);
  await sellPoints(
    db,
    distributor.cashier.id,
    distributor.branch.id,
    randomUUID(),
    { ...distributor.sale(60), traineeId: host.person.id },
  );
  const qr = await host.qr(),
    entry = await confirmVisit(
      db,
      host.cashier.id,
      host.branch.id,
      randomUUID(),
      host.entry(qr.token),
    );
  assert.equal(
    await db.moneyAccount.count({ where: { gymId: distributor.gym.id } }),
    0,
  );
  const original = await db.visit.findUniqueOrThrow({
    where: { id: entry.visit.id },
  });
  await db.pricingPolicy.create({
    data: {
      version: host.p.version + 1,
      pointPricePiasters: 150n,
      gymDiscountBps: 1000,
      redemptionBps: 7000,
      createdById: host.admin.id,
    },
  });
  assert.equal(
    (await db.visit.findUniqueOrThrow({ where: { id: entry.visit.id } }))
      .settlementPiasters,
    original.settlementPiasters,
  );
  assert.equal(
    (
      await db.pointAccount.findUniqueOrThrow({
        where: { id: distributor.inventory.id },
      })
    ).balance,
    40,
  );
  assert.equal(
    (
      await db.pointAccount.findUniqueOrThrow({
        where: { id: host.inventory.id },
      })
    ).balance,
    0,
  );
});

async function visited() {
  const f = await fixture();
  const qr = await f.qr();
  const entry = await confirmVisit(
    db,
    f.cashier.id,
    f.branch.id,
    randomUUID(),
    f.entry(qr.token),
  );
  return { ...f, visit: entry.visit, token: qr.token };
}
const cancelReason = { reason: "Synthetic duplicate attendance correction" };
const reviewBody = (
  targetId: string,
  kind: "VISIT_CANCEL" | "SALE_CORRECTION" = "VISIT_CANCEL",
) => ({
  kind,
  targetId,
  reason: "Synthetic review of incorrect operation",
  evidenceText: "Synthetic attendance record and cashier explanation",
});

test("manager cancellation reverses both exact original legs once under concurrent retries without renewing expiry", async () => {
  const f = await visited(),
    key = randomUUID();
  const before = await db.pointAccount.findUniqueOrThrow({
    where: { id: f.wallet.id },
  });
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      cancelVisit(db, f.manager.id, f.branch.id, f.visit.id, key, cancelReason),
    ),
  );
  assert.equal(new Set(results.map((r) => r.id)).size, 1);
  const row = await db.visit.findUniqueOrThrow({ where: { id: f.visit.id } });
  assert.equal(row.status, "CANCELLED");
  assert.equal(row.cancelledById, f.manager.id);
  const wallet = await db.pointAccount.findUniqueOrThrow({
    where: { id: f.wallet.id },
  });
  assert.equal(wallet.balance, 80);
  assert.deepEqual(wallet.expiresAt, before.expiresAt);
  const money = await db.moneyAccount.findFirstOrThrow({
    where: { gymId: f.gym.id, type: "GYM_AVAILABLE" },
  });
  assert.equal(money.balancePiasters, 0n);
  const p = await db.pointTransaction.findUniqueOrThrow({
    where: { id: results[0]!.pointTransactionId },
    include: { postings: true },
  });
  const m = await db.moneyTransaction.findUniqueOrThrow({
    where: { id: results[0]!.moneyTransactionId },
    include: { postings: true },
  });
  assert.equal(p.reversalOfId, row.pointTransactionId);
  assert.equal(m.reversalOfId, row.moneyTransactionId);
  assert.equal(
    m.postings.find((x) => x.accountId === money.id)!.deltaPiasters,
    -row.settlementPiasters,
  );
  assert.equal(
    p.postings.find((x) => x.accountId === f.wallet.id)!.delta,
    row.pointsCharged,
  );
  await code(
    cancelVisit(db, f.manager.id, f.branch.id, f.visit.id, key, {
      reason: "Different explanation",
    }),
    "IDEMPOTENCY_CONFLICT",
  );
  await code(
    cancelVisit(
      db,
      f.manager.id,
      f.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "VISIT_ALREADY_CANCELLED",
  );
  await code(
    previewVisit(db, f.cashier.id, f.branch.id, { token: f.token }),
    "QR_ALREADY_USED",
  );
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: row.id } }),
    1,
  );
});

test("direct cancellation requires owner or assigned active manager in the exact branch, never admin/cashier", async () => {
  const f = await visited(),
    other = await fixture();
  for (const actor of [f.cashier, other.owner, f.admin, f.person, other.manager])
    await code(
      cancelVisit(
        db,
        actor.id,
        f.branch.id,
        f.visit.id,
        randomUUID(),
        cancelReason,
      ),
      "BRANCH_ACCESS_DENIED",
    );
  await code(
    cancelVisit(
      db,
      other.manager.id,
      other.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "BRANCH_ACCESS_DENIED",
  );
  await db.staffAssignment.updateMany({
    where: { userId: f.manager.id },
    data: { active: false },
  });
  await code(
    cancelVisit(
      db,
      f.manager.id,
      f.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "BRANCH_ACCESS_DENIED",
  );
  assert.equal(
    (await db.visit.findUniqueOrThrow({ where: { id: f.visit.id } })).status,
    "ACTIVE",
  );
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: f.visit.id } }),
    0,
  );
});

test("ten-minute deadline is inclusive, replay survives it and later corrections require admin review", async (t) => {
  const a = await visited(),
    b = await visited(),
    key = randomUUID();
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date(a.visit.startedAt).getTime() + 600000,
  });
  try {
    const cancelled = await cancelVisit(
      db,
      a.manager.id,
      a.branch.id,
      a.visit.id,
      key,
      cancelReason,
    );
    t.mock.timers.tick(60001);
    assert.equal(
      (
        await cancelVisit(
          db,
          a.manager.id,
          a.branch.id,
          a.visit.id,
          key,
          cancelReason,
        )
      ).id,
      cancelled.id,
    );
    await code(
      cancelVisit(
        db,
        b.manager.id,
        b.branch.id,
        b.visit.id,
        randomUUID(),
        cancelReason,
      ),
      "CANCEL_WINDOW_CLOSED",
    );
    const request = await requestReview(
      db,
      b.person.id,
      randomUUID(),
      reviewBody(b.visit.id),
    );
    await code(
      decideReview(db, b.manager.id, request.id, {
        decision: "APPROVE",
        reason: "Synthetic approval",
      }),
      "ACCESS_DENIED",
    );
    const result = await decideReview(db, b.admin.id, request.id, {
      decision: "APPROVE",
      reason: "Synthetic administrator verified correction",
    });
    assert.equal(result.status, "APPROVED");
    assert.equal(
      (await db.visit.findUniqueOrThrow({ where: { id: b.visit.id } })).status,
      "CANCELLED",
    );
  } finally {
    t.mock.timers.reset();
  }
});

test("review request is scoped and replayable; other customers cannot read it or attach someone else evidence", async () => {
  const f = await visited(),
    other = await fixture(),
    key = randomUUID();
  await code(
    requestReview(db, other.person.id, randomUUID(), reviewBody(f.visit.id)),
    "BRANCH_ACCESS_DENIED",
  );
  const receipt = await db.receiptEvidence.create({
    data: {
      ownerUserId: other.person.id,
      objectKey: `synthetic-review-${key}`,
      assetId: `synthetic-review-${key}`,
      contentHash: `review-${key}`,
      mimeType: "image/jpeg",
      bytes: 10,
    },
  });
  await code(
    requestReview(db, f.person.id, randomUUID(), {
      ...reviewBody(f.visit.id),
      evidenceId: receipt.id,
    }),
    "RECEIPT_ACCESS_DENIED",
  );
  const rows = await Promise.all(
    [1, 2].map(() =>
      requestReview(db, f.person.id, key, reviewBody(f.visit.id)),
    ),
  );
  assert.equal(rows[0]!.id, rows[1]!.id);
  await code(
    requestReview(db, f.person.id, key, {
      ...reviewBody(f.visit.id),
      reason: "Different review reason",
    }),
    "IDEMPOTENCY_CONFLICT",
  );
  await code(
    requestReview(db, f.manager.id, randomUUID(), reviewBody(f.visit.id)),
    "OPERATION_REVIEW_EXISTS",
  );
  await code(
    cancelVisit(
      db,
      f.manager.id,
      f.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "OPERATION_REVIEW_EXISTS",
  );
  const app = buildApp(db),
    bearer = await createSession(
      db,
      other.person.id,
      new Date(Date.now() + 60000),
    );
  try {
    const list = await app.inject({
      method: "GET",
      url: "/operation-reviews",
      headers: { authorization: `Bearer ${bearer}` },
    });
    assert.equal(list.statusCode, 200);
    assert.equal(
      list.json().items.some((r: { id: string }) => r.id === rows[0]!.id),
      false,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/admin/operation-reviews/${rows[0]!.id}`,
          headers: { authorization: `Bearer ${bearer}` },
        })
      ).statusCode,
      403,
    );
  } finally {
    await app.close();
  }
});

test("concurrent review approval and rejection produce one terminal decision with atomic balanced reversal", async () => {
  const f = await visited(),
    r = await requestReview(
      db,
      f.owner.id,
      randomUUID(),
      reviewBody(f.visit.id),
    );
  const approval = {
    decision: "APPROVE",
    reason: "Synthetic approved after investigation",
  };
  const rejection = {
    decision: "REJECT",
    reason: "Synthetic rejected after investigation",
  };
  const results = await Promise.allSettled([
    decideReview(db, f.admin.id, r.id, approval),
    decideReview(db, f.admin.id, r.id, rejection),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const final = await db.operationReview.findUniqueOrThrow({
    where: { id: r.id },
  });
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: f.visit.id } }),
    final.status === "APPROVED" ? 1 : 0,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    final.status === "APPROVED" ? 80 : 50,
  );
  const decision = final.status === "APPROVED" ? approval : rejection;
  assert.equal((await decideReview(db, f.admin.id, r.id, decision)).id, r.id);
  await assert.rejects(
    db.operationReview.update({
      where: { id: r.id },
      data: { reason: "Mutated evidence" },
    }),
  );
  await assert.rejects(db.operationReview.delete({ where: { id: r.id } }));
});

test("different manager cancellation keys race without duplicate refunds", async () => {
  const f = await visited();
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      cancelVisit(
        db,
        f.manager.id,
        f.branch.id,
        f.visit.id,
        randomUUID(),
        cancelReason,
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: f.visit.id } }),
    1,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    80,
  );
});

test("expired wallet cancellation and approval leave both ledgers and request untouched", async () => {
  const f = await visited();
  await db.pointAccount.update({
    where: { id: f.wallet.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await code(
    cancelVisit(
      db,
      f.manager.id,
      f.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "WALLET_EXPIRY_REVIEW_REQUIRED",
  );
  const r = await requestReview(
    db,
    f.person.id,
    randomUUID(),
    reviewBody(f.visit.id),
  );
  await code(
    decideReview(db, f.admin.id, r.id, {
      decision: "APPROVE",
      reason: "Synthetic invalid expiry approval",
    }),
    "WALLET_EXPIRY_REVIEW_REQUIRED",
  );
  assert.equal(
    (await db.operationReview.findUniqueOrThrow({ where: { id: r.id } }))
      .status,
    "PENDING",
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    50,
  );
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: f.visit.id } }),
    0,
  );
});

test("prior reservation or payment blocks cancellation even after available cash is refilled", async () => {
  const f = await visited();
  const available = await db.moneyAccount.findFirstOrThrow({
    where: { gymId: f.gym.id, type: "GYM_AVAILABLE" },
  });
  const reserved = await db.moneyAccount.create({
    data: { gymId: f.gym.id, type: "GYM_RESERVED" },
  });
  await postLedger(db, {
    actorId: f.admin.id,
    idempotencyKey: randomUUID(),
    reason: "Synthetic future payout reservation",
    money: {
      kind: "WITHDRAWAL_RESERVE",
      entries: [
        { accountId: available.id, delta: -1n },
        { accountId: reserved.id, delta: 1n },
      ],
    },
  });
  const offset = await db.moneyAccount.findFirstOrThrow({
    where: { type: "PLATFORM_OFFSET" },
  });
  await postLedger(db, {
    actorId: f.admin.id,
    idempotencyKey: randomUUID(),
    reason: "Synthetic later cash refill",
    money: {
      kind: "ADJUSTMENT",
      entries: [
        { accountId: offset.id, delta: -1000n },
        { accountId: available.id, delta: 1000n },
      ],
    },
  });
  await code(
    cancelVisit(
      db,
      f.manager.id,
      f.branch.id,
      f.visit.id,
      randomUUID(),
      cancelReason,
    ),
    "SETTLEMENT_REVIEW_REQUIRED",
  );
  const r = await requestReview(
    db,
    f.owner.id,
    randomUUID(),
    reviewBody(f.visit.id),
  );
  await code(
    decideReview(db, f.admin.id, r.id, {
      decision: "APPROVE",
      reason: "Synthetic unsafe payout clawback",
    }),
    "SETTLEMENT_REVIEW_REQUIRED",
  );
  assert.equal(
    (await db.operationReview.findUniqueOrThrow({ where: { id: r.id } }))
      .status,
    "PENDING",
  );
  assert.equal(
    await db.visitCancellation.count({ where: { visitId: f.visit.id } }),
    0,
  );
});

test("sale correction is review-only pending refund policy; no point or cash movement is invented", async () => {
  const f = await fixture(),
    s = await sellPoints(
      db,
      f.cashier.id,
      f.branch.id,
      randomUUID(),
      f.sale(20),
    );
  const r = await requestReview(
    db,
    f.cashier.id,
    randomUUID(),
    reviewBody(s.id, "SALE_CORRECTION"),
  );
  const counts = [
    await db.pointTransaction.count(),
    await db.moneyTransaction.count(),
  ];
  await code(
    decideReview(db, f.admin.id, r.id, {
      decision: "APPROVE",
      reason: "Synthetic unapproved refund policy",
    }),
    "SALE_REFUND_POLICY_REQUIRED",
  );
  const rejected = await decideReview(db, f.admin.id, r.id, {
    decision: "REJECT",
    reason: "Synthetic corrected receipt verified",
  });
  assert.equal(rejected.status, "REJECTED");
  assert.deepEqual(
    [await db.pointTransaction.count(), await db.moneyTransaction.count()],
    counts,
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    100,
  );
});

test("database rejects forged cancellation metadata, orphan approval and mutation of cancellation receipts", async () => {
  const f = await visited();
  await assert.rejects(
    db.visit.update({
      where: { id: f.visit.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: f.manager.id,
        cancellationReason: "Forged cancellation without postings",
      },
    }),
  );
  const r = await requestReview(
    db,
    f.person.id,
    randomUUID(),
    reviewBody(f.visit.id),
  );
  await assert.rejects(
    db.operationReview.update({
      where: { id: r.id },
      data: {
        status: "APPROVED",
        reviewedAt: new Date(),
        reviewedById: f.admin.id,
        reviewReason: "Forged approval without reversal",
      },
    }),
  );
  await assert.rejects(
    db.operationReview.update({
      where: { id: r.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedById: f.admin.id,
      },
    }),
  );
  await decideReview(db, f.admin.id, r.id, {
    decision: "APPROVE",
    reason: "Synthetic verified cancellation",
  });
  const c = await db.visitCancellation.findUniqueOrThrow({
    where: { visitId: f.visit.id },
  });
  await assert.rejects(
    db.visitCancellation.update({
      where: { id: c.id },
      data: { reason: "Mutable reversal facts" },
    }),
  );
  await assert.rejects(db.visitCancellation.delete({ where: { id: c.id } }));
});

test("cancellation uses the original financial snapshot after platform pricing changes", async () => {
  const f = await visited();
  await db.pricingPolicy.create({
    data: {
      version: f.p.version + 1,
      pointPricePiasters: 190n,
      gymDiscountBps: 2000,
      redemptionBps: 5000,
      createdById: f.admin.id,
    },
  });
  const r = await cancelVisit(
    db,
    f.manager.id,
    f.branch.id,
    f.visit.id,
    randomUUID(),
    cancelReason,
  );
  const money = await db.moneyTransaction.findUniqueOrThrow({
    where: { id: r.moneyTransactionId },
    include: { postings: true },
  });
  assert.equal(
    money.postings.find((p) => p.deltaPiasters > 0n)!.deltaPiasters.toString(),
    f.visit.settlementPiasters,
  );
});

test("database rejects a balanced but incomplete cancellation reversal atomically", async () => {
  const f = await visited(),
    row = await db.visit.findUniqueOrThrow({ where: { id: f.visit.id } });
  const redeemed = await db.pointAccount.findFirstOrThrow({
    where: { type: "REDEEMED" },
  });
  const available = await db.moneyAccount.findFirstOrThrow({
    where: { type: "GYM_AVAILABLE", gymId: f.gym.id },
  });
  const offset = await db.moneyAccount.findFirstOrThrow({
    where: { type: "PLATFORM_OFFSET" },
  });
  await assert.rejects(
    db.$transaction(async (tx) => {
      const id = randomUUID(),
        key = randomUUID();
      const legs = await postInTransaction(tx, {
        actorId: f.admin.id,
        idempotencyKey: key,
        referenceId: id,
        reason: cancelReason.reason,
        points: {
          kind: "VISIT_REVERSAL",
          reversalOfId: row.pointTransactionId,
          entries: [
            { accountId: f.wallet.id, delta: 1n },
            { accountId: redeemed.id, delta: -1n },
          ],
        },
        money: {
          kind: "VISIT_REVERSAL",
          reversalOfId: row.moneyTransactionId,
          entries: [
            { accountId: available.id, delta: -1n },
            { accountId: offset.id, delta: 1n },
          ],
        },
      });
      await tx.visitCancellation.create({
        data: {
          id,
          visitId: row.id,
          actorId: f.admin.id,
          reason: cancelReason.reason,
          idempotencyKey: key,
          requestHash: "a".repeat(64),
          pointTransactionId: legs.pointTransactionId!,
          moneyTransactionId: legs.moneyTransactionId!,
        },
      });
      await tx.visit.update({
        where: { id: row.id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: f.admin.id,
          cancellationReason: cancelReason.reason,
        },
      });
    }),
  );
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    50,
  );
  assert.equal(
    (await db.visit.findUniqueOrThrow({ where: { id: row.id } })).status,
    "ACTIVE",
  );
  assert.equal(
    await db.pointTransaction.count({
      where: { reversalOfId: row.pointTransactionId },
    }),
    0,
  );
  assert.equal(
    await db.moneyTransaction.count({
      where: { reversalOfId: row.moneyTransactionId },
    }),
    0,
  );
});

test("different review keys racing for the same operation return one case and a scoped conflict", async () => {
  const f = await visited();
  const results = await Promise.allSettled(
    [f.manager.id, f.person.id].map((actorId) =>
      requestReview(db, actorId, randomUUID(), reviewBody(f.visit.id)),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const failure = results.find((r) => r.status === "rejected");
  assert.ok(failure?.status === "rejected");
  assert.equal(failure.reason.code, "OPERATION_REVIEW_EXISTS");
  assert.equal(
    await db.operationReview.count({ where: { visitId: f.visit.id } }),
    1,
  );
});

test('a visit dispute holds only the specified amount and release restores it once without touching points',async()=>{
 const {createHold,releaseHold,listHolds}=await import('../src/disputes/service.js');
 const f=await fixture(),q=await f.qr(),v=await confirmVisit(db,f.cashier.id,f.branch.id,randomUUID(),f.entry(q.token));
 const before=(await db.moneyAccount.findFirstOrThrow({where:{gymId:f.gym.id,type:'GYM_AVAILABLE'}})).balancePiasters;
 const body={visitId:v.visit.id,amountPiasters:'40',reason:'Synthetic partial amount under review',key:randomUUID(),confirmed:true};
 const [a,b]=await Promise.all([createHold(db,f.admin.id,body),createHold(db,f.admin.id,body)]);assert.equal(a.id,b.id);
 assert.equal((await db.moneyAccount.findFirstOrThrow({where:{gymId:f.gym.id,type:'GYM_AVAILABLE'}})).balancePiasters,before-40n);
 assert.equal((await db.moneyAccount.findFirstOrThrow({where:{gymId:f.gym.id,type:'GYM_DISPUTED'}})).balancePiasters,40n);
 await code(cancelVisit(db,f.manager.id,f.branch.id,v.visit.id,randomUUID(),{reason:'Synthetic blocked cancellation under dispute'}),'SETTLEMENT_REVIEW_REQUIRED');
 await code(createHold(db,f.owner.id,{...body,key:randomUUID()}),'ACCESS_DENIED');
 assert.equal((await listHolds(db,f.owner.id,{})).items.length,1);await code(listHolds(db,f.person.id,{}),'ACCESS_DENIED');
 const release={key:randomUUID(),reason:'Synthetic investigation completed; release hold',confirmed:true};await releaseHold(db,f.admin.id,a.id,release);await releaseHold(db,f.admin.id,a.id,release);
 assert.equal((await db.moneyAccount.findFirstOrThrow({where:{gymId:f.gym.id,type:'GYM_AVAILABLE'}})).balancePiasters,before);
 assert.equal((await db.moneyAccount.findFirstOrThrow({where:{gymId:f.gym.id,type:'GYM_DISPUTED'}})).balancePiasters,0n);
 assert.equal((await db.pointAccount.findUniqueOrThrow({where:{id:f.wallet.id}})).balance,50);
 await assert.rejects(db.financialHold.delete({where:{id:a.id}}));
});
test('a dispute cannot exceed visit entitlement or silently use later earnings after a withdrawal',async()=>{
 const {createHold}=await import('../src/disputes/service.js');const {requestWithdrawal}=await import('../src/withdrawals/service.js');
 const f=await fixture(),q=await f.qr(),v=await confirmVisit(db,f.cashier.id,f.branch.id,randomUUID(),f.entry(q.token));
 await code(createHold(db,f.admin.id,{visitId:v.visit.id,amountPiasters:(BigInt(v.visit.settlementPiasters)+1n).toString(),reason:'Synthetic over-sized hold rejected',key:randomUUID(),confirmed:true}),'INVALID_INPUT');
 await requestWithdrawal(db,f.owner.id,f.gym.id,randomUUID(),{amountPiasters:'1',paymentMethod:'WALLET',destinationAccount:'+201000000001',destinationName:'Synthetic owner'});
 await code(createHold(db,f.admin.id,{visitId:v.visit.id,amountPiasters:'1',reason:'Synthetic intervening payout requires review',key:randomUUID(),confirmed:true}),'SETTLEMENT_REVIEW_REQUIRED');
});


test('owner and delegated manager cannot reserve the same branch entitlement twice', async()=>{
 const {saveDelegation}=await import('../src/gyms/delegations.js');
 const {branchEntitlements}=await import('../src/withdrawals/allocation.js');
 const {requestWithdrawal,cancelWithdrawal}=await import('../src/withdrawals/service.js');
 const f=await fixture();const q=await f.qr();await confirmVisit(db,f.cashier.id,f.branch.id,randomUUID(),f.entry(q.token));
 const [earned]=await db.$transaction(tx=>branchEntitlements(tx,f.gym.id));assert.ok(earned!.available>0n);
 const body={amountPiasters:earned!.available.toString(),paymentMethod:'INSTAPAY',destinationAccount:'synthetic@bank',destinationName:'Synthetic recipient'};
 await assert.rejects(requestWithdrawal(db,f.manager.id,f.gym.id,randomUUID(),{...body,branchId:f.branch.id}));
 await saveDelegation(db,f.owner.id,f.gym.id,{userId:f.manager.id,branchId:f.branch.id,permissions:['REQUEST_WITHDRAWAL'],fullAccess:false,active:true,expectedVersion:0});
 const results=await Promise.allSettled([requestWithdrawal(db,f.owner.id,f.gym.id,randomUUID(),body),requestWithdrawal(db,f.manager.id,f.gym.id,randomUUID(),{...body,branchId:f.branch.id})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const won=results.find(r=>r.status==='fulfilled');assert.ok(won&&won.status==='fulfilled');
 const used=await db.withdrawalAllocation.aggregate({where:{withdrawalId:won.value.id},_sum:{amountPiasters:true}});assert.equal(used._sum.amountPiasters,earned!.available);
 const [after]=await db.$transaction(tx=>branchEntitlements(tx,f.gym.id));assert.equal(after!.available,0n);
 await cancelWithdrawal(db,f.owner.id,won.value.id,randomUUID(),{reason:'Synthetic release for retry'});
 const retryKey=randomUUID(),retry=await requestWithdrawal(db,f.manager.id,f.gym.id,retryKey,{...body,branchId:f.branch.id});
 assert.equal((await requestWithdrawal(db,f.manager.id,f.gym.id,retryKey,{...body,branchId:f.branch.id})).id,retry.id);
 const row=await db.withdrawalRequest.findUniqueOrThrow({where:{id:retry.id}});assert.equal(row.branchId,f.branch.id);
 const {decideWithdrawal}=await import('../src/withdrawals/service.js');const calendar=await db.withdrawalCalendar.findFirst({orderBy:{version:'desc'}});
 const approval=decideWithdrawal(db,f.admin.id,retry.id,randomUUID(),{decision:'APPROVE',reason:'Synthetic delegated request review',calendarVersion:calendar?.version??1,destinationVerified:true});
 if(calendar)assert.equal((await approval).status,'APPROVED');else await assert.rejects(approval,(e:unknown)=>typeof e==='object'&&e!==null&&'code' in e&&e.code==='CALENDAR_NOT_CONFIGURED');

 await assert.rejects(db.$executeRaw`UPDATE "WithdrawalAllocation" SET "amountPiasters"=1 WHERE "withdrawalId"=${retry.id}::uuid`);
});
