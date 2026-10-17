import assert from "node:assert/strict";
import test from "node:test";
import { transferSchema, pageSchema } from "../src/inventory/validation.js";
test("stock transfer input requires distinct canonical UUID branches and positive bounded whole points", () => {
  const fromBranchId = "ABCDEF01-2345-4123-8123-123456789ABC",
    toBranchId = "abcdef02-2345-4123-8123-123456789abc";
  assert.equal(
    transferSchema.parse({ fromBranchId, toBranchId, points: 1 }).fromBranchId,
    fromBranchId.toLowerCase(),
  );
  for (const data of [
    { points: 0 },
    { points: -1 },
    { points: 1.5 },
    { points: 2147483648 },
    { points: "1" },
    { toBranchId: fromBranchId.toLowerCase() },
    { actorId: toBranchId },
    { fromBranchId: "x" },
  ])
    assert.equal(
      transferSchema.safeParse({ fromBranchId, toBranchId, points: 1, ...data })
        .success,
      false,
    );
  for (const data of [
    { limit: 101 },
    { limit: 0 },
    { cursor: "bad" },
    { branchId: toBranchId },
  ])
    assert.equal(pageSchema.safeParse(data).success, false);
});
