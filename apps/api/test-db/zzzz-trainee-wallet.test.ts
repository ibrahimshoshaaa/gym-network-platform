import {pointQuote} from '../src/points/service.js';
import {creditFromPlatform} from './platform-credit-fixture.js';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  walletSummary,
  walletMovements,
  traineeVisits,
} from "../src/wallet/service.js";
import { postLedger } from "../src/ledger/service.js";
import {
  confirmVisit,
  issueQr,
} from "../src/operations/service.js";
import { cancelVisit } from "../src/reviews/service.js";
import { submitTopup, reviewTopup } from "../src/topups/service.js";
import { createSession } from "../src/auth/sessions.js";
import { buildApp } from "../src/app.js";
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
        displayName: "Private Wallet Identity",
        phoneE164: `+20wal${randomUUID()}`,
      },
    });
  const admin = await user("PLATFORM_ADMIN"),
    owner = await user("GYM_OWNER"),
    cashier = await user("CASHIER"),
    manager = await user("BRANCH_MANAGER"),
    trainee = await user("TRAINEE"),
    other = await user("TRAINEE");
  const gym = await db.gym.create({
      data: {
        name: "Synthetic Wallet Gym",
        ownerId: owner.id,
        ownerAcceptedAt: new Date(),
        status: "ACTIVE",
      },
    }),
    branch = await db.branch.create({
      data: {
        gymId: gym.id,
        name: "Synthetic Wallet Branch",
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
      { userId: manager.id, branchId: branch.id, role: "BRANCH_MANAGER" },
    ],
  });
  const wallet = await db.pointAccount.create({
      data: {
        type: "TRAINEE_WALLET",
        ownerUserId: trainee.id,
        expiresAt: new Date(Date.now() + 90 * 86400000),
      },
    }),
    issuance = await db.pointAccount.findFirstOrThrow({
      where: { type: "ISSUANCE" },
    });
  await db.pointAccount.create({
    data: { type: "TRAINEE_WALLET", ownerUserId: other.id },
  });
  await postLedger(db, {
    actorId: admin.id,
    idempotencyKey: randomUUID(),
    reason: "Private synthetic funding reason",
    points: {
      kind: "ADJUSTMENT",
      entries: [
        { accountId: issuance.id, delta: -120n },
        { accountId: wallet.id, delta: 120n },
              ],
    },
  });
  const p = await db.pricingPolicy.findFirstOrThrow({
      orderBy: { version: "desc" },
    }),
    token = await createSession(
      db,
      trainee.id,
      new Date(Date.now() + 90 * 86400000),
    );
  const credit = (points=10)=>creditFromPlatform(db,admin.id,trainee.id,points);
  const visit = async () => {
    const qr = await issueQr(db, trainee.id, token);
    return confirmVisit(db, cashier.id, branch.id, randomUUID(), {
      token: qr.token,
      pricingVersion: p.version,
      branchPricingVersion: 1,
      presenceConfirmed: true,
    });
  };
  return {
    admin,
    owner,
    cashier,
    manager,
    trainee,
    other,
    gym,
    branch,
    wallet,
    p,
    token,
    credit,
    visit,
  };
}
test("trainee wallet summary/history are read-only and expose only own signed point movements", async () => {
  const f = await fixture(),
    before = [
      await db.pointTransaction.count(),
      await db.moneyTransaction.count(),
    ],
    s = await walletSummary(db, f.trainee.id),
    rows = await walletMovements(db, f.trainee.id, {});
  assert.equal(s.balance, 120);
  assert.equal(s.spendablePoints, 120);
  assert.equal(s.status, "VALID");
  assert.equal(rows.items.length, 1);
  assert.equal(rows.items[0]!.delta, 120);
  assert.equal(rows.items[0]!.operation, "ADJUSTMENT");
  assert.equal((await walletMovements(db, f.other.id, {})).items.length, 0);
  assert.equal(
    /actorId|ownerUserId|requestHash|phoneE164|Private synthetic/.test(
      JSON.stringify(rows),
    ),
    false,
  );
  assert.deepEqual(
    [await db.pointTransaction.count(), await db.moneyTransaction.count()],
    before,
  );
});
test("pending topups do not enter wallet history; approved topups appear once with the original request reference", async () => {
  const f = await fixture(),
    method = await db.paymentMethod.findFirstOrThrow({
      where: { enabled: true },
    }),
    asset = randomUUID(),
    receipt = await db.receiptEvidence.create({
      data: {
        ownerUserId: f.trainee.id,
        objectKey: `private-wallet/${asset}`,
        assetId: asset,
        contentHash: asset,
        mimeType: "image/jpeg",
        bytes: 10,
      },
    });
  const r = await submitTopup(db, f.trainee.id, randomUUID(), {
    kind: "TRAINEE",
    points: 20,
    pricingVersion: f.p.version,
    receiptId: receipt.id,
    paymentMethod: method.type,
    paymentMethodVersion: method.version,
  });
  assert.equal(
    (await walletMovements(db, f.trainee.id, { operation: "TOPUP" })).items
      .length,
    0,
  );
  const approval = {
    decision: "APPROVED",
    reason: "Synthetic independently verified receipt",
    paymentReference: randomUUID(),
    receivedAmountPiasters: r.chargePiasters,
    fundsReceived: true,
    receiptReviewed: true,
  };
  await reviewTopup(db, f.admin.id, r.id, approval);
  await reviewTopup(db, f.admin.id, r.id, approval);
  const rows = await walletMovements(db, f.trainee.id, { operation: "TOPUP" });
  assert.equal(rows.items.length, 1);
  assert.equal(rows.items[0]!.delta, 20);
  assert.equal(rows.items[0]!.referenceId, r.id);
  assert.equal((await walletSummary(db, f.trainee.id)).balance, 140);
  assert.equal(JSON.stringify(rows).includes(asset), false);
});
test("sale, visit consumption and cancellation restore exact points and link the same original visit", async () => {
  const f = await fixture(),
    sale = await f.credit(),
    v = await f.visit();
  await cancelVisit(db, f.manager.id, f.branch.id, v.visit.id, randomUUID(), {
    reason: "Synthetic valid visit cancellation",
  });
  const rows = await walletMovements(db, f.trainee.id, {});
  for (const [operation, delta, reference] of [
    ["TOPUP", 10, sale.id],
    ["VISIT", -30, v.visit.id],
    ["VISIT_CANCELLATION", 30, v.visit.id],
  ] as const) {
    const row = rows.items.find((x) => x.operation === operation);
    assert.equal(row?.delta, delta);
    assert.equal(row?.referenceId, reference);
    assert.equal(row?.branch?.id, operation==='TOPUP'?undefined:f.branch.id);
  }
  assert.equal((await walletSummary(db, f.trainee.id)).balance, 130);
  assert.equal(
    (await traineeVisits(db, f.trainee.id, {}, true)).items.length,
    0,
  );
  const visits = await traineeVisits(db, f.trainee.id, {});
  assert.equal(visits.items[0]!.status, "CANCELLED");
  assert.equal(visits.items[0]!.branch.name, f.branch.name);
  assert.equal(JSON.stringify(visits).includes("settlementPiasters"), false);
});
test("expired positive wallets stay recorded but unavailable with no expiry postings or automatic revival", async () => {
  const f = await fixture();
  await db.pointAccount.update({
    where: { id: f.wallet.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const before = await db.pointTransaction.count(),
    s = await walletSummary(db, f.trainee.id);
  assert.equal(s.balance, 120);
  assert.equal(s.spendablePoints, 0);
  assert.equal(s.unavailablePoints, 120);
  assert.equal(s.status, "EXPIRED");
  await walletMovements(db, f.trainee.id, {});
  await code(db.$transaction(tx=>pointQuote(tx,f.admin.id,{recipientId:f.trainee.id,points:10})), "WALLET_EXPIRY_REVIEW_REQUIRED");
  assert.equal(await db.pointTransaction.count(), before);
  assert.equal(
    (await db.pointAccount.findUniqueOrThrow({ where: { id: f.wallet.id } }))
      .balance,
    120,
  );
});
test("active sessions disappear exactly at expiry while history derives expired status without mutating visits", async (t) => {
  const f = await fixture(),
    v = await f.visit();
  assert.equal(
    (await traineeVisits(db, f.trainee.id, {}, true)).items.length,
    1,
  );
  t.mock.timers.enable({
    apis: ["Date"],
    now: v.visit.expiresAt.getTime(),
  });
  try {
    assert.equal(
      (await traineeVisits(db, f.trainee.id, {}, true)).items.length,
      0,
    );
    assert.equal(
      (await traineeVisits(db, f.trainee.id, {})).items[0]!.status,
      "EXPIRED",
    );
    assert.equal(
      (await db.visit.findUniqueOrThrow({ where: { id: v.visit.id } })).status,
      "ACTIVE",
    );
  } finally {
    t.mock.timers.reset();
  }
});
test("chronological keyset pages are complete without duplicates and foreign cursors/scopes are rejected", async () => {
  const f = await fixture(),
    other = await fixture();
  await f.credit();
  await f.credit();
  const all = await walletMovements(db, f.trainee.id, {}),
    seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await walletMovements(db, f.trainee.id, {
      limit: 1,
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...page.items.map((x) => x.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(
    seen,
    all.items.map((x) => x.id),
  );
  assert.equal(new Set(seen).size, 3);
  assert.equal(
    (await walletMovements(db, f.trainee.id, { operation: "TOPUP" })).items
      .length,
    2,
  );
  await code(
    walletMovements(db, other.trainee.id, { cursor: seen[0] }),
    "INVALID_INPUT",
  );
  const visit = await f.visit();
  await code(
    traineeVisits(db, other.trainee.id, { cursor: visit.visit.id }),
    "INVALID_INPUT",
  );
  await code(walletMovements(db, f.owner.id, {}), "ACCESS_DENIED");
});
test("HTTP wallet/active/history endpoints require an active trainee and reject private selectors", async (t) => {
  const f = await fixture(),
    app = buildApp(db);
  t.after(async () => app.close());
  const owner = await createSession(
    db,
    f.owner.id,
    new Date(Date.now() + 60000),
  );
  const get = (path: string, token = f.token) =>
    app.inject({
      method: "GET",
      url: path,
      headers: { authorization: `Bearer ${token}` },
    });
  assert.equal(
    (await app.inject({ method: "GET", url: "/trainee/wallet/movements" }))
      .statusCode,
    401,
  );
  for (const path of [
    "/trainee/wallet",
    "/trainee/wallet/movements",
    "/trainee/active-visits",
    "/trainee/visits",
  ]) {
    const r = await get(path);
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.equal((await get(path, owner)).statusCode, 403);
    assert.equal((await get(`${path}?userId=${f.other.id}`)).statusCode, 400);
  }
  await db.user.update({
    where: { id: f.trainee.id },
    data: { isActive: false },
  });
  assert.equal((await get("/trainee/wallet")).statusCode, 401);
});
