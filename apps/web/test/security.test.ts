import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedPath,
  boundedBody,
  checkOrigin,
  apiOrigin,
} from "../lib/security";
import { decimal, minorUnits } from "../lib/client";

test("gateway allows only explicit financial UI routes and UUID parameters", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  assert.equal(allowedPath("POST", `admin/topups/${id}/review`), true);
  assert.equal(allowedPath("GET", `receipts/${id}/access`), true);
  for (const path of [
    "admin/ledger",
    "../auth/admin/login",
    "https://evil.test",
    "//evil.test",
    "admin/topups/not-a-uuid/review",
    "auth/logout",
  ])
    assert.equal(allowedPath("POST", path), false);
  assert.equal(allowedPath("DELETE", "topups"), false);
});
test("mutations require exact same origin, including login and reject missing or cross-site origin", () => {
  const previous = process.env.WEB_ORIGIN;
  try {
    process.env.WEB_ORIGIN = "https://gym.example.test";
    checkOrigin(
      new Request("https://internal.test/api/session", {
        headers: { origin: "https://gym.example.test" },
      }),
    );
    for (const origin of [
      "",
      "https://evil.test",
      "https://gym.example.test.evil.test",
      "null",
    ])
      assert.throws(
        () =>
          checkOrigin(
            new Request("https://internal.test/api/session", {
              headers: { origin },
            }),
          ),
        { code: "ORIGIN_REJECTED" },
      );
    assert.throws(
      () =>
        checkOrigin(
          new Request("https://internal.test/api/session", {
            headers: {
              origin: "https://gym.example.test",
              "sec-fetch-site": "cross-site",
            },
          }),
        ),
      { code: "ORIGIN_REJECTED" },
    );
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});
test("gateway bounds streamed bodies even without content length", async () => {
  assert.equal(
    (
      await boundedBody(
        new Request("https://gym.test", { method: "POST", body: "abc" }),
        3,
      )
    ).length,
    3,
  );
  await assert.rejects(
    boundedBody(
      new Request("https://gym.test", { method: "POST", body: "abcd" }),
      3,
    ),
    { code: "BODY_TOO_LARGE" },
  );
});
test("money conversion preserves piasters and never uses floating-point totals", () => {
  assert.equal(minorUnits("1200"), "120000");
  assert.equal(minorUnits("0.01"), "1");
  assert.equal(minorUnits("90071992547409.93"), "9007199254740993");
  assert.equal(decimal("9007199254740993"), "90071992547409.93");
  assert.equal(decimal(1500), "15");
  assert.equal(decimal("150"), "1.5");
  for (const value of ["1.234", "1e3", "-1", "NaN", "", "0"])
    assert.throws(() => minorUnits(value));
  assert.equal(minorUnits("0", true), "0");
});
test("backend origin cannot include credentials or a URL-controlled route", () => {
  const previous = process.env.API_INTERNAL_URL;
  try {
    for (const value of [
      "file:///tmp/private",
      "https://user:password@host.test",
      "https://api.test/path",
      "https://api.test/?next=evil",
    ]) {
      process.env.API_INTERNAL_URL = value;
      assert.throws(() => apiOrigin(), { code: "SERVICE_NOT_CONFIGURED" });
    }
    process.env.API_INTERNAL_URL = "https://api.example.test";
    assert.equal(apiOrigin(), "https://api.example.test");
  } finally {
    if (previous === undefined) delete process.env.API_INTERNAL_URL;
    else process.env.API_INTERNAL_URL = previous;
  }
});

test("gym management gateway exposes scoped reads and PATCH actions, without broadening the proxy", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of [
    `admin/gyms/${id}`,
    `admin/gyms/${id}/branches`,
    `admin/gyms/${id}/invitations`,
    `gyms/${id}`,
    `gyms/${id}/staff`,
    `gyms/${id}/invitations`,
    `gyms/${id}/branches/${id}/pricing-history`,
  ])
    assert.equal(allowedPath("GET", path), true);
  for (const path of [
    `admin/gyms/${id}/status`,
    `admin/branches/${id}/status`,
    `gyms/${id}`,
    `gyms/${id}/branches/${id}`,
    `gyms/${id}/staff/${id}`,
  ])
    assert.equal(allowedPath("PATCH", path), true);
  for (const path of [
    `admin/gyms/${id}/owner-invitations`,
    `gyms/${id}/branches`,
    `gyms/${id}/branches/${id}/price-change-requests`,
    `gyms/${id}/staff-invitations`,
    `invitations/${id}/revoke`,
  ])
    assert.equal(allowedPath("POST", path), true);
  assert.equal(allowedPath("PATCH", `admin/gyms/${id}/owner`), false);
  assert.equal(allowedPath("GET", `gyms/${id}/passwords`), false);
  assert.equal(allowedPath("POST", `invitations/../admin/revoke`), false);
});

