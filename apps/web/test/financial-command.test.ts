import test from "node:test";
import assert from "node:assert/strict";
import { FinancialCommand } from "../lib/financial-command";
import { ApiError } from "../lib/client";
test("ambiguous financial response retries original key and payload, even when fields change", async () => {
  const sent: { path: string; init: RequestInit }[] = [];
  const command = new FinancialCommand(async (path, init) => {
    sent.push({ path, init });
    if (sent.length === 1) throw new ApiError("SERVICE_UNAVAILABLE", 503);
    return { id: "original" };
  });
  await assert.rejects(command.run("sales", { points: 10 }));
  assert.equal(command.uncertain, true);
  await command.run("other-sales", { points: 20 });
  assert.deepEqual(sent[0], sent[1]);
  assert.equal(command.uncertain, false);
});
test("two separately confirmed identical sales receive different idempotency keys", async () => {
  const keys: string[] = [];
  const command = new FinancialCommand(async (_path, init) => {
    keys.push((init.headers as Record<string, string>)["idempotency-key"]!);
    return {};
  });
  await command.run("sales", { points: 10 });
  await command.run("sales", { points: 10 });
  assert.notEqual(keys[0], keys[1]);
});
