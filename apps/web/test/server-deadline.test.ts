import assert from "node:assert/strict";
import test from "node:test";
import { deadlineAt, secondsLeft, duration } from "../lib/server-deadline";
test("wallet/session deadlines use server time and monotonic elapsed time, conservatively including request delay", () => {
  const server = "2026-10-17T12:00:00Z",
    end = "2026-10-17T12:00:10Z",
    until = deadlineAt(end, server, 100);
  assert.equal(until, 10100);
  assert.equal(secondsLeft(until, 1100), 9);
  assert.equal(secondsLeft(until, 10100), 0);
  assert.equal(secondsLeft(until, 20100), 0);
  assert.equal(deadlineAt(null, server, 100), null);
  assert.equal(deadlineAt("bad", server, 100), null);
  assert.equal(secondsLeft(null, 100), null);
  assert.equal(deadlineAt("2026-10-17T11:59:00Z", server, 100), 100);
});
test("session time formatting preserves hours and clamps elapsed sessions to zero", () => {
  assert.equal(duration(0), "00:00:00");
  assert.equal(duration(3661), "01:01:01");
  assert.equal(duration(-20), "00:00:00");
  assert.equal(duration(90000), "25:00:00");
});
