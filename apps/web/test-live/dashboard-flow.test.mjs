import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
const apiRequire = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
const webRequire = createRequire(import.meta.url);
const { PrismaClient } = apiRequire("@prisma/client");
const { hashPassword } = await import("../../api/dist/auth/passwords.js");
const dbUrl = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(dbUrl.hostname) ||
  !/^\/(gym_ci|gym_test)$/.test(dbUrl.pathname)
)
  throw new Error("Disposable local test database required");
const db = new PrismaClient(),
  repo = fileURLToPath(new URL("../../..", import.meta.url)),
  web = fileURLToPath(new URL("..", import.meta.url));
const origin = "http://127.0.0.1:3100",
  backend = "http://127.0.0.1:4011";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function ready(url, child) {
  for (let n = 0; n < 150; n++) {
    if (child.exitCode !== null)
      throw new Error("Test server exited before readiness");
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Test server readiness timed out");
}
async function request(
  path,
  { cookie, method = "GET", body, headers = {}, crossOrigin = false } = {},
) {
  return fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(method !== "GET"
        ? { origin: crossOrigin ? "https://foreign.example.test" : origin }
        : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const sessionCookie = (response) =>
  response.headers
    .getSetCookie()
    .find((h) => h.startsWith("__Host-gym_session="))
    ?.split(";")[0];

test(
  "dashboard HTTP → gateway → API → restricted Postgres flow",
  { timeout: 90000 },
  async () => {
    const password = "Synthetic dashboard flow passphrase!";
    const id = randomUUID(),
      passwordHash = await hashPassword(password);
    const admin = await db.user.create({
      data: {
        role: "PLATFORM_ADMIN",
        displayName: "Synthetic HTTP Admin",
        phoneE164: `+20admin${id}`,
        email: `http-admin-${id}@example.test`,
        password: { create: { passwordHash } },
      },
    });
    const owner = await db.user.create({
      data: {
        role: "GYM_OWNER",
        displayName: "Synthetic HTTP Owner",
        phoneE164: `+20owner${id}`,
        email: `http-owner-${id}@example.test`,
        password: { create: { passwordHash } },
      },
    });
    const gym = await db.gym.create({
      data: {
        ownerId: owner.id,
        name: "Synthetic HTTP Gym",
        ownerAcceptedAt: new Date(),
        status: "ACTIVE",
      },
    });
    const branch = await db.branch.create({
      data: {
        gymId: gym.id,
        name: "Synthetic HTTP Branch",
        status: "ACTIVE",
        visitPricePoints: 20,
        sessionMinutes: 120,
      },
    });
    const stock = await db.pointAccount.create({
      data: { type: "BRANCH_INVENTORY", branchId: branch.id },
    });
    const apiProcess = spawn(process.execPath, ["apps/api/dist/server.js"], {
      cwd: repo,
      env: { ...process.env, PORT: "4011", HOST: "127.0.0.1" },
      stdio: "ignore",
    });
    const webProcess = spawn(
      process.execPath,
      [
        webRequire.resolve("next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3100",
      ],
      {
        cwd: web,
        env: {
          ...process.env,
          NODE_ENV: "production",
          API_INTERNAL_URL: backend,
          WEB_ORIGIN: origin,
        },
        stdio: "ignore",
      },
    );
    try {
      await Promise.all([
        ready(backend + "/health", apiProcess),
        ready(origin + "/api/session", webProcess),
      ]);
      const anonymous = await request("/api/backend/admin/topup-settings", {
        headers: { authorization: "Bearer attacker-controlled" },
      });
      assert.equal(anonymous.status, 401);
      const forbiddenOrigin = await request("/api/session", {
        method: "POST",
        crossOrigin: true,
        body: { mode: "admin", identifier: admin.email, password },
      });
      assert.equal(forbiddenOrigin.status, 403);
      const login = await request("/api/session", {
        method: "POST",
        body: { mode: "admin", identifier: admin.email, password },
      });
      assert.equal(login.status, 200);
      const cookie = sessionCookie(login);
      assert.ok(cookie);
      const setCookie = login.headers.getSetCookie().join(";");
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /Secure/i);
      assert.match(setCookie, /SameSite=strict/i);
      assert.equal(
        JSON.stringify(await login.json()).includes("accessToken"),
        false,
      );
      const settingsResponse = await request(
        "/api/backend/admin/topup-settings",
        { cookie },
      );
      assert.equal(settingsResponse.status, 200);
      assert.match(settingsResponse.headers.get("cache-control"), /no-store/);
      const settings = await settingsResponse.json();
      const update = await request("/api/backend/admin/pricing-policies", {
        cookie,
        method: "POST",
        body: {
          expectedVersion: settings.policy.version,
          pointPricePiasters: "125",
          gymDiscountBps: 1000,
          redemptionBps: 8000,
        },
      });
      assert.equal(update.status, 200);
      assert.equal(
        (
          await request("/api/backend/admin/ledger", {
            cookie,
            method: "POST",
            body: {},
          })
        ).status,
        404,
      );
      const ownerLogin = await request("/api/session", {
        method: "POST",
        body: { mode: "staff", identifier: owner.email, password },
      });
      assert.equal(ownerLogin.status, 200);
      const ownerCookie = sessionCookie(ownerLogin);
      assert.ok(ownerCookie);
      assert.equal(
        (
          await request("/api/backend/admin/topup-settings", {
            cookie: ownerCookie,
          })
        ).status,
        403,
      );
      const optionsResponse = await request(
        "/api/backend/topup-options?kind=BRANCH_STOCK",
        { cookie: ownerCookie },
      );
      assert.equal(optionsResponse.status, 200);
      const options = await optionsResponse.json(),
        selection = {
          kind: "BRANCH_STOCK",
          receivingBranchId: branch.id,
          points: 100,
        };
      const quoteResponse = await request("/api/backend/topup-quotes", {
        cookie: ownerCookie,
        method: "POST",
        body: selection,
      });
      assert.equal(quoteResponse.status, 200);
      const quote = await quoteResponse.json();
      assert.equal(quote.chargePiasters, "11250");
      const badImage = await fetch(origin + "/api/backend/receipts", {
        method: "POST",
        headers: { cookie: ownerCookie, origin, "content-type": "image/jpeg" },
        body: "invalid image",
      });
      assert.equal(badImage.status, 400);
      // Synthetic pre-existing evidence: provider upload is covered separately with
      // injected storage in API tests; no real Cloudinary account is touched here.
      const receipt = await db.receiptEvidence.create({
        data: {
          ownerUserId: owner.id,
          objectKey: `synthetic-http/${id}`,
          assetId: id,
          contentHash: id,
          mimeType: "image/jpeg",
          bytes: 10,
        },
      });
      const channel = options.paymentMethods.find((m) => m.type === "INSTAPAY");
      const body = {
        ...selection,
        pricingVersion: quote.pricingVersion,
        receiptId: receipt.id,
        paymentMethod: channel.type,
        paymentMethodVersion: channel.version,
      };
      const key = randomUUID();
      const create = () =>
        request("/api/backend/topups", {
          cookie: ownerCookie,
          method: "POST",
          headers: { "idempotency-key": key },
          body,
        });
      const created = await create();
      assert.equal(created.status, 201);
      const pending = await created.json();
      assert.equal((await (await create()).json()).id, pending.id);
      assert.equal(
        (await db.pointAccount.findUniqueOrThrow({ where: { id: stock.id } }))
          .balance,
        0,
      );
      const pendingList = await request("/api/backend/admin/topups?limit=100", {
        cookie,
      });
      assert.equal(pendingList.status, 200);
      const listed = (await pendingList.json()).items.find(
        (row) => row.id === pending.id,
      );
      assert.equal(listed.requestor.displayName, owner.displayName);
      assert.equal(listed.branch.name, branch.name);
      const review = await request(
        `/api/backend/admin/topups/${pending.id}/review`,
        {
          cookie,
          method: "POST",
          body: {
            decision: "APPROVED",
            reason: "Synthetic HTTP transfer confirmation",
            receivedAmountPiasters: quote.chargePiasters,
            paymentReference: `HTTP-${id}`,
            fundsReceived: true,
            receiptReviewed: true,
          },
        },
      );
      assert.equal(review.status, 200);
      assert.equal(
        (await db.pointAccount.findUniqueOrThrow({ where: { id: stock.id } }))
          .balance,
        100,
      );
      const changed = await request("/api/backend/auth/password/change", {
        cookie,
        method: "POST",
        body: {
          currentPassword: password,
          newPassword: "Synthetic replacement admin passphrase!",
        },
      });
      assert.equal(changed.status, 200);
      const rotatedCookie = sessionCookie(changed);
      assert.ok(rotatedCookie);
      assert.notEqual(rotatedCookie, cookie);
      assert.equal(
        JSON.stringify(await changed.json()).includes("accessToken"),
        false,
      );
      assert.equal((await request("/api/session", { cookie })).status, 401);
      const logout = await request("/api/logout", {
        cookie: rotatedCookie,
        method: "POST",
      });
      assert.equal(logout.status, 200);
      assert.match(logout.headers.getSetCookie().join(";"), /Max-Age=0/);
      assert.equal(
        (await request("/api/session", { cookie: rotatedCookie })).status,
        401,
      );
      const html = await request("/");
      assert.equal(html.status, 200);
      assert.match(await html.text(), /lang="ar"/);
      assert.match(
        html.headers.get("content-security-policy"),
        /frame-ancestors 'none'/,
      );
    } finally {
      apiProcess.kill("SIGTERM");
      webProcess.kill("SIGTERM");
      await db.$disconnect();
    }
  },
);
