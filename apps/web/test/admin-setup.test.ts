import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminSetup } from "../components/admin-home";
import type { Settings } from "../lib/client";
const render = (settings: Settings) => renderToStaticMarkup(createElement(AdminSetup, { settings, onNavigate: () => {} }));
const policy = { id: "test", version: 1, pointPricePiasters: "150", gymDiscountBps: 1000, redemptionBps: 8000 };
const method = { type: "INSTAPAY" as const, version: 1, account: "synthetic", accountName: "Synthetic", enabled: true };

test("empty setup does not claim charging is available or invent financial values", () => {
 const html = render({ policy: null, paymentMethods: [], packages: [] });
 assert.match(html, /كمّل تجهيز الشحن/);
 assert.match(html, /0 من 2/);
 assert.doesNotMatch(html, /إعدادات الشحن مكتملة|سعر النقطة الحالي/);
});
test("a saved but disabled payment method cannot complete setup", () => {
 const html = render({ policy, paymentMethods: [{ ...method, enabled: false }], packages: [] });
 assert.match(html, /1 من 2/);
 assert.doesNotMatch(html, /إعدادات الشحن مكتملة/);
});
test("pricing and enabled payments complete charging setup without claiming visits are ready", () => {
 const html = render({ policy, paymentMethods: [method], packages: [] });
 assert.match(html, /إعدادات الشحن مكتملة/);
 assert.match(html, /2 من 2/);
 assert.match(html, /النقاط تُضاف بعد موافقتك/);
 assert.doesNotMatch(html, /المنصة جاهزة|الزيارات جاهزة/);
});