test("operation review and cancellation proxy routes remain explicit and scoped", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of [
    "operation-reviews",
    "admin/operation-reviews",
    `admin/operation-reviews/${id}`,
  ])
    assert.equal(allowedPath("GET", path), true);
  for (const path of [
    "operation-reviews",
    `admin/operation-reviews/${id}/review`,
    `operations/branches/${id}/visits/${id}/cancel`,
  ])
    assert.equal(allowedPath("POST", path), true);
  for (const path of [
    `operations/branches/${id}/visits/not-a-uuid/cancel`,
    `admin/operation-reviews/${id}/approve`,
    `operation-reviews/${id}/review`,
  ])
    assert.equal(allowedPath("POST", path), false);
  assert.equal(allowedPath("DELETE", "operation-reviews"), false);
});

test("withdrawal proxy separates owner actions from admin review and payment routes", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of [
    "admin/withdrawal-calendar",
    "admin/withdrawals",
    `gyms/${id}/withdrawals`,
    `withdrawals/${id}`,
  ])
    assert.equal(allowedPath("GET", path), true);
  for (const path of [
    "admin/withdrawal-calendar",
    `gyms/${id}/withdrawals`,
    `admin/withdrawals/${id}/review`,
    `admin/withdrawals/${id}/payment`,
    `withdrawals/${id}/cancel`,
    `withdrawals/${id}/feedback`,
  ])
    assert.equal(allowedPath("POST", path), true);
  for (const path of [
    `withdrawals/${id}/payment`,
    `admin/withdrawals/${id}/feedback`,
    `withdrawals/not-a-uuid/cancel`,
  ])
    assert.equal(allowedPath("POST", path), false);
  assert.equal(allowedPath("DELETE", `withdrawals/${id}`), false);
});

test("report proxy exposes only read-only explicit routes", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of [
    "reports/gyms",
    `reports/gyms/${id}/branches`,
    "reports/summary",
    "reports/rows",
    "reports/export",
  ]) {
    assert.equal(allowedPath("GET", path), true);
    assert.equal(allowedPath("POST", path), false);
  }
  for (const path of [
    "reports/passwords",
    "reports/gyms/not-a-uuid/branches",
    "reports/../admin",
    `reports/gyms/${id}/withdrawals`,
  ])
    assert.equal(allowedPath("GET", path), false);
});

test("inventory proxy scopes read paths and exposes only the owner transfer action", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of [
    `inventory/branches/${id}`,
    `inventory/branches/${id}/movements`,
  ]) {
    assert.equal(allowedPath("GET", path), true);
    assert.equal(allowedPath("POST", path), false);
  }
  assert.equal(allowedPath("POST", `gyms/${id}/stock-transfers`), true);
  for (const path of [
    `inventory/branches/${id}/adjust`,
    `gyms/${id}/stock-transfers/reverse`,
    "inventory/branches/not-a-uuid/movements",
  ])
    assert.equal(allowedPath("POST", path) || allowedPath("GET", path), false);
});

test("directory proxy exposes only explicit read-only branch listing and detail", () => {
  const id = "86d076a7-7827-4013-a6f9-a32f94e0131b";
  for (const path of ["directory/branches", `directory/branches/${id}`]) {
    assert.equal(allowedPath("GET", path), true);
    assert.equal(allowedPath("POST", path), false);
  }
  for (const path of [
    "directory/branches/not-a-uuid",
    `directory/branches/${id}/staff`,
    `directory/branches/${id}/stock`,
  ])
    assert.equal(allowedPath("GET", path), false);
});

test("trainee wallet proxy allows only own read endpoints without arbitrary accounts", () => {
  for (const path of [
    "trainee/wallet/movements",
    "trainee/active-visits",
    "trainee/visits",
  ]) {
    assert.equal(allowedPath("GET", path), true);
    assert.equal(allowedPath("POST", path), false);
  }
  assert.equal(allowedPath("GET", "trainee/wallet/some-user/movements"), false);
});
