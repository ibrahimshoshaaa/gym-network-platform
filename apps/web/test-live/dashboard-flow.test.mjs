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
        phoneE164: "+201500000001",
        email: `http-admin-${id}@example.test`,
        password: { create: { passwordHash } },
      },
    });
    const owner = await db.user.create({
      data: {
        role: "GYM_OWNER",
        displayName: "Synthetic HTTP Owner",
        phoneE164: "+201500000002",
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

      // Operate the full onboarding surface through the browser gateway.
      const createGym = await request("/api/backend/admin/gyms", {
        cookie,
        method: "POST",
        body: {
          name: "Synthetic Onboarding Gym",
          owner: {
            displayName: "Synthetic Invited Owner",
            email: `invited-owner-${id}@example.test`,
            phone: "01500000003",
          },
        },
      });
      assert.equal(createGym.status, 201);
      const newGym = await createGym.json();
      assert.equal(
        (
          await request(`/api/backend/admin/gyms/${newGym.gym.id}/status`, {
            cookie,
            method: "PATCH",
            body: { status: "ACTIVE", reason: "Not yet accepted" },
          })
        ).status,
        409,
      );
      const reissued = await request(
        `/api/backend/admin/gyms/${newGym.gym.id}/owner-invitations`,
        { cookie, method: "POST", body: {} },
      );
      assert.equal(reissued.status, 200);
      const ownerInvitation = await reissued.json();
      assert.equal(
        (
          await request("/api/session", {
            method: "POST",
            body: { mode: "invite", token: newGym.invitation.token, password },
          })
        ).status,
        400,
      );
      const accepted = await request("/api/session", {
        method: "POST",
        body: { mode: "invite", token: ownerInvitation.token, password },
      });
      assert.equal(accepted.status, 200);
      const invitedOwnerCookie = sessionCookie(accepted);
      assert.ok(invitedOwnerCookie);
      const activateGym = await request(
        `/api/backend/admin/gyms/${newGym.gym.id}/status`,
        {
          cookie,
          method: "PATCH",
          body: { status: "ACTIVE", reason: "Synthetic onboarding approved" },
        },
      );
      assert.equal(activateGym.status, 200);
      assert.equal(
        (
          await request(`/api/backend/gyms/${newGym.gym.id}`, {
            cookie: ownerCookie,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/api/backend/admin/gyms/${newGym.gym.id}/branches`, {
            cookie: invitedOwnerCookie,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/api/backend/gyms/${newGym.gym.id}`, {
            cookie: invitedOwnerCookie,
          })
        ).status,
        200,
      );
      const newBranchResponse = await request(
        `/api/backend/gyms/${newGym.gym.id}/branches`,
        {
          cookie: invitedOwnerCookie,
          method: "POST",
          body: {
            name: "Synthetic Onboarding Branch",
            address: "Synthetic full address",
            governorate: "Menofia",
            city: "Synthetic City",
            latitude: 30.5,
            longitude: 31.0,
            visitPricePoints: 30,
            sessionMinutes: 100,
          },
        },
      );
      assert.equal(newBranchResponse.status, 201);
      const newBranch = await newBranchResponse.json();
      assert.equal(
        (
          await request(
            `/api/backend/admin/branches/${newBranch.branch.id}/status`,
            {
              cookie,
              method: "PATCH",
              body: { status: "ACTIVE", reason: "Price not yet approved" },
            },
          )
        ).status,
        409,
      );
      const reviewPrice = await request(
        `/api/backend/admin/price-change-requests/${newBranch.pricingRequest.id}/review`,
        {
          cookie,
          method: "POST",
          body: {
            decision: "APPROVED",
            reason: "Synthetic branch pricing approved",
          },
        },
      );
      assert.equal(reviewPrice.status, 200);
      assert.equal(
        (
          await request(
            `/api/backend/admin/branches/${newBranch.branch.id}/status`,
            {
              cookie,
              method: "PATCH",
              body: {
                status: "ACTIVE",
                reason: "Synthetic location and pricing verified",
              },
            },
          )
        ).status,
        200,
      );
      const branchList = await request(
        `/api/backend/admin/gyms/${newGym.gym.id}/branches`,
        { cookie },
      );
      assert.equal(branchList.status, 200);
      assert.equal(
        (await branchList.json()).items[0].pointAccounts[0].balance,
        0,
      );
      const profileEdit = await request(
        `/api/backend/gyms/${newGym.gym.id}/branches/${newBranch.branch.id}`,
        {
          cookie: invitedOwnerCookie,
          method: "PATCH",
          body: { address: "Updated synthetic address", contactPhone: null },
        },
      );
      assert.equal(profileEdit.status, 200);
      const changePrice = await request(
        `/api/backend/gyms/${newGym.gym.id}/branches/${newBranch.branch.id}/price-change-requests`,
        {
          cookie: invitedOwnerCookie,
          method: "POST",
          body: {
            visitPricePoints: 35,
            sessionMinutes: 110,
            reason: "Synthetic updated session",
          },
        },
      );
      assert.equal(changePrice.status, 201);
      const priceHistory = await request(
        `/api/backend/gyms/${newGym.gym.id}/branches/${newBranch.branch.id}/pricing-history`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(priceHistory.status, 200);
      assert.equal((await priceHistory.json()).items.length, 2);
      const staffBody = {
        branchId: newBranch.branch.id,
        role: "CASHIER",
        contact: {
          displayName: "Synthetic Invited Cashier",
          email: `invited-cashier-${id}@example.test`,
          phone: "01500000004",
        },
      };
      const inviteCashier = () =>
        request(`/api/backend/gyms/${newGym.gym.id}/staff-invitations`, {
          cookie: invitedOwnerCookie,
          method: "POST",
          body: staffBody,
        });
      const firstStaff = await inviteCashier();
      assert.equal(firstStaff.status, 201);
      const firstStaffInvite = await firstStaff.json();
      const revoked = await request(
        `/api/backend/invitations/${firstStaffInvite.invitation.id}/revoke`,
        { cookie: invitedOwnerCookie, method: "POST", body: {} },
      );
      assert.equal(revoked.status, 200);
      assert.equal(
        (
          await request("/api/session", {
            method: "POST",
            body: {
              mode: "invite",
              token: firstStaffInvite.invitation.token,
              password,
            },
          })
        ).status,
        400,
      );
      const freshStaff = await inviteCashier();
      assert.equal(freshStaff.status, 201);
      const freshStaffInvite = await freshStaff.json();
      const acceptedStaff = await request("/api/session", {
        method: "POST",
        body: {
          mode: "invite",
          token: freshStaffInvite.invitation.token,
          password,
        },
      });
      assert.equal(acceptedStaff.status, 200);

      // Real cashier sale and visit postings through the same-origin gateway.
      const cashierCookie = sessionCookie(acceptedStaff);
      const traineeBody = {
        displayName: "Synthetic Visiting Trainee",
        email: `visiting-${id}@example.test`,
        phone: "01500000005",
        password,
      };
      const registration = await fetch(backend + "/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(traineeBody),
      });
      assert.equal(registration.status, 201);
      const traineeIdentity = await registration.json();
      const traineeLogin = await request("/api/session", {
        method: "POST",
        body: { mode: "trainee", identifier: traineeBody.email, password },
      });
      assert.equal(traineeLogin.status, 200);
      const traineeCookie = sessionCookie(traineeLogin);
      assert.ok(traineeCookie);
      const optionResponse = await request(
        "/api/backend/topup-options?kind=BRANCH_STOCK",
        { cookie: invitedOwnerCookie },
      );
      const config = await optionResponse.json();
      const stockReceipt = await db.receiptEvidence.create({
        data: {
          ownerUserId: newGym.owner.id,
          objectKey: `synthetic-stock/${id}`,
          assetId: `stock-${id}`,
          contentHash: `stock-${id}`,
          mimeType: "image/jpeg",
          bytes: 10,
        },
      });
      const stockSubmission = await request("/api/backend/topups", {
        cookie: invitedOwnerCookie,
        method: "POST",
        headers: { "idempotency-key": randomUUID() },
        body: {
          kind: "BRANCH_STOCK",
          receivingBranchId: newBranch.branch.id,
          points: 100,
          pricingVersion: config.policy.version,
          receiptId: stockReceipt.id,
          paymentMethod: "INSTAPAY",
          paymentMethodVersion: config.paymentMethods.find(
            (m) => m.type === "INSTAPAY",
          ).version,
        },
      });
      assert.equal(stockSubmission.status, 201);
      const stockRequest = await stockSubmission.json();
      assert.equal(
        (
          await request(`/api/backend/admin/topups/${stockRequest.id}/review`, {
            cookie,
            method: "POST",
            body: {
              decision: "APPROVED",
              reason: "Synthetic cashier stock funding",
              paymentReference: `CASHIER-${id}`,
              receivedAmountPiasters: "11250",
              fundsReceived: true,
              receiptReviewed: true,
            },
          })
        ).status,
        200,
      );
      const customer = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/trainee-lookup`,
        {
          cookie: cashierCookie,
          method: "POST",
          body: { phone: traineeBody.phone },
        },
      );
      assert.equal(customer.status, 200);
      const matched = await customer.json();
      assert.equal(matched.id, traineeIdentity.user.id);
      assert.equal(JSON.stringify(matched).includes(traineeBody.phone), false);
      const quoteSale = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/sale-quotes`,
        {
          cookie: cashierCookie,
          method: "POST",
          body: { traineeId: matched.id, points: 60 },
        },
      );
      assert.equal(quoteSale.status, 200);
      const saleQuote = await quoteSale.json();
      const sell = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/sales`,
        {
          cookie: cashierCookie,
          method: "POST",
          headers: { "idempotency-key": randomUUID() },
          body: {
            traineeId: matched.id,
            points: 60,
            pricingVersion: saleQuote.pricingVersion,
            receivedAmountPiasters: saleQuote.chargePiasters,
            fundsReceived: true,
          },
        },
      );
      assert.equal(sell.status, 201);
      const ticketResponse = await request("/api/backend/trainee/qr", {
        cookie: traineeCookie,
        method: "POST",
        body: {},
      });
      assert.equal(ticketResponse.status, 200);
      const ticket = await ticketResponse.json();
      const visitPreview = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/visit-previews`,
        {
          cookie: cashierCookie,
          method: "POST",
          body: { token: ticket.token },
        },
      );
      assert.equal(visitPreview.status, 200);
      const entryQuote = await visitPreview.json();
      const entryKey = randomUUID(),
        entryBody = {
          token: ticket.token,
          pricingVersion: entryQuote.pricingVersion,
          branchPricingVersion: entryQuote.branchPricingVersion,
          presenceConfirmed: true,
        };
      const enter = () =>
        request(`/api/backend/cashier/branches/${newBranch.branch.id}/visits`, {
          cookie: cashierCookie,
          method: "POST",
          headers: { "idempotency-key": entryKey },
          body: entryBody,
        });
      const entryResponse = await enter();
      assert.equal(entryResponse.status, 201);
      const entered = await entryResponse.json();
      assert.equal((await (await enter()).json()).visit.id, entered.visit.id);
      const traineeWallet = await request("/api/backend/trainee/wallet", {
        cookie: traineeCookie,
      });
      assert.equal((await traineeWallet.json()).balance, 30);
      const receivables = await request(
        `/api/backend/gyms/${newGym.gym.id}/receivables`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(receivables.status, 200);
      assert.equal(
        (await receivables.json()).accounts.find(
          (a) => a.type === "GYM_AVAILABLE",
        ).balancePiasters,
        "3000",
      );
      const inviteLog = await request(
        `/api/backend/gyms/${newGym.gym.id}/invitations`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(inviteLog.status, 200);
      const invitations = await inviteLog.json();
      assert.equal(JSON.stringify(invitations).includes("tokenHash"), false);
      assert.equal(JSON.stringify(invitations).includes('"token"'), false);
      const staffList = await request(
        `/api/backend/gyms/${newGym.gym.id}/staff`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(staffList.status, 200);
      const membership = (await staffList.json()).items[0];
      assert.equal(membership.branch.name, newBranch.branch.name);
      assert.equal(
        (
          await request(
            `/api/backend/gyms/${newGym.gym.id}/staff/${membership.id}`,
            {
              cookie: invitedOwnerCookie,
              method: "PATCH",
              body: { active: false },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(`/api/backend/gyms/${newGym.gym.id}`, {
            cookie: sessionCookie(acceptedStaff),
          })
        ).status,
        403,
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
