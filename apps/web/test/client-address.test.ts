import assert from "node:assert/strict";
import test from "node:test";
import { trustedClientAddress } from "../lib/client-address";

test("only platform ingress can supply a valid single client address", () => {
  const req = (value: string) => new Request("https://example.test", { headers: { "x-vercel-forwarded-for": value, "x-forwarded-for": "203.0.113.99" } });
  assert.equal(trustedClientAddress(req("203.0.113.10"), "0"), undefined);
  assert.equal(trustedClientAddress(req("203.0.113.10"), "1"), "203.0.113.10");
  assert.equal(trustedClientAddress(req("2001:db8::1"), "1"), "2001:db8::1");
  for (const value of ["", "invalid", "203.0.113.10, 203.0.113.11"]) assert.equal(trustedClientAddress(req(value), "1"), undefined);
  assert.equal(trustedClientAddress(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.99" } }), "1"), undefined);
});
