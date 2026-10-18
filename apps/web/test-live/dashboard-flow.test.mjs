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
  { timeout: 180000 },
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
          API_INTERNAL_URL: "http://127.0.0.1:1",
          GYM_EMBEDDED_API: "true",
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
        body: { mode: "auto", identifier: admin.email, password },
      });
      assert.equal(forbiddenOrigin.status, 403);
      const login = await request("/api/session", {
        method: "POST",
        body: { mode: "auto", identifier: admin.email, password },
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
      // Uppercase enum segments must pass the embedded adapter and persist.
      for (const type of ["INSTAPAY", "WALLET"]) {
        const existing = settings.paymentMethods.find(method => method.type === type);
        const saved = await request(`/api/backend/admin/payment-methods/${type}`, {
          cookie, method: "PUT",
          body: { expectedVersion: existing?.version ?? 0, account: "01500000009", accountName: "Synthetic HTTP Receiver", enabled: true },
        });
        assert.equal(saved.status, 200, `saving ${type} through embedded gateway`);
        const stored = await saved.json();
        assert.equal(stored.type, type);
        assert.equal(stored.enabled, true);
        assert.equal(stored.version, (existing?.version ?? 0) + 1);
        const reloaded = await request("/api/backend/admin/topup-settings", { cookie });
        assert.equal(reloaded.status, 200);
        const method = (await reloaded.json()).paymentMethods.find(method => method.type === type);
        assert.equal(method.account, "01500000009");
        assert.equal(method.accountName, "Synthetic HTTP Receiver");
        assert.equal(method.enabled, true);
      }
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
        body: { mode: "auto", identifier: owner.email, password },
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
      const staffPerson = (await acceptedStaff.clone().json()).user;
      const automaticStaff = await request("/api/session", { method: "POST", body: { mode: "auto", identifier: staffPerson.email, password } });
      assert.equal(automaticStaff.status, 200);
      assert.equal((await automaticStaff.json()).user.role, staffPerson.role);

      // Real cashier sale and visit postings through the same-origin gateway.
      const cashierCookie = sessionCookie(acceptedStaff);
      const traineeBody = {
        displayName: "Synthetic Visiting Trainee",
        email: `visiting-${id}@example.test`,
        phone: "01500000005",
        password,
      };
      const badRegisterOrigin = await request("/api/register", {
        method: "POST", crossOrigin: true, body: traineeBody,
      });
      assert.equal(badRegisterOrigin.status, 403);
      const roleEscalation = await request("/api/register", {
        method: "POST", body: { ...traineeBody, role: "PLATFORM_ADMIN" },
      });
      assert.equal(roleEscalation.status, 400);
      const registration = await request("/api/register", { method: "POST", body: traineeBody });
      assert.equal(registration.status, 201);
      const traineeIdentity = await registration.json();
      assert.equal(traineeIdentity.user.role, "TRAINEE");
      assert.equal("accessToken" in traineeIdentity, false);
      const registeredCookie = sessionCookie(registration);
      assert.ok(registeredCookie);
      assert.match(registration.headers.getSetCookie().join(";"), /HttpOnly/i);
      const firstWallet = await request("/api/backend/trainee/wallet", { cookie: registeredCookie });
      assert.equal(firstWallet.status, 200);
      assert.equal((await firstWallet.json()).balance, 0);
      assert.equal((await request("/api/backend/admin/topup-settings", { cookie: registeredCookie })).status, 403);
      const duplicateRegistration = await request("/api/register", { method: "POST", body: traineeBody });
      assert.equal(duplicateRegistration.status, 409);
      const traineeLogin = await request("/api/session", {
        method: "POST",
        body: { identifier: traineeBody.email, password },
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
      const sold = await sell.json();
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
      // Manager cancellation and review decisions cross the production BFF,
      // preserving private cookies, explicit scopes and idempotency headers.
      const managerInviteResponse = await request(
        `/api/backend/gyms/${newGym.gym.id}/staff-invitations`,
        {
          cookie: invitedOwnerCookie,
          method: "POST",
          body: {
            ...staffBody,
            role: "BRANCH_MANAGER",
            contact: {
              displayName: "Synthetic Branch Manager",
              email: `manager-${id}@example.test`,
              phone: "01500000006",
            },
          },
        },
      );
      assert.equal(managerInviteResponse.status, 201);
      const managerInvite = await managerInviteResponse.json();
      const managerLogin = await request("/api/session", {
        method: "POST",
        body: {
          mode: "invite",
          token: managerInvite.invitation.token,
          password,
        },
      });
      assert.equal(managerLogin.status, 200);
      const managerPerson = (await managerLogin.clone().json()).user;
      const automaticManager = await request("/api/session", { method: "POST", body: { mode: "auto", identifier: managerPerson.email, password } });
      assert.equal(automaticManager.status, 200);
      assert.equal((await automaticManager.json()).user.role, managerPerson.role);
      const managerCookie = sessionCookie(managerLogin);
      const managedBranches = await request(
        "/api/backend/operations/branches",
        { cookie: managerCookie },
      );
      const managerBranch = (await managedBranches.json()).items.find(
        (b) => b.id === newBranch.branch.id,
      );
      assert.equal(managerBranch.canCancel, true);
      assert.equal(managerBranch.canSell, false);
      const cancelPath = `/api/backend/operations/branches/${newBranch.branch.id}/visits/${entered.visit.id}/cancel`;
      const cancellationKey = randomUUID(),
        cancelBody = { reason: "Synthetic duplicate admission cancelled" };
      assert.equal(
        (
          await request(cancelPath, {
            cookie: cashierCookie,
            method: "POST",
            headers: { "idempotency-key": cancellationKey },
            body: cancelBody,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(cancelPath, {
            cookie: managerCookie,
            method: "POST",
            headers: { "idempotency-key": cancellationKey },
            body: cancelBody,
            crossOrigin: true,
          })
        ).status,
        403,
      );
      const cancel = () =>
        request(cancelPath, {
          cookie: managerCookie,
          method: "POST",
          headers: { "idempotency-key": cancellationKey },
          body: cancelBody,
        });
      const cancelledResponse = await cancel();
      assert.equal(cancelledResponse.status, 200);
      const cancelled = await cancelledResponse.json();
      assert.equal((await (await cancel()).json()).id, cancelled.id);
      assert.equal(
        (
          await (
            await request("/api/backend/trainee/wallet", {
              cookie: traineeCookie,
            })
          ).json()
        ).balance,
        60,
      );
      assert.equal(
        (
          await (
            await request(`/api/backend/gyms/${newGym.gym.id}/receivables`, {
              cookie: invitedOwnerCookie,
            })
          ).json()
        ).accounts.find((a) => a.type === "GYM_AVAILABLE").balancePiasters,
        "0",
      );
      const nextQr = await (
        await request("/api/backend/trainee/qr", {
          cookie: traineeCookie,
          method: "POST",
          body: {},
        })
      ).json();
      const nextEntryResponse = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/visits`,
        {
          cookie: cashierCookie,
          method: "POST",
          headers: { "idempotency-key": randomUUID() },
          body: { ...entryBody, token: nextQr.token },
        },
      );
      assert.equal(nextEntryResponse.status, 201);
      const nextEntry = await nextEntryResponse.json();
      const reviewKey = randomUUID(),
        correctionBody = {
          kind: "VISIT_CANCEL",
          targetId: nextEntry.visit.id,
          reason: "Synthetic trainee requested correction",
          evidenceText: "Synthetic supporting attendance details",
        };
      const submitCorrection = () =>
        request("/api/backend/operation-reviews", {
          cookie: traineeCookie,
          method: "POST",
          headers: { "idempotency-key": reviewKey },
          body: correctionBody,
        });
      const correctionResponse = await submitCorrection();
      assert.equal(correctionResponse.status, 200);
      const correction = await correctionResponse.json();
      assert.equal((await (await submitCorrection()).json()).id, correction.id);
      const mine = await (
        await request("/api/backend/operation-reviews", {
          cookie: traineeCookie,
        })
      ).json();
      assert.ok(mine.items.some((r) => r.id === correction.id));
      const foreignReviews = await (
        await request("/api/backend/operation-reviews", { cookie: ownerCookie })
      ).json();
      assert.equal(
        foreignReviews.items.some((r) => r.id === correction.id),
        false,
      );
      const correctionDetail = await request(
        `/api/backend/admin/operation-reviews/${correction.id}`,
        { cookie },
      );
      assert.equal(correctionDetail.status, 200);
      assert.equal(
        (await correctionDetail.json()).target.settlementPiasters,
        "3000",
      );
      const approvalBody = {
        decision: "APPROVE",
        reason: "Synthetic administrator verified correction",
      };
      const approveCorrection = () =>
        request(
          `/api/backend/admin/operation-reviews/${correction.id}/review`,
          { cookie, method: "POST", body: approvalBody },
        );
      assert.equal((await approveCorrection()).status, 200);
      assert.equal((await approveCorrection()).status, 200);
      assert.equal(
        (
          await (
            await request("/api/backend/trainee/wallet", {
              cookie: traineeCookie,
            })
          ).json()
        ).balance,
        60,
      );
      const saleCorrection = await request("/api/backend/operation-reviews", {
        cookie: cashierCookie,
        method: "POST",
        headers: { "idempotency-key": randomUUID() },
        body: { ...correctionBody, kind: "SALE_CORRECTION", targetId: sold.id },
      });
      assert.equal(saleCorrection.status, 200);
      const saleReview = await saleCorrection.json();
      const policyBlocked = await request(
        `/api/backend/admin/operation-reviews/${saleReview.id}/review`,
        { cookie, method: "POST", body: approvalBody },
      );
      assert.equal(policyBlocked.status, 409);
      assert.equal(
        (await policyBlocked.json()).code,
        "SALE_REFUND_POLICY_REQUIRED",
      );
      assert.equal(
        (
          await request(
            `/api/backend/admin/operation-reviews/${saleReview.id}/review`,
            {
              cookie,
              method: "POST",
              body: {
                decision: "REJECT",
                reason: "Synthetic valid sale kept unchanged",
              },
            },
          )
        ).status,
        200,
      );
      // Manual withdrawals reserve one consolidated gym wallet, snapshot the
      // destination/calendar, record proof and retain a paid-transfer dispute.
      const earnTicket = await (
        await request("/api/backend/trainee/qr", {
          cookie: traineeCookie,
          method: "POST",
          body: {},
        })
      ).json();
      const earnedResponse = await request(
        `/api/backend/cashier/branches/${newBranch.branch.id}/visits`,
        {
          cookie: cashierCookie,
          method: "POST",
          headers: { "idempotency-key": randomUUID() },
          body: { ...entryBody, token: earnTicket.token },
        },
      );
      assert.equal(earnedResponse.status, 201);
      const earned = await earnedResponse.json();
      const payoutBody = {
        amountPiasters: "1000",
        paymentMethod: "INSTAPAY",
        destinationAccount: "synthetic-owner@instapay",
        destinationName: "Synthetic Gym Beneficiary",
      };
      const makeWithdrawal = (key = randomUUID()) =>
        request(`/api/backend/gyms/${newGym.gym.id}/withdrawals`, {
          cookie: invitedOwnerCookie,
          method: "POST",
          headers: { "idempotency-key": key },
          body: payoutBody,
        });
      assert.equal(
        (
          await request(`/api/backend/gyms/${newGym.gym.id}/withdrawals`, {
            cookie: ownerCookie,
            method: "POST",
            headers: { "idempotency-key": randomUUID() },
            body: payoutBody,
          })
        ).status,
        403,
      );
      const pendingResponse = await makeWithdrawal();
      assert.equal(pendingResponse.status, 200);
      const pendingWithdrawal = await pendingResponse.json();
      const cancelKey = randomUUID();
      const cancelWithdrawal = () =>
        request(`/api/backend/withdrawals/${pendingWithdrawal.id}/cancel`, {
          cookie: invitedOwnerCookie,
          method: "POST",
          headers: { "idempotency-key": cancelKey },
          body: { reason: "Synthetic owner corrected withdrawal" },
        });
      assert.equal((await cancelWithdrawal()).status, 200);
      assert.equal((await cancelWithdrawal()).status, 200);
      const withdrawalKey = randomUUID();
      const withdrawalResponse = await makeWithdrawal(withdrawalKey);
      assert.equal(withdrawalResponse.status, 200);
      const withdrawal = await withdrawalResponse.json();
      assert.equal(
        (await (await makeWithdrawal(withdrawalKey)).json()).id,
        withdrawal.id,
      );
      const currentCalendar = await (
        await request("/api/backend/admin/withdrawal-calendar", { cookie })
      ).json();
      const calendarResponse = await request(
        "/api/backend/admin/withdrawal-calendar",
        {
          cookie,
          method: "POST",
          body: {
            expectedVersion: currentCalendar.calendar?.version ?? 0,
            workdays: [1, 2, 3, 4, 5],
            holidays: [],
            countAcceptanceDay: false,
            deadlineHour: 17,
            deadlineMinute: 0,
          },
        },
      );
      assert.equal(calendarResponse.status, 200);
      const payoutCalendar = await calendarResponse.json();
      const acceptWithdrawal = await request(
        `/api/backend/admin/withdrawals/${withdrawal.id}/review`,
        {
          cookie,
          method: "POST",
          headers: { "idempotency-key": randomUUID() },
          body: {
            decision: "APPROVE",
            reason: "Synthetic payout destination independently verified",
            calendarVersion: payoutCalendar.version,
            destinationVerified: true,
          },
        },
      );
      assert.equal(acceptWithdrawal.status, 200);
      const acceptedWithdrawal = await acceptWithdrawal.json();
      assert.ok(acceptedWithdrawal.acceptedAt);
      assert.ok(acceptedWithdrawal.dueAt);
      const transferProof = await db.receiptEvidence.create({
        data: {
          ownerUserId: admin.id,
          objectKey: `synthetic-payout/${id}`,
          assetId: `payout-${id}`,
          contentHash: `payout-${id}`,
          mimeType: "image/jpeg",
          bytes: 10,
        },
      });
      const paymentKey = randomUUID(),
        payoutReference = `PAYOUT-${id}`;
      const registerPayment = () =>
        request(`/api/backend/admin/withdrawals/${withdrawal.id}/payment`, {
          cookie,
          method: "POST",
          headers: { "idempotency-key": paymentKey },
          body: {
            proofReceiptId: transferProof.id,
            transferReference: payoutReference,
            transferredAmountPiasters: "1000",
            fundsTransferred: true,
            proofReviewed: true,
            reason: "Synthetic external transfer confirmed",
          },
        });
      assert.equal((await registerPayment()).status, 200);
      assert.equal((await registerPayment()).status, 200);
      const ownWithdrawalDetail = await request(
        `/api/backend/withdrawals/${withdrawal.id}`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(ownWithdrawalDetail.status, 200);
      const withdrawalSnapshot = await ownWithdrawalDetail.json();
      assert.equal(withdrawalSnapshot.withdrawal.proofReceiptId,transferProof.id);
      assert.equal(withdrawalSnapshot.balances.consistent,true);
      assert.ok(withdrawalSnapshot.balances.visitCount > 0);
      assert.ok(withdrawalSnapshot.balances.latestVisits.length > 0);
      assert.equal(withdrawalSnapshot.balances.currentReservedPiasters,"0");
      assert.equal(withdrawalSnapshot.balances.availableAfterPaymentPiasters,null);
      assert.equal(
        (
          await request(`/api/backend/withdrawals/${withdrawal.id}`, {
            cookie: ownerCookie,
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/api/backend/receipts/${transferProof.id}/access`, {
            cookie: ownerCookie,
          })
        ).status,
        403,
      );
      const feedbackKey = randomUUID();
      const disputePayment = () =>
        request(`/api/backend/withdrawals/${withdrawal.id}/feedback`, {
          cookie: invitedOwnerCookie,
          method: "POST",
          headers: { "idempotency-key": feedbackKey },
          body: {
            kind: "DISPUTE",
            reason: "Synthetic owner reported transfer not received",
          },
        });
      assert.equal((await disputePayment()).status, 200);
      assert.equal((await disputePayment()).status, 200);
      const afterPayout = await (
        await request(`/api/backend/gyms/${newGym.gym.id}/receivables`, {
          cookie: invitedOwnerCookie,
        })
      ).json();
      assert.equal(
        afterPayout.accounts.find((a) => a.type === "GYM_AVAILABLE")
          .balancePiasters,
        "2000",
      );
      assert.equal(
        afterPayout.accounts.find((a) => a.type === "GYM_RESERVED")
          .balancePiasters,
        "0",
      );
      assert.equal(
        afterPayout.accounts.find((a) => a.type === "GYM_PAID").balancePiasters,
        "1000",
      );
      const unsafeClawback = await request(
        `/api/backend/operations/branches/${newBranch.branch.id}/visits/${earned.visit.id}/cancel`,
        {
          cookie: managerCookie,
          method: "POST",
          headers: { "idempotency-key": randomUUID() },
          body: { reason: "Synthetic already settled visit correction" },
        },
      );
      assert.equal(unsafeClawback.status, 409);
      assert.equal(
        (await unsafeClawback.json()).code,
        "SETTLEMENT_REVIEW_REQUIRED",
      );
      const reportDay = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      const reportQuery = new URLSearchParams({
        from: reportDay,
        to: reportDay,
        gymId: newGym.gym.id,
      }).toString();
      const summaryResponse = await request(
        `/api/backend/reports/summary?${reportQuery}`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(summaryResponse.status, 200);
      const report = await summaryResponse.json();
      assert.equal(report.sales.points, "60");
      assert.equal(report.sales.amountPiasters, "7500");
      assert.equal(report.visits.count, "3");
      assert.equal(report.visits.amountPiasters, "9000");
      assert.equal(report.cancellations.count, "2");
      assert.equal(report.netVisitReceivablesPiasters, "3000");
      assert.equal(report.paidWithdrawals.amountPiasters, "1000");
      assert.equal(report.alerts.withdrawals.disputed, "1");
      assert.equal(report.currentStockPoints, "40");
      const reportCsv = await request(
        `/api/backend/reports/export?${reportQuery}&kind=SALES`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(reportCsv.status, 200);
      assert.match(reportCsv.headers.get("content-type"), /text\/csv/);
      assert.match(
        reportCsv.headers.get("content-disposition"),
        /attachment; filename="gym-report-sales-/,
      );
      assert.match(reportCsv.headers.get("cache-control"), /no-store/);
      assert.equal(reportCsv.headers.get("x-content-type-options"), "nosniff");
      const csvText = await reportCsv.text();
      assert.match(csvText, /"60","7500"/);
      assert.equal(csvText.includes("tokenHash"), false);
      assert.equal(csvText.includes("beneficiary"), false);
      assert.equal(
        (
          await request(
            `/api/backend/reports/export?${reportQuery}&kind=SALES`,
            { cookie: ownerCookie },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`/api/backend/reports/summary?${reportQuery}`, {
            cookie: cashierCookie,
          })
        ).status,
        403,
      );
      const branchReport = await request(
        `/api/backend/reports/summary?${reportQuery}&branchId=${newBranch.branch.id}`,
        { cookie: cashierCookie },
      );
      assert.equal(branchReport.status, 200);
      const scopedReport = await branchReport.json();
      assert.equal(scopedReport.currentBalances, null);
      assert.equal(scopedReport.topups, null);
      assert.equal(scopedReport.alerts.withdrawals, null);
      const reportPage = await request(
        `/api/backend/reports/rows?${reportQuery}&kind=VISITS&limit=1`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(reportPage.status, 200);
      const pageReport = await reportPage.json();
      assert.equal(pageReport.items.length, 1);
      assert.ok(pageReport.nextCursor);
      const allVisits = await request(
        `/api/backend/reports/export?${reportQuery}&kind=VISITS&limit=1`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(allVisits.status, 200);
      assert.equal((await allVisits.text()).split("\r\n").length, 5);
      assert.equal(
        (
          await request(
            `/api/backend/reports/export?${reportQuery}&kind=VISITS&status=PAID`,
            { cookie: invitedOwnerCookie },
          )
        ).status,
        400,
      );
      const receivingBranchResponse = await request(
        `/api/backend/gyms/${newGym.gym.id}/branches`,
        {
          cookie: invitedOwnerCookie,
          method: "POST",
          body: {
            name: "Synthetic Transfer Destination",
            address: "Synthetic receiving branch address",
            governorate: "Menofia",
            city: "Synthetic City",
            latitude: 30.6,
            longitude: 31.1,
            visitPricePoints: 30,
            sessionMinutes: 100,
          },
        },
      );
      assert.equal(receivingBranchResponse.status, 201);
      const receivingBranch = await receivingBranchResponse.json();
      assert.equal(
        (
          await request(
            `/api/backend/admin/price-change-requests/${receivingBranch.pricingRequest.id}/review`,
            {
              cookie,
              method: "POST",
              body: {
                decision: "APPROVED",
                reason: "Synthetic destination price approved",
              },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/api/backend/admin/branches/${receivingBranch.branch.id}/status`,
            {
              cookie,
              method: "PATCH",
              body: {
                status: "ACTIVE",
                reason: "Synthetic destination approved for operation",
              },
            },
          )
        ).status,
        200,
      );
      const stockPath = `/api/backend/gyms/${newGym.gym.id}/stock-transfers`,
        stockKey = randomUUID(),
        stockBody = {
          fromBranchId: newBranch.branch.id,
          toBranchId: receivingBranch.branch.id,
          points: 20,
        };
      const beforeStock = await request(
        `/api/backend/inventory/branches/${newBranch.branch.id}`,
        { cookie: invitedOwnerCookie },
      );
      assert.equal(beforeStock.status, 200);
      assert.equal((await beforeStock.json()).stock, 40);
      for (const forbiddenCookie of [
        cashierCookie,
        managerCookie,
        ownerCookie,
        cookie,
      ])
        assert.equal(
          (
            await request(stockPath, {
              cookie: forbiddenCookie,
              method: "POST",
              headers: { "idempotency-key": randomUUID() },
              body: stockBody,
            })
          ).status,
          403,
        );
      const transferStock = () =>
        request(stockPath, {
          cookie: invitedOwnerCookie,
          method: "POST",
          headers: { "idempotency-key": stockKey },
          body: stockBody,
        });
      const stockTransfer = await transferStock();
      assert.equal(stockTransfer.status, 201);
      const transferredStock = await stockTransfer.json();
      assert.ok(transferredStock.id);
      assert.equal(
        (await (await transferStock()).json()).id,
        transferredStock.id,
      );
      assert.equal(
        (
          await request(stockPath, {
            cookie: invitedOwnerCookie,
            method: "POST",
            headers: { "idempotency-key": stockKey },
            body: { ...stockBody, points: 21 },
          })
        ).status,
        409,
      );
      const afterSource = await (
          await request(
            `/api/backend/inventory/branches/${newBranch.branch.id}`,
            { cookie: invitedOwnerCookie },
          )
        ).json(),
        afterTarget = await (
          await request(
            `/api/backend/inventory/branches/${receivingBranch.branch.id}`,
            { cookie: invitedOwnerCookie },
          )
        ).json();
      assert.equal(afterSource.stock, 20);
      assert.equal(afterTarget.stock, 20);
      const sourceMovements = await request(
          `/api/backend/inventory/branches/${newBranch.branch.id}/movements`,
          { cookie: cashierCookie },
        ),
        targetMovements = await request(
          `/api/backend/inventory/branches/${receivingBranch.branch.id}/movements`,
          { cookie: invitedOwnerCookie },
        );
      assert.equal(sourceMovements.status, 200);
      assert.match(sourceMovements.headers.get("cache-control"), /no-store/);
      const sourceMovement = (await sourceMovements.json()).items.find(
          (m) => m.transactionId === transferredStock.id,
        ),
        targetMovement = (await targetMovements.json()).items[0];
      assert.equal(sourceMovement.delta, -20);
      assert.equal(sourceMovement.operation, "BRANCH_TRANSFER");
      assert.equal(targetMovement.delta, 20);
      assert.equal(targetMovement.transactionId, transferredStock.id);
      assert.equal(
        (
          await request(
            `/api/backend/inventory/branches/${receivingBranch.branch.id}/movements`,
            { cookie: cashierCookie },
          )
        ).status,
        403,
      );
      const conserved = await (
        await request(`/api/backend/reports/summary?${reportQuery}`, {
          cookie: invitedOwnerCookie,
        })
      ).json();
      assert.equal(conserved.currentStockPoints, "40");
      assert.equal(conserved.netVisitReceivablesPiasters, "3000");
      assert.equal(
        (await request("/api/backend/directory/branches")).status,
        401,
      );
      assert.equal(
        (await request("/api/backend/directory/branches", { cookie })).status,
        403,
      );
      const directoryQuery = new URLSearchParams({
        q: newBranch.branch.name,
        governorate: "Menofia",
        city: "Synthetic City",
        limit: "1",
      }).toString();
      const directoryResponse = await request(
        `/api/backend/directory/branches?${directoryQuery}`,
        { cookie: traineeCookie },
      );
      assert.equal(directoryResponse.status, 200);
      assert.match(directoryResponse.headers.get("cache-control"), /no-store/);
      const branchDirectory = await directoryResponse.json();
      assert.equal(branchDirectory.items.length, 1);
      assert.equal(branchDirectory.items[0].id, newBranch.branch.id);
      assert.equal(branchDirectory.items[0].visitPricePoints, 30);
      assert.equal(branchDirectory.items[0].sessionMinutes, 100);
      assert.equal(JSON.stringify(branchDirectory).includes("ownerId"), false);
      assert.equal(
        JSON.stringify(branchDirectory).includes("pointAccounts"),
        false,
      );
      const directoryDetailResponse = await request(
        `/api/backend/directory/branches/${newBranch.branch.id}`,
        { cookie: traineeCookie },
      );
      assert.equal(directoryDetailResponse.status, 200);
      const directoryDetail = await directoryDetailResponse.json();
      assert.equal(directoryDetail.branch.gym.id, newGym.gym.id);
      assert.equal(Number(directoryDetail.branch.latitude), 30.5);
      assert.equal(Number(directoryDetail.branch.longitude), 31);
      assert.equal(
        (
          await request(
            `/api/backend/directory/branches/${newBranch.branch.id}/staff`,
            { cookie: traineeCookie },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request("/api/backend/directory/branches?status=SUSPENDED", {
            cookie: traineeCookie,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/api/backend/admin/branches/${newBranch.branch.id}/status`,
            {
              cookie,
              method: "PATCH",
              body: {
                status: "SUSPENDED",
                reason: "Synthetic directory suspension visibility test",
              },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/api/backend/directory/branches/${newBranch.branch.id}`,
            { cookie: traineeCookie },
          )
        ).status,
        404,
      );
      const hiddenDirectory = await (
        await request(`/api/backend/directory/branches?${directoryQuery}`, {
          cookie: traineeCookie,
        })
      ).json();
      assert.equal(hiddenDirectory.items.length, 0);
      assert.equal(
        (
          await request(
            `/api/backend/admin/branches/${newBranch.branch.id}/status`,
            {
              cookie,
              method: "PATCH",
              body: {
                status: "ACTIVE",
                reason: "Synthetic directory branch reactivation",
              },
            },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            `/api/backend/directory/branches/${newBranch.branch.id}`,
            { cookie: traineeCookie },
          )
        ).status,
        200,
      );
      const walletSnapshotResponse = await request(
        "/api/backend/trainee/wallet",
        { cookie: traineeCookie },
      );
      assert.equal(walletSnapshotResponse.status, 200);
      const walletSnapshot = await walletSnapshotResponse.json();
      assert.equal(walletSnapshot.balance, 30);
      assert.equal(walletSnapshot.spendablePoints, 30);
      assert.equal(walletSnapshot.unavailablePoints, 0);
      assert.equal(walletSnapshot.status, "VALID");
      assert.ok(walletSnapshot.serverTime);
      const pointHistoryResponse = await request(
        "/api/backend/trainee/wallet/movements?limit=1",
        { cookie: traineeCookie },
      );
      assert.equal(pointHistoryResponse.status, 200);
      assert.match(
        pointHistoryResponse.headers.get("cache-control"),
        /no-store/,
      );
      const pointPage = await pointHistoryResponse.json();
      assert.equal(pointPage.items.length, 1);
      assert.ok(pointPage.nextCursor);
      const pointHistory = await (
        await request("/api/backend/trainee/wallet/movements", {
          cookie: traineeCookie,
        })
      ).json();
      assert.equal(
        pointHistory.items.reduce((sum, m) => sum + m.delta, 0),
        30,
      );
      assert.equal(
        pointHistory.items.filter((m) => m.operation === "SALE").length,
        1,
      );
      assert.equal(
        pointHistory.items.filter((m) => m.operation === "VISIT").length,
        3,
      );
      assert.equal(
        pointHistory.items.filter((m) => m.operation === "VISIT_CANCELLATION")
          .length,
        2,
      );
      assert.equal(
        JSON.stringify(pointHistory).includes("settlementPiasters"),
        false,
      );
      assert.equal(JSON.stringify(pointHistory).includes("requestHash"), false);
      const onlySales = await (
        await request(
          "/api/backend/trainee/wallet/movements?operation=SALE&limit=1",
          { cookie: traineeCookie },
        )
      ).json();
      assert.equal(onlySales.items.length, 1);
      assert.equal(onlySales.items[0].delta, 60);
      assert.equal(onlySales.items[0].referenceId, sold.id);
      const activeSessions = await request(
        "/api/backend/trainee/active-visits",
        { cookie: traineeCookie },
      );
      assert.equal(activeSessions.status, 200);
      const activeSession = (await activeSessions.json()).items[0];
      assert.equal(activeSession.id, earned.visit.id);
      assert.equal(activeSession.branch.id, newBranch.branch.id);
      assert.ok(activeSession.serverTime);
      assert.equal("settlementPiasters" in activeSession, false);
      const ownVisitHistory = await request("/api/backend/trainee/visits", {
        cookie: traineeCookie,
      });
      assert.equal(ownVisitHistory.status, 200);
      const ownVisits = (await ownVisitHistory.json()).items;
      assert.equal(ownVisits.length, 3);
      assert.equal(ownVisits.filter((v) => v.status === "CANCELLED").length, 2);
      assert.equal(ownVisits[0].id, earned.visit.id);
      assert.equal(JSON.stringify(ownVisits).includes("cashierId"), false);
      assert.equal(
        (
          await request("/api/backend/trainee/wallet/movements", {
            cookie: invitedOwnerCookie,
          })
        ).status,
        403,
      );
      assert.equal(
        (await request("/api/backend/trainee/wallet/movements")).status,
        401,
      );
      assert.equal(
        (
          await request(
            `/api/backend/trainee/wallet/movements?userId=${traineeIdentity.user.id}`,
            { cookie: traineeCookie },
          )
        ).status,
        400,
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
      const membership = (await staffList.json()).items.find(
        (m) => m.role === "CASHIER",
      );
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
      // Real mobile viewport check uses only synthetic local identities.
      if(process.env.GYM_BROWSER_TEST === '1') {
        const {chromium,expect}=await import('@playwright/test');
        const browser=await chromium.launch({headless:true});
        try {
          const publicContext=await browser.newContext({ignoreHTTPSErrors:true});
          const publicPage=await publicContext.newPage();
          await publicPage.goto(origin);
          await expect(publicPage.getByRole('heading',{name:'أهلًا بيك',exact:true})).toBeVisible();
          await publicPage.evaluate(()=>document.fonts.ready);
          for(const width of [320,768,1440]) {
            await publicPage.setViewportSize({width,height:1000});
            await expect(publicPage.getByRole('button',{name:'تسجيل الدخول',exact:true})).toBeVisible();
            assert.equal(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'login must fit every viewport');
          }
          await publicContext.close();
          const context=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
          const separator=cookie.indexOf('=');
          await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
          const page=await context.newPage();
          const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
          await page.goto(origin);
          await expect(page.getByRole('heading',{name:'مهامك اليومية'})).toBeVisible();
          await expect(page.getByRole('heading',{name:'نظرة سريعة'})).toBeVisible();
          await expect(page.getByRole('heading',{name:'الصورة المالية للمنصة',exact:true})).toBeVisible();
          await expect(page.getByText('إجمالي المستحق للجيمات',{exact:true})).toBeVisible();
          await page.getByRole('button',{name:'أرصدة الجيمات ومستحقاتها',exact:true}).click();
          await expect(page.getByRole('heading',{name:'كشف أرصدة الجيمات ومستحقاتها'})).toBeVisible();
          await expect(page.locator('.platform-finance .mobile-records tbody tr').first()).toBeVisible();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'platform finance and gym balances must fit mobile');

          const setupBranchResponse=await request(`/api/backend/gyms/${newGym.gym.id}/branches`,{cookie:invitedOwnerCookie,method:'POST',body:{name:'Synthetic Unified Browser Branch',address:'Synthetic unified setup address',governorate:'Menofia',city:'Synthetic City',latitude:30.5,longitude:31,visitPricePoints:19,sessionMinutes:75}});
          assert.equal(setupBranchResponse.status,201);
          const setupBranch=await setupBranchResponse.json();
          const setupLedgerBefore=[await db.pointTransaction.count(),await db.moneyTransaction.count()];
          await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
          await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الجيمات والفروع',exact:true}).click();
          await expect(page.locator('.gym-list-item').first()).toBeVisible();
          const setupGymCard=page.locator('.gym-list-item').filter({has:page.getByRole('heading',{name:'Synthetic Onboarding Gym',exact:true})});
          for(let n=0;n<30&&await setupGymCard.count()===0;n++){
            const beforeCount=await page.locator('.gym-list-item').count();
            await page.getByRole('button',{name:'تحميل المزيد',exact:true}).click();
            await expect(page.locator('.gym-list-item')).not.toHaveCount(beforeCount);
          }
          await setupGymCard.getByRole('button',{name:'الفروع وتفاصيل الجيم',exact:true}).click();
          const setupCard=page.locator('.branch-setup-card').filter({has:page.getByRole('heading',{name:'Synthetic Unified Browser Branch',exact:true})});
          await expect(setupCard).toContainText('19 نقطة');
          await expect(setupCard).toContainText('75 دقيقة');
          await setupCard.getByRole('button',{name:'اعتماد وتفعيل الفرع',exact:true}).click();
          await page.getByRole('checkbox',{name:'راجعت بيانات الفرع والموقع والنقاط ومدة الزيارة',exact:true}).check();
          await page.getByRole('button',{name:'تأكيد الاعتماد',exact:true}).click();
          await expect(setupCard).toContainText('الفرع معتمد ومفعّل');
          assert.equal((await db.branch.findUniqueOrThrow({where:{id:setupBranch.branch.id}})).pricingVersion,1);
          assert.deepEqual([await db.pointTransaction.count(),await db.moneyTransaction.count()],setupLedgerBefore);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'unified branch review must fit mobile');
          await page.getByRole('button',{name:'الدعم والمساعدة',exact:true}).click();
          await expect(page.getByRole('heading',{name:'مركز الدعم والشكاوى'})).toBeVisible();
          await page.getByRole('button',{name:'طلب مساعدة جديد',exact:true}).click();
          await page.getByLabel('عنوان مختصر').fill('Synthetic browser support');
          await page.getByLabel('اشرح المشكلة').fill('Synthetic support message from mobile viewport');
          await page.getByRole('button',{name:'إرسال الطلب',exact:true}).click();
          await expect(page.getByRole('dialog')).toContainText('Synthetic support message from mobile viewport');
          await page.getByRole('button',{name:'إغلاق',exact:true}).click();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'mobile support layout must fit viewport');
          assert.deepEqual(pageErrors,[]);
          await context.close();
          // Real trainee ledger rows reproduce the narrow-column UUID regression.
          const traineeContext=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
          const traineeSeparator=traineeCookie.indexOf('=');
          await traineeContext.addCookies([{name:traineeCookie.slice(0,traineeSeparator),value:traineeCookie.slice(traineeSeparator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
          const traineePage=await traineeContext.newPage();
          await traineePage.goto(origin);
          await traineePage.getByRole('button',{name:'زياراتي',exact:true}).click();
          await expect(traineePage.getByRole('heading',{name:'حركات نقاطك'})).toBeVisible();
          const records=traineePage.locator('.mobile-records tbody tr');
          await expect(records.first()).toBeVisible();
          for(const width of [320,393,700]) {
            await traineePage.setViewportSize({width,height:851});
            const bounds=await records.first().boundingBox();
            assert.ok(bounds.width>width*0.65,'ledger card must use the available width');
            assert.ok(bounds.height<650,'closed references must not inflate ledger rows');
            assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'ledger must fit mobile viewport');
            assert.equal(await records.first().locator('td').first().evaluate(el=>getComputedStyle(el).display),'block');
          }
          const ref=records.first().locator('.record-reference').first();
          await ref.locator('summary').click();
          await expect(ref.locator('.record-reference-body code')).toHaveText(/^[a-f0-9-]{36}$/);
          assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'expanded UUID must not overflow');
          await traineePage.setViewportSize({width:1280,height:900});
          assert.equal(await records.first().locator('td').first().evaluate(el=>getComputedStyle(el).display),'table-cell');
          await traineeContext.close();
        } finally {await browser.close();}
      }
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
