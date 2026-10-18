import assert from "node:assert/strict";
import test from "node:test";
import { branchMap, branchPhone, branchDirections } from "../lib/branch-links";
test("branch map links use only bounded coordinates and a fixed external host", () => {
  const link = branchMap("30.5", "31.0");
  assert.ok(link);
  const url = new URL(link);
  assert.equal(url.hostname, "www.openstreetmap.org");
  assert.equal(url.searchParams.get("mlat"), "30.5");
  assert.equal(url.searchParams.get("mlon"), "31");
  assert.ok(branchMap("0", "0"));
  assert.ok(branchMap("-90", "180"));
  for (const [lat, lng] of [
    ["", "0"],
    [" ", "1"],
    ["91", "0"],
    ["0", "181"],
    ["NaN", "0"],
    ["Infinity", "0"],
    ["javascript:alert(1)", "0"],
  ])
    assert.equal(branchMap(lat!, lng!), null);
});
test("business phone links cannot inject a URL scheme or expose a guessed contact", () => {
  assert.equal(branchPhone("+201000000001"), "tel:+201000000001");
  for (const input of [
    null,
    "",
    "javascript:alert(1)",
    "+201000000001?body=secret",
    "private invalid",
  ])
    assert.equal(branchPhone(input), null);
});

test("directions pass only validated destination coordinates and no trainee location", () => {
 const url=new URL(branchDirections("30.5","31")!);
 assert.equal(url.hostname,"www.google.com");
 assert.equal(url.searchParams.get("destination"),"30.5,31");
 assert.equal(url.searchParams.has("origin"),false);
 assert.equal(branchDirections("invalid","0"),null);
});
