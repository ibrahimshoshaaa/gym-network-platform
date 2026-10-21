import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocationPicker } from "../components/gyms/location-picker";
import { BranchFields, branchBody } from "../components/gyms/shared";
import { locationPoint, requiredLocation } from "../lib/location-point";
test("a new branch requires an explicit map or GPS selection rather than silently using zero or the map center", () => {
  assert.equal(locationPoint("", ""), null);
  assert.equal(locationPoint(null, null), null);
  assert.throws(() => requiredLocation("", ""), /حدد مكان الفرع/);
  assert.throws(() => branchBody(new FormData(), false), /حدد مكان الفرع/);
  const html = renderToStaticMarkup(createElement(BranchFields, {}));
  assert.match(html, /استخدم موقعي الحالي/);
  assert.match(html, /name="latitude" value=""/);
  assert.match(html, /name="longitude" value=""/);
  assert.doesNotMatch(html, /type="number"[^>]*name="latitude"|label[^>]*>خط العرض/);
});
test("editing preserves an existing location without requiring another GPS permission", () => {
  const html = renderToStaticMarkup(createElement(LocationPicker, { latitude:"30.1234567", longitude:"31.7654321" }));
  assert.match(html, /name="latitude" value="30.1234567"/);
  assert.match(html, /name="longitude" value="31.7654321"/);
  assert.match(html, /تم تحديد مكان الفرع/);
});
test("selected points are bounded, normalized and retained in the branch request", () => {
  for (const [lat,lng] of [[91,0],[0,181],["NaN",31],["Infinity",31],[" ",31],[false,0]])
    assert.equal(locationPoint(lat,lng),null);
  assert.deepEqual(requiredLocation(0,0),{latitude:0,longitude:0});
  const form=new FormData();form.set("latitude","30.123456789");form.set("longitude","31.987654321");
  const body=branchBody(form,true);
  assert.equal(body.latitude,30.1234568);assert.equal(body.longitude,31.9876543);
});

test("map security headers allow only same-origin geolocation and the tile image host", async () => {
  const { default: config } = await import("../next.config");
  const resolved = await config("phase-production-build", {defaultConfig:{}});
  const rules = await resolved.headers!();
  const headers = rules.find(rule => rule.source === "/:path*")!.headers;
  const value = (key: string) => headers.find(header => header.key === key)!.value;
  assert.match(value("Permissions-Policy"), /geolocation=\(self\)/);
  assert.match(value("Content-Security-Policy"), /https:\/\/tile\.openstreetmap\.org/);
  assert.match(value("Content-Security-Policy"), /connect-src 'self'/);
});

