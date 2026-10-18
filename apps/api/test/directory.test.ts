import assert from "node:assert/strict";
import test from "node:test";
import { directoryQuery } from "../src/directory/validation.js";
test("directory query bounds text, pages and scope without accepting operational/private filters", () => {
  assert.deepEqual(
    directoryQuery.parse({
      q: "  جيم  ",
      governorate: " المنوفية ",
      city: "شبين الكوم",
    }),
    { q: "جيم", governorate: "المنوفية", city: "شبين الكوم", limit: 12 },
  );
  for (const input of [
    { q: "a".repeat(81) },
    { q: "gym\u0000" },
    { q: "gym\nother" },
    { limit: 51 },
    { limit: 0 },
    { cursor: "not-a-uuid" },
    { ownerId: "x" },
    { status: "SUSPENDED" },
    { includePrivate: true },
  ])
    assert.equal(directoryQuery.safeParse(input).success, false);
  assert.ok(directoryQuery.safeParse({ q: "%' OR 1=1 --" }).success);
});

test("nearby browsing requires a bounded coordinate pair", () => {
 assert.ok(directoryQuery.safeParse({ latitude: "30.5", longitude: "31" }).success);
 for(const input of [{latitude:30},{longitude:31},{latitude:91,longitude:0},{latitude:0,longitude:-181},{latitude:"",longitude:""},{latitude:null,longitude:null},{latitude:"NaN",longitude:0}])
  assert.equal(directoryQuery.safeParse(input).success,false);
});
