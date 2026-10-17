import assert from "node:assert/strict";
import test from "node:test";
import {
  walletView,
  movementSchema,
  pageSchema,
} from "../src/wallet/validation.js";
test("wallet availability distinguishes empty, valid, expired and missing-expiry balances without mutation", () => {
  const now = new Date("2026-10-17T12:00:00Z"),
    future = new Date(now.getTime() + 1),
    past = new Date(now.getTime() - 1);
  for (const [balance, expiresAt, status, spendable] of [
    [0, null, "EMPTY", 0],
    [5, future, "VALID", 5],
    [5, now, "EXPIRED", 0],
    [5, past, "EXPIRED", 0],
    [5, null, "REVIEW_REQUIRED", 0],
  ] as const) {
    const w = { balance, expiresAt },
      copy = { ...w };
    const result = walletView(w, now);
    assert.equal(result.status, status);
    assert.equal(result.spendablePoints, spendable);
    assert.equal(result.unavailablePoints, balance - spendable);
    assert.deepEqual(w, copy);
  }
});
test("wallet history rejects another user/account scope and invalid pagination/categories", () => {
  for (const q of [
    { userId: "x" },
    { accountId: "x" },
    { operation: "ISSUE" },
    { limit: 101 },
    { limit: 0 },
    { cursor: "invalid" },
  ])
    assert.equal(movementSchema.safeParse(q).success, false);
  assert.ok(
    movementSchema.safeParse({ operation: "VISIT_CANCELLATION", limit: 1 })
      .success,
  );
  assert.equal(pageSchema.safeParse({ active: false }).success, false);
});
