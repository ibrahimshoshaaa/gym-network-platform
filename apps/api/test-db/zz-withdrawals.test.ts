import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  requestWithdrawal,
  publishCalendar,
  decideWithdrawal,
  cancelWithdrawal,
  payWithdrawal,
  feedbackWithdrawal,
} from "../src/withdrawals/service.js";
import { postLedger, postInTransaction } from "../src/ledger/service.js";
import { accessReceipt, type ReceiptStorage } from "../src/topups/receipts.js";
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
const code = (p: Promise<unknown>, code: string) =>
  assert.rejects(
    p,
    (e: unknown) =>
      typeof e === "object" && e !== null && "code" in e && e.code === code,
  );
async function fixture(amount = 10000n) {
  const user = (role: "PLATFORM_ADMIN" | "GYM_OWNER" | "CASHIER") =>
    db.user.create({
      data: {
        role,
        displayName: "Synthetic Withdrawal Person",
        phoneE164: `+20withdraw${randomUUID()}`,
      },
    });
  const admin = await user("PLATFORM_ADMIN"),
    owner = await user("GYM_OWNER"),
    outsider = await user("GYM_OWNER"),
    cashier = await user("CASHIER");
  const gym = await db.gym.create({
    data: {
      name: "Synthetic Withdrawal Gym",
      ownerId: owner.id,
      ownerAcceptedAt: new Date(),
      status: "ACTIVE",
    },
  });
  const available = await db.moneyAccount.create({
    data: { gymId: gym.id, type: "GYM_AVAILABLE" },
  });
  const offset = await db.moneyAccount.findFirstOrThrow({
    where: { type: "PLATFORM_OFFSET" },
  });
  await postLedger(db, {
    actorId: admin.id,
    idempotencyKey: randomUUID(),
    reason: "Synthetic earned receivables",
    money: {
      kind: "ADJUSTMENT",
      entries: [
        { accountId: offset.id, delta: -amount },
        { accountId: available.id, delta: amount },
      ],
    },
  });
  const body = (amount = "1000") => ({
    amountPiasters: amount,
    paymentMethod: "INSTAPAY",
    destinationAccount: "synthetic@instapay",
    destinationName: "Synthetic Beneficiary",
  });
  const request = (amount = "1000") =>
    requestWithdrawal(db, owner.id, gym.id, randomUUID(), body(amount));
  return { admin, owner, outsider, cashier, gym, available, body, request };
}
async function calendar(actorId: string) {
  const p = await db.withdrawalCalendar.findFirst({
    orderBy: { version: "desc" },
  });
  return publishCalendar(db, actorId, {
    expectedVersion: p?.version ?? 0,
    workdays: [1, 2, 3, 4, 5],
    holidays: [],
    countAcceptanceDay: false,
    deadlineHour: 17,
    deadlineMinute: 30,
  });
}
async function approve(f: Awaited<ReturnType<typeof fixture>>, id: string) {
  const c = await calendar(f.admin.id);
  return decideWithdrawal(db, f.admin.id, id, randomUUID(), {
    decision: "APPROVE",
    reason: "Synthetic destination and balance verified",
    calendarVersion: c.version,
    destinationVerified: true,
  });
}
async function proof(actorId: string) {
  const key = randomUUID();
  return db.receiptEvidence.create({
    data: {
      ownerUserId: actorId,
      objectKey: `synthetic-withdrawal/${key}`,
      assetId: key,
      contentHash: key,
      mimeType: "image/jpeg",
      bytes: 10,
    },
  });
}
const payment = (
  proofReceiptId: string,
  amount = "1000",
  transferReference = randomUUID(),
) => ({
  proofReceiptId,
  transferReference,
  transferredAmountPiasters: amount,
  fundsTransferred: true,
  proofReviewed: true,
  reason: "Synthetic manual transfer independently confirmed",
});
async function balance(
  gymId: string,
  type: "GYM_AVAILABLE" | "GYM_RESERVED" | "GYM_PAID",
) {
  return (
    (await db.moneyAccount.findFirst({ where: { gymId, type } }))
      ?.balancePiasters ?? 0n
  );
}

