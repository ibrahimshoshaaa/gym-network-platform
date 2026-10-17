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
import { postLedger, reverseLedger } from "../src/ledger/service.js";
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
  for (const user of [f.owner, f.admin, f.manager])
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
