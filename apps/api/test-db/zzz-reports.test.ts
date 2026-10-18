import { getQuote,submitTopup,reviewTopup } from "../src/topups/service.js";
import { savePaymentMethod } from "../src/topups/settings.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  reportSummary,
  reportRows,
  reportCsv,
} from "../src/reports/service.js";
import { postLedger } from "../src/ledger/service.js";
import { createSession } from "../src/auth/sessions.js";
import {
  confirmVisit,
  issueQr,
  sellPoints,
} from "../src/operations/service.js";
import { requestReview, decideReview } from "../src/reviews/service.js";
import {
  requestWithdrawal,
  decideWithdrawal,
  payWithdrawal,
  feedbackWithdrawal,
} from "../src/withdrawals/service.js";
import { buildApp } from "../src/app.js";
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
const range = { from: "2026-10-01", to: "2026-10-31" };
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
        displayName: "Synthetic Reports Person",
        phoneE164: `+20report${randomUUID()}`,
      },
    });
  const admin = await user("PLATFORM_ADMIN"),
    owner = await user("GYM_OWNER"),
    other = await user("GYM_OWNER"),
    cashier = await user("CASHIER"),
    manager = await user("BRANCH_MANAGER"),
    trainee = await user("TRAINEE");
  const gym = await db.gym.create({
    data: {
      name: "=Synthetic CSV Formula",
      ownerId: owner.id,
      ownerAcceptedAt: new Date(),
      status: "ACTIVE",
    },
  });
  const branch = await db.branch.create({
    data: {
      gymId: gym.id,
      name: "Synthetic Reports Branch",
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
  const inventory = await db.pointAccount.create({
      data: { branchId: branch.id, type: "BRANCH_INVENTORY" },
    }),
    wallet = await db.pointAccount.create({
      data: {
        ownerUserId: trainee.id,
        type: "TRAINEE_WALLET",
        expiresAt: new Date(Date.now() + 90 * 86400000),
      },
    }),
    issuance = await db.pointAccount.findFirstOrThrow({
      where: { type: "ISSUANCE" },
    });
  await postLedger(db, {
    actorId: admin.id,
    idempotencyKey: randomUUID(),
    reason: "Synthetic report points",
    points: {
      kind: "ISSUE",
      entries: [
        { accountId: issuance.id, delta: -220n },
        { accountId: inventory.id, delta: 100n },
        { accountId: wallet.id, delta: 120n },
      ],
    },
  });
  const p = await db.pricingPolicy.findFirstOrThrow({
      orderBy: { version: "desc" },
    }),
    bearer = await createSession(
      db,
      trainee.id,
      new Date(Date.now() + 90 * 86400000),
    );
  const sale = (points = 10) =>
    sellPoints(db, cashier.id, branch.id, randomUUID(), {
      traineeId: trainee.id,
      points,
      pricingVersion: p.version,
      receivedAmountPiasters: (
        BigInt(points) * p.pointPricePiasters
      ).toString(),
      fundsReceived: true,
    });
  const visit = async () => {
    const qr = await issueQr(db, trainee.id, bearer);
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
    other,
    cashier,
    manager,
    trainee,
    gym,
    branch,
    inventory,
    wallet,
    p,
    sale,
    visit,
  };
}
test("sales, visits and current balances are separate exact figures and reports never post money", async () => {
  const f = await fixture(),
    sale = await f.sale(10),
    visit = await f.visit(),
    before = [
      await db.pointTransaction.count(),
      await db.moneyTransaction.count(),
    ];
  const s = await reportSummary(db, f.owner.id, { ...range, gymId: f.gym.id });
  assert.equal(s.sales.points, "10");
  assert.equal(s.sales.amountPiasters, sale.chargePiasters);
  assert.equal(s.visits.points, "30");
  assert.equal(s.netVisitReceivablesPiasters, visit.visit.settlementPiasters);
  assert.equal(s.topups?.amountPiasters, "0");
  assert.equal(s.currentStockPoints, "90");
  assert.equal(
    s.currentBalances?.find((b) => b.type === "GYM_AVAILABLE")?.balancePiasters,
    visit.visit.settlementPiasters,
  );
  assert.deepEqual(
    [await db.pointTransaction.count(), await db.moneyTransaction.count()],
    before,
  );
});
test("cancelling an older visit books a reversal on the cancellation date, including a negative period net", async (t) => {
  const f = await fixture();
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-14T10:00:00Z"),
  });
  try {
    const v = await f.visit();
    t.mock.timers.setTime(Date.parse("2026-10-15T10:00:00Z"));
    const r = await requestReview(db, f.trainee.id, randomUUID(), {
      kind: "VISIT_CANCEL",
      targetId: v.visit.id,
      reason: "Synthetic historical visit correction",
      evidenceText: "Synthetic attendance evidence for date-based reporting",
    });
    await decideReview(db, f.admin.id, r.id, {
      decision: "APPROVE",
      reason: "Synthetic correction verified",
    });
    const a = await reportSummary(db, f.owner.id, {
        from: "2026-10-14",
        to: "2026-10-14",
        gymId: f.gym.id,
      }),
      b = await reportSummary(db, f.owner.id, {
        from: "2026-10-15",
        to: "2026-10-15",
        gymId: f.gym.id,
      });
    assert.equal(a.visits.count, "1");
    assert.equal(a.cancellations.count, "0");
    assert.equal(b.visits.count, "0");
    assert.equal(b.cancellations.count, "1");
    assert.equal(
      b.netVisitReceivablesPiasters,
      (-BigInt(v.visit.settlementPiasters)).toString(),
    );
    const rows = await reportRows(db, f.owner.id, {
      ...range,
      gymId: f.gym.id,
      kind: "CANCELLATIONS",
    });
    assert.equal(rows.items[0]!.referenceId, v.visit.id);
  } finally {
    t.mock.timers.reset();
  }
});
test("owners cannot select another tenant and staff must supply an assigned branch with no gym wallet or withdrawals", async () => {
  const f = await fixture(),
    other = await fixture();
  await f.sale();
  await code(
    reportSummary(db, f.other.id, { ...range, gymId: f.gym.id }),
    "BRANCH_ACCESS_DENIED",
  );
  await code(
    reportSummary(db, f.cashier.id, { ...range, gymId: f.gym.id }),
    "BRANCH_ACCESS_DENIED",
  );
  await code(
    reportSummary(db, f.cashier.id, {
      ...range,
      gymId: f.gym.id,
      branchId: other.branch.id,
    }),
    "BRANCH_ACCESS_DENIED",
  );
  const s = await reportSummary(db, f.cashier.id, {
    ...range,
    gymId: f.gym.id,
    branchId: f.branch.id,
  });
  assert.equal(s.sales.count, "1");
  assert.equal(s.topups, null);
  assert.equal(s.alerts.topups, null);
  assert.equal(s.currentBalances, null);
  assert.equal(s.paidWithdrawals, null);
  assert.equal(s.alerts.withdrawals, null);
  assert.equal(s.reconciliation, null);
  await code(
    reportRows(db, f.manager.id, {
      ...range,
      branchId: f.branch.id,
      kind: "WITHDRAWALS",
    }),
    "ACCESS_DENIED",
  );
  await code(
    reportRows(db, f.cashier.id, {
      ...range,
      branchId: f.branch.id,
      kind: "TOPUPS",
    }),
    "ACCESS_DENIED",
  );
  await db.staffAssignment.updateMany({
    where: { userId: f.cashier.id },
    data: { active: false },
  });
  await code(
    reportRows(db, f.cashier.id, {
      ...range,
      branchId: f.branch.id,
      kind: "SALES",
    }),
    "BRANCH_ACCESS_DENIED",
  );
});
test("keyset pages have no duplicates and CSV export covers every filtered row, not only one page", async () => {
  const f = await fixture();
  for (let n = 0; n < 4; n++) await f.sale();
  const q = { ...range, gymId: f.gym.id, kind: "SALES", limit: 1 };
  const first = await reportRows(db, f.owner.id, q),
    second = await reportRows(db, f.owner.id, {
      ...q,
      cursor: first.nextCursor,
    });
  assert.equal(first.items.length, 1);
  assert.equal(second.items.length, 1);
  assert.notEqual(first.items[0]!.id, second.items[0]!.id);
  const all = await reportRows(db, f.owner.id, q, true);
  assert.equal(all.items.length, 4);
  const csv = reportCsv(all.items);
  assert.ok(csv.includes("'=Synthetic CSV Formula"));
  assert.equal(csv.split("\r\n").length, 6);
  assert.equal(JSON.stringify(all).includes("phoneE164"), false);
  assert.equal(JSON.stringify(all).includes("destinationAccount"), false);
});
test("reports preserve large piaster balances and reconcile the complete double-entry ledger globally", async () => {
  const f = await fixture(),
    available = await db.moneyAccount.create({
      data: { gymId: f.gym.id, type: "GYM_AVAILABLE" },
    }),
    offset = await db.moneyAccount.findFirstOrThrow({
      where: { type: "PLATFORM_OFFSET" },
    }),
    amount = 9007199254740993n;
  await postLedger(db, {
    actorId: f.admin.id,
    idempotencyKey: randomUUID(),
    reason: "Synthetic exact large report amount",
    money: {
      kind: "ADJUSTMENT",
      entries: [
        { accountId: offset.id, delta: -amount },
        { accountId: available.id, delta: amount },
      ],
    },
  });
  const s = await reportSummary(db, f.owner.id, { ...range, gymId: f.gym.id });
  assert.equal(
    s.currentBalances?.find((a) => a.type === "GYM_AVAILABLE")?.balancePiasters,
    amount.toString(),
  );
  const all = await reportSummary(db, f.admin.id, range);
  assert.equal(all.reconciliation?.pointDifference, "0");
  assert.equal(all.reconciliation?.moneyDifference, "0");
});
test("alerts show live queues independently of historical date range and flag only accepted overdue withdrawals", async (t) => {
  const f = await fixture(),
    sale = await f.sale(),
    v = await f.visit();
  await requestReview(db, f.cashier.id, randomUUID(), {
    kind: "SALE_CORRECTION",
    targetId: sale.id,
    reason: "Synthetic sale correction awaiting review",
    evidenceText: "Synthetic cash receipt correction details",
  });
  const w = await requestWithdrawal(db, f.owner.id, f.gym.id, randomUUID(), {
    amountPiasters: "1",
    paymentMethod: "INSTAPAY",
    destinationAccount: "synthetic@instapay",
    destinationName: "Synthetic Beneficiary",
  });
  const q = { from: "2020-01-01", to: "2020-01-02", gymId: f.gym.id },
    pending = await reportSummary(db, f.owner.id, q);
  assert.equal(pending.sales.count, "0");
  assert.equal(pending.alerts.reviews.count, "1");
  assert.equal(pending.alerts.withdrawals?.requested, "1");
  assert.equal(pending.alerts.withdrawals?.overdue, "0");
  const calendar = await db.withdrawalCalendar.findFirstOrThrow({
      orderBy: { version: "desc" },
    }),
    accepted = await decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
      decision: "APPROVE",
      reason: "Synthetic payout approved for alert test",
      calendarVersion: calendar.version,
      destinationVerified: true,
    });
  t.mock.timers.enable({
    apis: ["Date"],
    now: accepted.dueAt!.getTime() + 1000,
  });
  try {
    const late = await reportSummary(db, f.owner.id, q);
    assert.equal(late.alerts.withdrawals?.overdue, "1");
    assert.equal(
      late.currentBalances?.find((a) => a.type === "GYM_RESERVED")
        ?.balancePiasters,
      "1",
    );
  } finally {
    t.mock.timers.reset();
  }
  assert.ok(v.visit.id);
});
test("paid transfers remain paid in movement reports when owner disputes receipt", async () => {
  const f = await fixture();
  await f.visit();
  const w = await requestWithdrawal(db, f.owner.id, f.gym.id, randomUUID(), {
      amountPiasters: "1",
      paymentMethod: "INSTAPAY",
      destinationAccount: "synthetic@instapay",
      destinationName: "Synthetic Beneficiary",
    }),
    calendar = await db.withdrawalCalendar.findFirstOrThrow({
      orderBy: { version: "desc" },
    });
  await decideWithdrawal(db, f.admin.id, w.id, randomUUID(), {
    decision: "APPROVE",
    reason: "Synthetic payout verified",
    calendarVersion: calendar.version,
    destinationVerified: true,
  });
  const id = randomUUID();
  const proof = await db.receiptEvidence.create({
    data: {
      ownerUserId: f.admin.id,
      objectKey: `synthetic-report/${id}`,
      assetId: id,
      contentHash: id,
      mimeType: "image/jpeg",
      bytes: 10,
    },
  });
  await payWithdrawal(db, f.admin.id, w.id, randomUUID(), {
    proofReceiptId: proof.id,
    transferReference: id,
    transferredAmountPiasters: "1",
    fundsTransferred: true,
    proofReviewed: true,
    reason: "Synthetic payout confirmed",
  });
  await feedbackWithdrawal(db, f.owner.id, w.id, randomUUID(), {
    kind: "DISPUTE",
    reason: "Synthetic owner disputes receipt",
  });
  const s = await reportSummary(db, f.owner.id, { ...range, gymId: f.gym.id });
  assert.equal(s.paidWithdrawals?.amountPiasters, "1");
  assert.equal(s.alerts.withdrawals?.disputed, "1");
  assert.equal(
    s.currentBalances?.find((a) => a.type === "GYM_PAID")?.balancePiasters,
    "1",
  );
});
test("options and export endpoints deny other owners and preserve private download headers", async () => {
  const f = await fixture();
  await f.sale();
  const app = buildApp(db),
    owner = await createSession(db, f.owner.id, new Date(Date.now() + 60000)),
    outsider = await createSession(
      db,
      f.other.id,
      new Date(Date.now() + 60000),
    ),
    query = new URLSearchParams({
      ...range,
      gymId: f.gym.id,
      kind: "SALES",
    }).toString();
  try {
    const own = await app.inject({
      method: "GET",
      url: "/reports/gyms",
      headers: { authorization: `Bearer ${owner}` },
    });
    assert.ok(own.json().items.some((g: { id: string }) => g.id === f.gym.id));
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/reports/export?${query}`,
          headers: { authorization: `Bearer ${outsider}` },
        })
      ).statusCode,
      403,
    );
    const csv = await app.inject({
      method: "GET",
      url: `/reports/export?${query}`,
      headers: { authorization: `Bearer ${owner}` },
    });
    assert.equal(csv.statusCode, 200);
    assert.match(csv.headers["content-type"]!, /text\/csv/);
    assert.equal(csv.headers["cache-control"], "no-store");
    assert.match(csv.headers["content-disposition"]!, /attachment/);
    assert.equal(csv.headers["x-content-type-options"], "nosniff");
  } finally {
    await app.close();
  }
});

test('platform finance counts holdings and liabilities once and separates real platform collections from cashier sales',async()=>{
 const f=await fixture();
 const snapshot=async()=> (await reportSummary(db,f.admin.id,range)).platformFinance!;
 const before=await snapshot();
 await f.sale(10);
 const sale=await snapshot();
 assert.equal(BigInt(sale.points.gyms),BigInt(before.points.gyms)-10n);
 assert.equal(BigInt(sale.points.trainees),BigInt(before.points.trainees)+10n);
 assert.equal(sale.points.circulating,before.points.circulating);
 assert.equal(sale.collections.total,before.collections.total);
 const visit=await f.visit(),earned=BigInt(visit.visit.settlementPiasters),afterVisit=await snapshot();
 assert.equal(BigInt(afterVisit.liabilities.total),BigInt(before.liabilities.total)+earned);
 assert.equal(BigInt(afterVisit.points.circulating),BigInt(before.points.circulating)-30n);
 await requestWithdrawal(db,f.owner.id,f.gym.id,randomUUID(),{amountPiasters:'1',paymentMethod:'INSTAPAY',destinationAccount:'synthetic@instapay',destinationName:'Synthetic Finance Recipient'});
 const reserved=await snapshot();
 assert.equal(reserved.liabilities.total,afterVisit.liabilities.total);
 assert.equal(BigInt(reserved.liabilities.reserved),BigInt(afterVisit.liabilities.reserved)+1n);
 assert.equal(BigInt(reserved.liabilities.available),BigInt(afterVisit.liabilities.available)-1n);
 const method=await db.paymentMethod.findUniqueOrThrow({where:{type:'INSTAPAY'}});
 await savePaymentMethod(db,f.admin.id,'INSTAPAY',{expectedVersion:method.version,account:'synthetic-finance@instapay',accountName:'Synthetic Receiver',enabled:true});
 const fresh=await db.paymentMethod.findUniqueOrThrow({where:{type:'INSTAPAY'}});
 for(const kind of ['TRAINEE','BRANCH_STOCK'] as const){
  const actor=kind==='TRAINEE'?f.trainee.id:f.owner.id,selection={kind,points:7,...(kind==='BRANCH_STOCK'?{receivingBranchId:f.branch.id}:{})};
  const quote=await getQuote(db,actor,selection),receipt=await db.receiptEvidence.create({data:{ownerUserId:actor,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),contentHash:randomUUID(),mimeType:'image/jpeg',bytes:10}});
  const b=await snapshot(),pending=await submitTopup(db,actor,randomUUID(),{...selection,pricingVersion:quote.pricingVersion,paymentMethod:'INSTAPAY',paymentMethodVersion:fresh.version,receiptId:receipt.id});
  assert.equal((await snapshot()).collections.total,b.collections.total);
  await reviewTopup(db,f.admin.id,pending.id,{decision:'APPROVED',reason:'Synthetic finance receipt checked',paymentReference:randomUUID(),receivedAmountPiasters:quote.chargePiasters,fundsReceived:true,receiptReviewed:true});
  const a=await snapshot(),source=kind==='TRAINEE'?'trainees':'gyms';
  assert.equal(BigInt(a.collections[source]),BigInt(b.collections[source])+BigInt(quote.chargePiasters));
  assert.equal(BigInt(a.collections.total),BigInt(b.collections.total)+BigInt(quote.chargePiasters));
 }
 const owner=await reportSummary(db,f.owner.id,{...range,gymId:f.gym.id});assert.equal(owner.platformFinance,null);
 const app=await buildApp(db);
 try{
  assert.equal((await app.inject({method:'GET',url:'/reports/platform-balances?kind=GYMS'})).statusCode,401);
  for(const actor of [f.owner,f.cashier,f.manager,f.trainee]){const session=await createSession(db,actor.id,new Date(Date.now()+3600000));assert.equal((await app.inject({method:'GET',url:'/reports/platform-balances?kind=GYMS',headers:{authorization:'Bearer '+session}})).statusCode,403);}
  const session=await createSession(db,f.admin.id,new Date(Date.now()+3600000));
  const res=await app.inject({method:'GET',url:'/reports/platform-balances?kind=GYMS&limit=1',headers:{authorization:'Bearer '+session}});assert.equal(res.statusCode,200);assert.equal(res.json().items.length,1);assert.ok(res.json().nextCursor);assert.equal(JSON.stringify(res.json()).includes('phoneE164'),false);
 }finally{await app.close();}
});