test("withdrawal reserves immediately but approval requires explicitly configured work calendar", async () => {
  const f = await fixture(),
    w = await f.request();
  assert.equal(w.status, "REQUESTED");
  assert.equal(w.acceptedAt, null);
  assert.equal(w.dueAt, null);
  assert.equal(await balance(f.gym.id, "GYM_AVAILABLE"), 9000n);
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 1000n);
  await code(
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      decision: "APPROVE",
      reason: "Synthetic review awaiting calendar",
      calendarVersion: 1,
      destinationVerified: true,
    }),
    "CALENDAR_NOT_CONFIGURED",
  );
  assert.equal(
    (await db.withdrawalRequest.findUniqueOrThrow({ where: { id: w.id } }))
      .status,
    "REQUESTED",
  );
});
test("same request key replays exactly and concurrent distinct requests cannot reserve beyond available", async () => {
  const f = await fixture(1000n),
    key = randomUUID();
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      requestWithdrawal(db, f.owner.id, f.gym.id, key, f.body("700")),
    ),
  );
  assert.equal(new Set(results.map((w) => w.id)).size, 1);
  await code(
    requestWithdrawal(db, f.owner.id, f.gym.id, key, f.body("701")),
    "IDEMPOTENCY_CONFLICT",
  );
  const raced = await Promise.allSettled([1, 2].map(() => f.request("200")));
  assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await balance(f.gym.id, "GYM_AVAILABLE"), 100n);
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 900n);
});
test("any positive piaster is permitted, while zero, excessive amounts, status injection and wrong owners fail", async () => {
  const f = await fixture();
  assert.equal((await f.request("1")).amountPiasters, "1");
  await code(f.request("0"), "INVALID_INPUT");
  await code(f.request("10001"), "INSUFFICIENT_FUNDS");
  await code(
    requestWithdrawal(db, f.owner.id, f.gym.id, randomUUID(), {
      ...f.body(),
      status: "PAID",
    }),
    "INVALID_INPUT",
  );
  for (const actor of [f.outsider, f.cashier, f.admin])
    await code(
      requestWithdrawal(db, actor.id, f.gym.id, randomUUID(), f.body()),
      "GYM_ACCESS_DENIED",
    );
  await db.gym.update({
    where: { id: f.gym.id },
    data: { status: "SUSPENDED" },
  });
  await code(f.request(), "GYM_INACTIVE");
});
test("owner cancellation and admin rejection release exactly once; pending owner can cancel while suspended", async () => {
  const f = await fixture(),
    w = await f.request(),
    key = randomUUID(),
    body = { reason: "Synthetic owner cancelled before review" };
  await db.gym.update({
    where: { id: f.gym.id },
    data: { status: "SUSPENDED" },
  });
  const results = await Promise.all(
    [1, 2].map(() => cancelWithdrawal(db, f.owner.id, w.id, key, body)),
  );
  assert.equal(results[0]!.status, "CANCELLED");
  assert.equal(await balance(f.gym.id, "GYM_AVAILABLE"), 10000n);
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
  await code(
    cancelWithdrawal(db, f.owner.id, w.id, randomUUID(), body),
    "INVALID_STATE",
  );
  await db.gym.update({ where: { id: f.gym.id }, data: { status: "ACTIVE" } });
  const next = await f.request();
  await approve(f, next.id);
  await decideWithdrawal(db, f.admin.id, next.id, randomUUID(), {
    decision: "REJECT",
    reason: "Synthetic transfer destination rejected",
  });
  assert.equal(await balance(f.gym.id, "GYM_AVAILABLE"), 10000n);
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
});
test("approval starts clock at acceptance, preserves calendar snapshot, and checks version and actor", async (t) => {
  const f = await fixture(),
    w = await f.request(),
    c = await calendar(f.admin.id);
  const body = {
    decision: "APPROVE",
    reason: "Synthetic destination verified",
    calendarVersion: c.version,
    destinationVerified: true,
  };
  await code(
    decideWithdrawal(db, f.owner.id, w.id, randomUUID(), body),
    "ACCESS_DENIED",
  );
  await code(
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      ...body,
      calendarVersion: c.version + 1,
    }),
    "STALE_SETTINGS",
  );
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 5 * 86400000 });
  try {
    const accepted = await decideWithdrawal(
      db,
      f.admin.id,
      w.id,
      randomUUID(),
      body,
    );
    assert.ok(accepted.acceptedAt);
    assert.ok(accepted.dueAt);
    assert.ok(
      accepted.acceptedAt.getTime() >
        new Date(w.requestedAt).getTime() + 4 * 86400000,
    );
    const before = await db.withdrawalRequest.findUniqueOrThrow({
      where: { id: w.id },
    });
    await calendar(f.admin.id);
    const after = await db.withdrawalRequest.findUniqueOrThrow({
      where: { id: w.id },
    });
    assert.deepEqual(before.dueAt, after.dueAt);
    assert.equal(before.calendarId, after.calendarId);
  } finally {
    t.mock.timers.reset();
  }
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 1000n);
  assert.equal(await balance(f.gym.id, "GYM_PAID"), 0n);
});
test("payment requires exact amount, owned unused proof and confirmed transfer; retry does not pay twice", async () => {
  const f = await fixture(),
    w = await f.request();
  await approve(f, w.id);
  const p = await proof(f.admin.id),
    other = await proof(f.outsider.id),
    key = randomUUID(),
    body = payment(p.id);
  await code(
    payWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      ...body,
      fundsTransferred: false,
    }),
    "INVALID_INPUT",
  );
  await code(
    payWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      ...body,
      transferredAmountPiasters: "999",
    }),
    "PAYMENT_AMOUNT_MISMATCH",
  );
  await code(
    payWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      ...body,
      proofReceiptId: other.id,
    }),
    "RECEIPT_ACCESS_DENIED",
  );
  const result = await Promise.all(
    [1, 2, 3].map(() => payWithdrawal(db, f.admin.id, w.id, key, body)),
  );
  assert.ok(result.every((r) => r.status === "PAID"));
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
  assert.equal(await balance(f.gym.id, "GYM_PAID"), 1000n);
  assert.equal(
    await db.moneyTransaction.count({
      where: { referenceId: w.id, kind: "WITHDRAWAL_PAYMENT" },
    }),
    1,
  );
  await code(
    payWithdrawal(db, f.admin.id, w.id, key, {
      ...body,
      transferReference: "DIFFERENT",
    }),
    "IDEMPOTENCY_CONFLICT",
  );
  await code(
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      decision: "REJECT",
      reason: "Synthetic invalid rollback of paid transfer",
    }),
    "INVALID_STATE",
  );
});
test("duplicate payout proof and transfer reference across requests are rejected", async () => {
  const f = await fixture(),
    a = await f.request(),
    b = await f.request();
  await approve(f, a.id);
  await approve(f, b.id);
  const p = await proof(f.admin.id),
    q = await proof(f.admin.id),
    body = payment(p.id);
  await payWithdrawal(db, f.admin.id, a.id, randomUUID(), body);
  await code(
    payWithdrawal(db, f.admin.id, b.id, randomUUID(), payment(p.id)),
    "RECEIPT_ALREADY_USED",
  );
  await code(
    payWithdrawal(
      db,
      f.admin.id,
      b.id,
      randomUUID(),
      payment(q.id, "1000", body.transferReference),
    ),
    "PAYMENT_REFERENCE_USED",
  );
  assert.equal(
    (await db.withdrawalRequest.findUniqueOrThrow({ where: { id: b.id } }))
      .status,
    "APPROVED",
  );
});
test("pay/reject race creates either one payment or one release, never both", async () => {
  const f = await fixture(),
    w = await f.request();
  await approve(f, w.id);
  const p = await proof(f.admin.id);
  const race = await Promise.allSettled([
    payWithdrawal(db, f.admin.id, w.id, randomUUID(), payment(p.id)),
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      decision: "REJECT",
      reason: "Synthetic withdrawal stopped before transfer",
    }),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const row = await db.withdrawalRequest.findUniqueOrThrow({
    where: { id: w.id },
  });
  assert.equal(Boolean(row.paymentTransactionId), row.status === "PAID");
  assert.equal(Boolean(row.releaseTransactionId), row.status === "REJECTED");
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
});
test("late payment requires recorded delay reason without rewriting the deadline", async (t) => {
  const f = await fixture(),
    w = await f.request(),
    accepted = await approve(f, w.id),
    p = await proof(f.admin.id);
  t.mock.timers.enable({
    apis: ["Date"],
    now: accepted.dueAt!.getTime() + 1000,
  });
  try {
    await code(
      payWithdrawal(db, f.admin.id, w.id, randomUUID(), payment(p.id)),
      "DELAY_REASON_REQUIRED",
    );
    const paid = await payWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      ...payment(p.id),
      delayReason: "Synthetic transfer network delay documented",
    });
    assert.equal(paid.status, "PAID");
    assert.deepEqual(paid.dueAt, accepted.dueAt);
    assert.ok(paid.delayReason);
  } finally {
    t.mock.timers.reset();
  }
});
test("owner receipt/dispute race records one feedback and never freezes unrelated money or sends another payment", async () => {
  const f = await fixture(),
    w = await f.request();
  await approve(f, w.id);
  await payWithdrawal(
    db,
    f.admin.id,
    w.id,
    randomUUID(),
    payment((await proof(f.admin.id)).id),
  );
  const before = [
    await balance(f.gym.id, "GYM_AVAILABLE"),
    await balance(f.gym.id, "GYM_RESERVED"),
    await balance(f.gym.id, "GYM_PAID"),
  ];
  const race = await Promise.allSettled(
    ["RECEIVED", "DISPUTE"].map((kind) =>
      feedbackWithdrawal(db, f.owner.id, w.id, randomUUID(), {
        kind,
        reason: "Synthetic gym owner response to transfer",
      }),
    ),
  );
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(
    [
      await balance(f.gym.id, "GYM_AVAILABLE"),
      await balance(f.gym.id, "GYM_RESERVED"),
      await balance(f.gym.id, "GYM_PAID"),
    ],
    before,
  );
  assert.equal(
    await db.withdrawalFeedback.count({ where: { withdrawalId: w.id } }),
    1,
  );
});
test("only hosting gym owner and admin can read private payout proof and request detail", async () => {
  const f = await fixture(),
    w = await f.request();
  await approve(f, w.id);
  const p = await proof(f.admin.id);
  await payWithdrawal(db, f.admin.id, w.id, randomUUID(), payment(p.id));
  const storage: ReceiptStorage = {
    upload: async () => ({ objectKey: "unused", assetId: "unused" }),
    remove: async () => {},
    readUrl: () => "https://proof.example.test/private-60s",
  };
  assert.ok((await accessReceipt(db, storage, f.owner.id, p.id)).url);
  await code(
    accessReceipt(db, storage, f.outsider.id, p.id),
    "RECEIPT_ACCESS_DENIED",
  );
  await code(
    accessReceipt(db, storage, f.cashier.id, p.id),
    "RECEIPT_ACCESS_DENIED",
  );
  const app = buildApp(db),
    bearer = await createSession(
      db,
      f.outsider.id,
      new Date(Date.now() + 60000),
    );
  try {
    const r = await app.inject({
      method: "GET",
      url: `/withdrawals/${w.id}`,
      headers: { authorization: `Bearer ${bearer}` },
    });
    assert.equal(r.statusCode, 403);
    assert.equal(r.headers["cache-control"], "no-store");
  } finally {
    await app.close();
  }
});
test("database prevents forged paid state, changing destination, deleting requests or editing financial action history", async () => {
  const f = await fixture(),
    w = await f.request();
  await assert.rejects(
    db.withdrawalRequest.update({
      where: { id: w.id },
      data: { destinationAccount: "changed@instapay" },
    }),
  );
  await assert.rejects(
    db.withdrawalRequest.update({
      where: { id: w.id },
      data: { status: "PAID" },
    }),
  );
  await assert.rejects(db.withdrawalRequest.delete({ where: { id: w.id } }));
  await approve(f, w.id);
  const action = await db.withdrawalAction.findFirstOrThrow({
    where: { withdrawalId: w.id },
  });
  await assert.rejects(
    db.withdrawalAction.update({
      where: { id: action.id },
      data: { reason: "Mutable financial history" },
    }),
  );
  await assert.rejects(
    db.withdrawalCalendar.update({
      where: {
        id: (
          await db.withdrawalRequest.findUniqueOrThrow({ where: { id: w.id } })
        ).calendarId!,
      },
      data: { deadlineHour: 1 },
    }),
  );
});

test("calendar editors racing on one expected version produce one new policy", async () => {
  const f = await fixture(),
    current = await db.withdrawalCalendar.findFirstOrThrow({
      orderBy: { version: "desc" },
    });
  const body = {
    expectedVersion: current.version,
    workdays: [1, 2, 3, 4, 5],
    holidays: [],
    countAcceptanceDay: false,
    deadlineHour: 18,
    deadlineMinute: 0,
  };
  const results = await Promise.allSettled(
    [1, 2].map(() => publishCalendar(db, f.admin.id, body)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.equal(rejected.reason.code, "STALE_SETTINGS");
});
test("database refuses a reservation amount that differs from the immutable withdrawal amount", async () => {
  const f = await fixture(),
    reserved = await db.moneyAccount.create({
      data: { gymId: f.gym.id, type: "GYM_RESERVED" },
    });
  await assert.rejects(
    db.$transaction(async (tx) => {
      const id = randomUUID(),
        key = randomUUID();
      const leg = await postInTransaction(tx, {
        actorId: f.owner.id,
        idempotencyKey: key,
        referenceId: id,
        reason: "Synthetic mismatched reservation",
        money: {
          kind: "WITHDRAWAL_RESERVE",
          entries: [
            { accountId: f.available.id, delta: -1n },
            { accountId: reserved.id, delta: 1n },
          ],
        },
      });
      await tx.withdrawalRequest.create({
        data: {
          id,
          gymId: f.gym.id,
          requestorId: f.owner.id,
          amountPiasters: 1000n,
          paymentMethod: "INSTAPAY",
          destinationAccount: "synthetic@instapay",
          destinationName: "Synthetic Beneficiary",
          idempotencyKey: key,
          requestHash: "a".repeat(64),
          reserveTransactionId: leg.moneyTransactionId!,
        },
      });
    }),
  );
  assert.equal(await balance(f.gym.id, "GYM_AVAILABLE"), 10000n);
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
});

test("approval rechecks active gym and accepted requestor ownership before starting the deadline", async () => {
  const f = await fixture(),
    w = await f.request(),
    c = await calendar(f.admin.id),
    body = {
      decision: "APPROVE",
      reason: "Synthetic destination verified",
      calendarVersion: c.version,
      destinationVerified: true,
    };
  await db.gym.update({
    where: { id: f.gym.id },
    data: { status: "SUSPENDED" },
  });
  await code(
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), body),
    "GYM_INACTIVE",
  );
  await db.gym.update({
    where: { id: f.gym.id },
    data: { status: "ACTIVE", ownerId: f.outsider.id },
  });
  await code(
    decideWithdrawal(db, f.admin.id, w.id, randomUUID(), body),
    "GYM_ACCESS_DENIED",
  );
  await decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
    decision: "REJECT",
    reason: "Synthetic ownership changed before approval",
  });
  assert.equal(await balance(f.gym.id, "GYM_RESERVED"), 0n);
});
test("payout evidence and incoming topup evidence cannot fund two financial claims", async () => {
  const f = await fixture(),
    w = await f.request(),
    v = await f.request();
  await approve(f, w.id);
  await approve(f, v.id);
  const p = await proof(f.admin.id),
    q = await proof(f.admin.id),
    policy = await db.pricingPolicy.findFirstOrThrow({
      orderBy: { version: "desc" },
    });
  const topupData = (receipt: typeof p) => ({
    requestorUserId: f.admin.id,
    kind: "TRAINEE" as const,
    points: 10,
    chargePiasters: 10n * policy.pointPricePiasters,
    receiptObjectKey: receipt.objectKey,
    receiptId: receipt.id,
    policyId: policy.id,
    unitPricePiasters: policy.pointPricePiasters,
    discountBps: 0,
    redemptionBps: policy.redemptionBps,
    paymentMethodType: "INSTAPAY" as const,
    paymentAccount: "synthetic@instapay",
    paymentAccountName: "Synthetic incoming account",
    idempotencyKey: randomUUID(),
    requestHash: "a".repeat(64),
  });
  await db.topupRequest.create({ data: topupData(q) });
  await code(
    payWithdrawal(db, f.admin.id, v.id, randomUUID(), payment(q.id)),
    "RECEIPT_ALREADY_USED",
  );
  await payWithdrawal(db, f.admin.id, w.id, randomUUID(), payment(p.id));
  await assert.rejects(db.topupRequest.create({ data: topupData(p) }));
  assert.equal(await db.topupRequest.count({ where: { receiptId: p.id } }), 0);
  assert.equal(
    (await db.withdrawalRequest.findUniqueOrThrow({ where: { id: v.id } }))
      .status,
    "APPROVED",
  );
});

test("concurrent receipt acknowledgements with one key replay without duplicate feedback or commands", async () => {
  const f = await fixture(),
    w = await f.request();
  await approve(f, w.id);
  await payWithdrawal(
    db,
    f.admin.id,
    w.id,
    randomUUID(),
    payment((await proof(f.admin.id)).id),
  );
  const key = randomUUID(),
    body = { kind: "RECEIVED", reason: "Synthetic owner confirmed receipt" };
  const results = await Promise.all(
    [1, 2, 3].map(() => feedbackWithdrawal(db, f.owner.id, w.id, key, body)),
  );
  assert.ok(results.every((r) => r.status === "PAID"));
  assert.equal(
    await db.withdrawalFeedback.count({ where: { withdrawalId: w.id } }),
    1,
  );
  assert.equal(
    await db.withdrawalAction.count({
      where: { withdrawalId: w.id, kind: "RECEIVED" },
    }),
    1,
  );
});
