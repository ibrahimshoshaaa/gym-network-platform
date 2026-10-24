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
        address: 'شارع اختبار الإعلان', governorate: 'المنوفية', city: 'شبين الكوم',
        latitude: 30, longitude: 31, pricingVersion: 1, priceApprovedAt: new Date(),
        visitPricePoints: 20,
        sessionMinutes: 120,
      },
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
          WORKFLOW_LOCAL_BASE_URL: origin,
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
          gymDiscountBps: 0,
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
      // Use the actual web/mobile bridges rather than a mocked endpoint reply.
      const branchMetadata = await request(`/api/backend/branches/${branch.id}/manage`, {cookie: ownerCookie});
      assert.equal(branchMetadata.status, 200);
      assert.equal((await branchMetadata.json()).id, branch.id);
      const ownerNativeLogin = await request('/api/mobile/auth/signin', {
        method: 'POST', body: {identifier: owner.email, password},
      });
      assert.equal(ownerNativeLogin.status, 200);
      const ownerNativeToken = (await ownerNativeLogin.json()).accessToken;
      const ownerNativeHeaders = {authorization: 'Bearer ' + ownerNativeToken};
      const nativeBranchMetadata = await request(`/api/mobile/branches/${branch.id}/manage`, {headers: ownerNativeHeaders});
      assert.equal(nativeBranchMetadata.status, 200);
      assert.equal((await nativeBranchMetadata.json()).name, branch.name);
      assert.equal((await request(`/api/mobile/branches/${branch.id}/manage`)).status, 401);
      assert.equal((await request(`/api/backend/branches/${randomUUID()}/manage`, {cookie: ownerCookie})).status, 403);
      assert.equal((await request(`/api/mobile/branches/${randomUUID()}/manage`, {headers: ownerNativeHeaders})).status, 403);
      // Native branch ad -> admin quote -> owner consent -> location-filtered trainee feed.
      const adCreate = await request('/api/mobile/promotions/requests',{method:'POST',headers:ownerNativeHeaders,body:{branchId:branch.id,clientKey:randomUUID(),title:'عرض الفرع التجريبي',body:'تفاصيل عرض الفرع لاختبار دورة الموافقة',imageId:null}});
      assert.equal(adCreate.status,200,await adCreate.clone().text());
      let ad = await adCreate.json();
      assert.equal((await request('/api/backend/admin/promotions/requests',{cookie:ownerCookie})).status,403);
      assert.equal((await request('/api/mobile/promotions/requests')).status,401);
      const adQuote = await request('/api/backend/admin/promotions/requests/'+ad.id+'/review',{method:'POST',cookie,body:{action:'QUOTE',expectedVersion:ad.version,reason:'اعتماد عرض الفرع التجريبي',feePiasters:'125050',startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),radiusKm:20}});
      assert.equal(adQuote.status,200,await adQuote.clone().text());ad=await adQuote.json();assert.equal(ad.status,'AWAITING_ACCEPTANCE');
      const adAccept=await request('/api/mobile/promotions/requests/'+ad.id+'/action',{method:'POST',headers:ownerNativeHeaders,body:{action:'ACCEPT',expectedVersion:ad.version}});
      assert.equal(adAccept.status,200,await adAccept.clone().text());ad=await adAccept.json();assert.equal(ad.status,'APPROVED');
      // Real native create -> admin web review -> shared marketplace browse.
      const marketImage = await db.marketImage.create({data: {
        ownerId: owner.id, objectKey: 'synthetic-market/' + randomUUID(),
        assetId: randomUUID(), publicUrl: 'https://res.cloudinary.com/test/image/upload/synthetic.jpg',
      }});
      const marketCreate = await request('/api/mobile/market/listings', {
        method: 'POST', headers: ownerNativeHeaders, body: {
          title: 'جهاز اختبار الماركت', description: 'إعلان تجريبي لاختبار المسارات والصلاحيات',
          category: 'EQUIPMENT', condition: 'USED', pricePiasters: '125050',
          governorate: 'المنوفية', city: 'شبين الكوم', contactPhone: '+201012345678',
          imageIds: [marketImage.id], clientKey: randomUUID(),
        },
      });
      assert.equal(marketCreate.status, 200);
      const marketListing = await marketCreate.json();
      assert.equal(marketListing.status, 'PENDING');
      assert.equal((await request('/api/mobile/market/listings')).status, 401);
      assert.equal((await request('/api/backend/admin/market/listings', {cookie: ownerCookie})).status, 403);
      const marketReview = await request('/api/backend/admin/market/listings/' + marketListing.id + '/review', {
        method: 'POST', cookie, body: {expectedVersion: marketListing.version, status: 'APPROVED', reason: 'Synthetic approval'},
      });
      assert.equal(marketReview.status, 200);
      const marketBrowse = await request('/api/mobile/market/listings?q=' + encodeURIComponent('جهاز اختبار الماركت'), {headers: ownerNativeHeaders});
      assert.equal(marketBrowse.status, 200);
      assert.ok((await marketBrowse.json()).items.some(row => row.id === marketListing.id && row.pricePiasters === '125050'));
      const marketDetail = await request('/api/backend/market/listings/' + marketListing.id, {cookie: ownerCookie});
      assert.equal(marketDetail.status, 200);
      assert.equal((await marketDetail.json()).contactPhone, '+201012345678');
      const repairCreated = await request('/api/mobile/maintenance/requests', {
        method: 'POST', headers: ownerNativeHeaders, body: {
          branchId: branch.id, clientKey: randomUUID(), equipment: 'جهاز جري تجريبي',
          description: '修'.repeat(3000), contactPhone: '+201012345678', imageIds: [],
        },
      });
      assert.equal(repairCreated.status, 200);
      let repairRow = await repairCreated.json();
      const repairAction = async (action, data = {}, admin = true) => {
        const response = await request((admin ? '/api/backend/admin' : '/api/mobile') + '/maintenance/requests/' + repairRow.id + '/action', {
          method: 'POST', ...(admin ? {cookie} : {headers: ownerNativeHeaders}),
          body: {action, expectedVersion: repairRow.version, ...data},
        });
        assert.equal(response.status, 200, await response.clone().text());
        repairRow = await response.json();
      };
      assert.equal((await request('/api/mobile/maintenance/requests')).status, 401);
      assert.equal((await request('/api/backend/admin/maintenance/requests', {cookie: ownerCookie})).status, 403);
      await repairAction('QUOTE', {note: 'فحص السير وإصلاح العطل', estimatedPiasters: '125050', technicianName: 'فني اختبار الصيانة', technicianPhone: '+201012345678', appointmentAt: new Date(Date.now()+86400000).toISOString()});
      assert.equal(repairRow.status, 'AWAITING_APPROVAL');
      await repairAction('APPROVE', {}, false);
      assert.equal(repairRow.status, 'SCHEDULED');
      await repairAction('START', {note: 'بدء أعمال الاختبار'});
      await repairAction('FINISH', {note: 'انتهاء أعمال الاختبار', finalPiasters: '120000', workSummary: 'تم إصلاح السير وإعادة اختبار الجهاز'});
      assert.equal(repairRow.status, 'AWAITING_CONFIRMATION');
      await repairAction('CONFIRM', {}, false);
      assert.equal(repairRow.status, 'COMPLETED');
      const repairDetail = await request('/api/mobile/maintenance/requests/' + repairRow.id, {headers: ownerNativeHeaders});
      assert.equal(repairDetail.status, 200);
      assert.equal((await repairDetail.json()).events.length, 6);



      assert.equal(
        (
          await request("/api/backend/admin/topup-settings", {
            cookie: ownerCookie,
          })
        ).status,
        403,
      );
      const earlyRegistration=await request('/api/register',{method:'POST',body:{displayName:'Synthetic early trainee',email:`early-${id}@example.test`,phone:'+2010'+String(BigInt('0x'+id.replaceAll('-','').slice(0,12))%100000000n).padStart(8,'0'),password}});
      assert.equal(earlyRegistration.status,201);const earlyIdentity=await earlyRegistration.clone().json(),earlyCookie=sessionCookie(earlyRegistration);
      const earlyWallet=await db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:earlyIdentity.user.id}}});
      const optionsResponse = await request(
        "/api/backend/topup-options?kind=TRAINEE",
        { cookie: earlyCookie },
      );
      assert.equal(optionsResponse.status, 200);
      const options = await optionsResponse.json(),
        selection = {
          kind: "TRAINEE",
          points: 100,
        };
      const quoteResponse = await request("/api/backend/topup-quotes", {
        cookie: earlyCookie,
        method: "POST",
        body: selection,
      });
      assert.equal(quoteResponse.status, 200);
      const quote = await quoteResponse.json();
      assert.equal(quote.chargePiasters, "12500");
      const badImage = await fetch(origin + "/api/backend/receipts", {
        method: "POST",
        headers: { cookie: earlyCookie, origin, "content-type": "image/jpeg" },
        body: "invalid image",
      });
      assert.equal(badImage.status, 400);
      // Synthetic pre-existing evidence: provider upload is covered separately with
      // injected storage in API tests; no real Cloudinary account is touched here.
      const receipt = await db.receiptEvidence.create({
        data: {
          ownerUserId: earlyIdentity.user.id,
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
          cookie: earlyCookie,
          method: "POST",
          headers: { "idempotency-key": key },
          body,
        });
      const created = await create();
      assert.equal(created.status, 201);
      const pending = await created.json();
      assert.equal((await (await create()).json()).id, pending.id);
      assert.equal(
        (await db.pointAccount.findUniqueOrThrow({ where: { id: earlyWallet.id } }))
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
      assert.equal(listed.requestor.displayName, earlyIdentity.user.displayName);
      assert.equal(listed.branch, null);
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
        (await db.pointAccount.findUniqueOrThrow({ where: { id: earlyWallet.id } }))
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
      const localAds=await request('/api/backend/trainee/nearby-promotions?latitude=30&longitude=31',{cookie:traineeCookie});
      assert.equal(localAds.status,200,await localAds.clone().text());assert.ok((await localAds.json()).items.some(r=>r.id===ad.id));
      const noLocationAds=await request('/api/backend/trainee/nearby-promotions',{cookie:traineeCookie});assert.equal(noLocationAds.status,200);assert.equal((await noLocationAds.json()).items.length,0);

      assert.equal((await request('/api/backend/topup-options?kind=BRANCH_STOCK',{cookie:invitedOwnerCookie})).status,403);
      const directQuoteResponse=await request('/api/backend/admin/point-transfers/quotes',{cookie,method:'POST',body:{recipientId:traineeIdentity.user.id,points:60}});
      assert.equal(directQuoteResponse.status,200);const directQuote=await directQuoteResponse.json();
      const directResponse=await request('/api/backend/admin/point-transfers',{cookie,method:'POST',headers:{'idempotency-key':randomUUID()},body:{recipientId:directQuote.recipientId,recipientLabel:directQuote.recipientLabel,points:60,pricingVersion:directQuote.pricingVersion,receivedAmountPiasters:directQuote.chargePiasters,fundsReceived:true,recipientConfirmed:true,paymentMethod:'CASH'}});
      assert.equal(directResponse.status,201);const sold=await directResponse.json();
      for(const endpoint of ['trainee-lookup','sale-quotes','sales'])assert.equal((await request(`/api/backend/cashier/branches/${newBranch.branch.id}/${endpoint}`,{cookie:cashierCookie,method:'POST',headers:{'idempotency-key':randomUUID()},body:{phone:traineeBody.phone,traineeId:traineeIdentity.user.id,points:60}})).status,403);
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
      const prematureRating=await request('/api/backend/trainee/visits/'+entered.visit.id+'/rating',{method:'POST',cookie:traineeCookie,body:{score:5,expectedVersion:0}});
      assert.equal(prematureRating.status,409); // A visit still in progress cannot be rated.

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
      assert.equal(managerBranch.canOperate, true);
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
      // New point sales belong to the platform; archived branch-sale correction is covered by historical DB fixtures.
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
      const adminSummaryResponse = await request("/api/backend/home-summary", {cookie});
      assert.equal(adminSummaryResponse.status, 200);
      const adminSummary = await adminSummaryResponse.json();
      assert.equal(
        adminSummary.cards.find(card=>card.label==="تحويلات تنتظر التنفيذ")?.value,
        String(await db.withdrawalRequest.count({where:{status:"APPROVED"}})),
      );
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
      assert.equal(report.sales.points, "0");
      assert.equal(report.sales.amountPiasters, "0");
      assert.equal(report.visits.count, "3");
      assert.equal(report.visits.amountPiasters, "9000");
      assert.equal(report.cancellations.count, "2");
      assert.equal(report.netVisitReceivablesPiasters, "3000");
      assert.equal(report.paidWithdrawals.amountPiasters, "1000");
      assert.equal(report.alerts.withdrawals.disputed, "1");
      assert.equal(report.currentStockPoints, "0");
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
      assert.doesNotMatch(csvText, /"60","7500"/);
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
      const stockPath=`/api/backend/gyms/${newGym.gym.id}/stock-transfers`;
      for(const currentCookie of [invitedOwnerCookie,cashierCookie,managerCookie,ownerCookie,cookie])assert.equal((await request(stockPath,{cookie:currentCookie,method:'POST',headers:{'idempotency-key':randomUUID()},body:{fromBranchId:newBranch.branch.id,toBranchId:receivingBranch.branch.id,points:20}})).status,404);
      assert.equal((await request(`/api/backend/inventory/branches/${newBranch.branch.id}`,{cookie:invitedOwnerCookie})).status,404);
      const conserved = await (
        await request(`/api/backend/reports/summary?${reportQuery}`, {
          cookie: invitedOwnerCookie,
        })
      ).json();
      assert.equal(conserved.currentStockPoints, "0");
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
        pointHistory.items.filter((m) => m.operation === "TOPUP").length,
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
      const onlyTopups = await (
        await request(
          "/api/backend/trainee/wallet/movements?operation=TOPUP&limit=1",
          { cookie: traineeCookie },
        )
      ).json();
      assert.equal(onlyTopups.items.length, 1);
      assert.equal(onlyTopups.items[0].delta, 60);
      assert.equal(onlyTopups.items[0].referenceId, sold.id);
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
      // Web registration shares owner review and never issues gym stock on sign-up.
      const webOwner=await request('/api/register',{method:'POST',body:{accountType:'owner',displayName:'Synthetic Web Applicant',email:`web-applicant-${id}@example.test`,phone:'01500000010',password,gymName:'Synthetic Web Gym',description:'',governorate:'Menofia',city:'Synthetic City',address:'Synthetic web application address'}});
      assert.equal(webOwner.status,201);const webOwnerUser=(await webOwner.json()).user;assert.equal(webOwnerUser.role,'GYM_OWNER');
      const webOwnerCookie=sessionCookie(webOwner);
      const webApplication=await request('/api/backend/me/gym-application',{cookie:webOwnerCookie});assert.equal(webApplication.status,200);assert.equal((await webApplication.json()).application.status,'PENDING');
      assert.equal(await db.gym.count({where:{ownerId:webOwnerUser.id}}),0);
      const ephemeral=await request('/api/session',{method:'POST',body:{identifier:webOwnerUser.email,password,remember:false}});assert.equal(ephemeral.status,200);
      const ephemeralHeader=ephemeral.headers.getSetCookie().find(value=>value.startsWith('__Host-gym_session='));assert.ok(ephemeralHeader);assert.equal(/expires=|max-age=/i.test(ephemeralHeader),false);assert.match(ephemeralHeader,/HttpOnly/i);
      const persistent=await request('/api/session',{method:'POST',body:{identifier:webOwnerUser.email,password,remember:true}});assert.equal(persistent.status,200);assert.match(persistent.headers.getSetCookie().find(value=>value.startsWith('__Host-gym_session=')),/expires=/i);
      assert.equal((await request('/api/session',{method:'POST',body:{identifier:webOwnerUser.email,password,remember:'false'}})).status,400);
      // Native bridge is Bearer-only and self-registered owners remain unprivileged until review.
      assert.equal((await request('/api/mobile/me',{cookie})).status,401);
      const nativeOwnerBody={displayName:'Synthetic Native Owner',email:`native-owner-${id}@example.test`,phone:'01500000008',password,gymName:'Synthetic Native Application',description:'Synthetic mobile application',governorate:'Menofia',city:'Synthetic City',address:'Synthetic application address'};
      const nativeRegister=await request('/api/mobile/auth/owners/register',{method:'POST',body:nativeOwnerBody});
      assert.equal(nativeRegister.status,201,await nativeRegister.clone().text());
      const nativeOwner=await nativeRegister.json();
      assert.equal(nativeOwner.user.role,'GYM_OWNER');assert.equal(nativeOwner.user.phoneVerified,false);
      const nativeHeaders={authorization:'Bearer '+nativeOwner.accessToken};
      assert.equal((await request('/api/mobile/me',{headers:nativeHeaders})).status,200);
      const nativeGyms=await request('/api/mobile/gyms',{headers:nativeHeaders});assert.deepEqual((await nativeGyms.json()).items,[]);
      assert.equal((await request('/api/mobile/admin/gym-applications',{headers:nativeHeaders})).status,404);
      assert.equal((await request('/api/mobile/me/gym-application/resubmit',{headers:nativeHeaders,method:'POST',crossOrigin:true,body:{}})).status,403);
      const nativeLogin=await request('/api/mobile/auth/signin',{method:'POST',body:{identifier:nativeOwnerBody.email,password}});assert.equal(nativeLogin.status,200);
      const nativeTrainee=await request('/api/mobile/auth/register',{method:'POST',body:{displayName:'Synthetic Native Trainee',email:`native-trainee-${id}@example.test`,phone:'01500000009',password}});assert.equal(nativeTrainee.status,201);assert.equal((await nativeTrainee.json()).user.role,'TRAINEE');
      if(process.env.GYM_BROWSER_TEST!=='1'){
        const reviewed=await request(`/api/backend/admin/gym-applications/${nativeOwner.application.id}/review`,{cookie,method:'POST',body:{decision:'APPROVED',expectedVersion:1,reason:'Synthetic mobile HTTP applicant approved'}});assert.equal(reviewed.status,200);
      }
      // Permanent deletion traverses the external page and the Bearer-only native bridge.
      const deletionUser=await db.user.create({data:{displayName:'Synthetic HTTP Deletion',phoneE164:'+20delete'+randomUUID(),email:`delete-http-${id}@example.test`,role:'TRAINEE',password:{create:{passwordHash}}}});
      const deletionLogin=await request('/api/mobile/auth/signin',{method:'POST',body:{identifier:deletionUser.email,password}});
      assert.equal(deletionLogin.status,200);const deletionToken=(await deletionLogin.json()).accessToken;
      assert.equal((await request('/api/mobile/me/account-deletion',{headers:{authorization:'Bearer '+deletionToken}})).status,200);
      assert.equal((await request('/api/mobile/admin/account-deletions',{headers:{authorization:'Bearer '+deletionToken}})).status,404);
      const deletionKey=randomUUID(),deletionBody={identifier:deletionUser.email,password,confirmation:'DELETE',requestKey:deletionKey};
      assert.equal((await request('/api/account-deletion/request',{method:'POST',crossOrigin:true,body:deletionBody})).status,403);
      const deleted=await request('/api/account-deletion/request',{method:'POST',body:deletionBody});
      assert.equal(deleted.status,200,await deleted.clone().text());assert.equal((await deleted.json()).request.status,'COMPLETED');
      assert.equal((await request('/api/mobile/me',{headers:{authorization:'Bearer '+deletionToken}})).status,401);
      const deletionStatus=await request('/api/mobile/auth/account-deletion/status',{method:'POST',body:{requestKey:deletionKey}});
      assert.equal(deletionStatus.status,200);const deletionReceipt=await deletionStatus.json();assert.equal(deletionReceipt.request.status,'COMPLETED');assert.ok(!JSON.stringify(deletionReceipt).includes(deletionUser.id));
      const nativeDeletionUser=await db.user.create({data:{displayName:'Synthetic Native Deletion',phoneE164:'+20delete'+randomUUID(),email:`delete-native-${id}@example.test`,role:'TRAINEE',password:{create:{passwordHash}}}});
      const nativeDeletionLogin=await request('/api/mobile/auth/signin',{method:'POST',body:{identifier:nativeDeletionUser.email,password}});assert.equal(nativeDeletionLogin.status,200);
      const nativeDeletionToken=(await nativeDeletionLogin.json()).accessToken;
      const nativeDeleted=await request('/api/mobile/me/account-deletion',{method:'POST',headers:{authorization:'Bearer '+nativeDeletionToken},body:{currentPassword:password,confirmation:'DELETE',requestKey:randomUUID()}});
      assert.equal(nativeDeleted.status,200,await nativeDeleted.clone().text());assert.equal((await nativeDeleted.json()).request.status,'COMPLETED');
      // Real mobile viewport check uses only synthetic local identities.
      if(process.env.GYM_BROWSER_TEST === '1') {
        const {chromium,expect}=await import('@playwright/test');
        const browser=await chromium.launch({headless:true});
        try {
          const publicContext=await browser.newContext({ignoreHTTPSErrors:true});
          const publicPage=await publicContext.newPage();
          await publicPage.goto(origin);
          await expect(publicPage.getByRole('heading',{name:'أهلًا بيك من جديد',exact:true})).toBeVisible();
          await publicPage.evaluate(()=>document.fonts.ready);
          for(const width of [320,768,1440]) {
            await publicPage.setViewportSize({width,height:1000});
            await expect(publicPage.getByRole('button',{name:'تسجيل الدخول',exact:true})).toBeVisible();
            assert.equal(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'login must fit every viewport');
          }
          await publicPage.setViewportSize({width:320,height:900});
          await publicPage.getByRole('button',{name:'English',exact:true}).click();
          await expect(publicPage.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
          await publicPage.getByLabel('Mobile number',{exact:true}).fill(webOwnerUser.phone);
          await expect(publicPage.getByRole('button',{name:/Google|Apple/})).toHaveCount(0);
          await expect(publicPage.getByLabel('Mobile number',{exact:true})).toHaveValue(webOwnerUser.phone);

          await publicPage.getByRole('button',{name:'Sign up',exact:true}).click();
          await publicPage.getByRole('button',{name:/Gym owner/}).click();
          await expect(publicPage.getByLabel('Gym name',{exact:true})).toBeVisible();
          assert.equal(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true);
          await publicPage.reload();await expect(publicPage.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
          await publicPage.getByLabel('Mobile number',{exact:true}).fill(webOwnerUser.phone);
          await publicPage.getByLabel('Password',{exact:true}).fill(password);
          await expect(publicPage.getByRole('checkbox',{name:'Remember me'})).not.toBeChecked();
          await publicPage.getByRole('button',{name:'Log in',exact:true}).last().click();
          await expect(publicPage.getByRole('heading',{name:'طلب انضمامك',exact:true})).toBeVisible();
          await publicContext.close();
          const context=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
          const separator=cookie.indexOf('=');
          await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
          const page=await context.newPage();
          const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
          await page.goto(origin);
          await expect(page.getByRole('heading',{name:'يومك في المنصة',exact:true})).toBeVisible();
          await expect(page.getByRole('heading',{name:'محتاج تدخلك',exact:true})).toBeVisible();
          await expect(page.locator('.platform-finance')).toHaveCount(0);
          await expect(page.getByRole('navigation',{name:'وصول سريع'}).getByRole('button')).toHaveCount(5);
          for(const width of [320,393,800,1280]){
            await page.setViewportSize({width,height:851});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'admin home must fit phone and desktop');
          }
          await page.setViewportSize({width:393,height:851});
          await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
          await expect(page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true})).toHaveAttribute('aria-expanded','false');
          await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true}).click();
          await expect(page.getByRole('button',{name:'الطلبات',exact:true}).first()).toHaveAttribute('aria-expanded','true');
          await expect(page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'طلبات الشحن',exact:true})).toBeVisible();
          await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true}).click();
          await expect(page.getByRole('group',{name:'قائمة الطلبات',exact:true})).toBeHidden();
          await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true}).click();
          await page.getByRole('group',{name:'قائمة الطلبات',exact:true}).getByRole('button',{name:'طلبات الانضمام',exact:true}).click();
          const applicationCard=page.locator('article.card').filter({has:page.getByRole('heading',{name:'Synthetic Native Application',exact:true})});
          await expect(applicationCard).toContainText('Synthetic Native Owner');
          await applicationCard.getByRole('button',{name:'قبول الانضمام',exact:true}).click();
          await page.getByRole('button',{name:'تأكيد القرار',exact:true}).click();
          await expect(page.getByRole('dialog')).toHaveCount(0);
          const approvedNative=(await (await request('/api/mobile/me/gym-application',{headers:nativeHeaders})).json()).application;
          assert.equal(approvedNative.status,'APPROVED');assert.ok(approvedNative.gymId);
          assert.equal((await db.gym.findUniqueOrThrow({where:{id:approvedNative.gymId}})).ownerId,nativeOwner.user.id);
          // Verify the actual admin maintenance screen, its narrow layout and quote form.
          await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
          if(await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الطلبات',exact:true}).click();
          await page.getByRole('group',{name:'قائمة الطلبات',exact:true}).getByRole('button',{name:'الصيانة',exact:true}).click();
          await expect(page.getByRole('heading',{name:'الصيانة',exact:true})).toBeVisible();
          await page.getByLabel('حالة الطلب',{exact:true}).selectOption('COMPLETED');
          await page.locator('article.card').filter({has:page.getByRole('heading',{name:'جهاز جري تجريبي',exact:true})}).getByRole('button',{name:'تفاصيل الطلب ومتابعته',exact:true}).click();
          await expect(page.getByRole('dialog')).toContainText('تم إصلاح السير وإعادة اختبار الجهاز');
          for(const width of [320,393,1280]){
            await page.setViewportSize({width,height:851});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'maintenance details must fit phone and desktop');
          }
          await page.getByRole('button',{name:'إغلاق',exact:true}).click();
          const browserRepair = await request('/api/mobile/maintenance/requests',{method:'POST',headers:ownerNativeHeaders,body:{branchId:branch.id,clientKey:randomUUID(),equipment:'إصلاح واجهة الاختبار',description:'عطل تجريبي لاختبار نموذج الإدارة',contactPhone:'+201012345678',imageIds:[]}});
          assert.equal(browserRepair.status,200);
          const browserRepairId=(await browserRepair.json()).id;
          await page.getByLabel('حالة الطلب',{exact:true}).selectOption('NEW');
          await page.locator('article.card').filter({has:page.getByRole('heading',{name:'إصلاح واجهة الاختبار',exact:true})}).getByRole('button',{name:'تفاصيل الطلب ومتابعته',exact:true}).click();
          await page.getByRole('button',{name:'إرسال عرض وموعد',exact:true}).click();
          await page.getByLabel('التكلفة المتوقعة بالجنيه',{exact:true}).fill('1250.50');
          await page.getByLabel('اسم مسؤول الصيانة',{exact:true}).fill('مسؤول اختبار الواجهة');
          await page.getByLabel('رقم مسؤول الصيانة',{exact:true}).fill('01012345678');
          await page.getByLabel('موعد الزيارة',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
          await page.getByLabel('سبب التحديث / ملاحظات للجيم',{exact:true}).fill('إصلاح الجهاز بعد مراجعة العطل');
          await page.getByRole('button',{name:'حفظ وإرسال التحديث',exact:true}).click();
          await expect(page.getByRole('dialog')).toContainText('بانتظار اعتماد التكلفة');
          const browserQuote=await db.maintenanceRequest.findUniqueOrThrow({where:{id:browserRepairId}});
          assert.equal(browserQuote.estimatedPiasters,125050n);assert.equal(browserQuote.technicianPhone,'+201012345678');
          await page.getByRole('button',{name:'إغلاق',exact:true}).click();
          await page.setViewportSize({width:393,height:851});

          await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
          if(await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'المالية',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'المالية',exact:true}).click();
          await page.getByRole('group',{name:'قائمة المالية',exact:true}).getByRole('button',{name:'نظرة عامة',exact:true}).click();

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
          await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'الجيمات',exact:true}).click();
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
          // Only the admin can charge points; owners see visit entitlements instead.
          const walletBeforeDispatch=(await db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:traineeIdentity.user.id}}})).balance;
          await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
          if(await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'المالية',exact:true}).getAttribute('aria-expanded')!=='true')await page.getByRole('navigation',{name:'القائمة الرئيسية'}).getByRole('button',{name:'المالية',exact:true}).click();
          await page.getByRole('group',{name:'قائمة المالية',exact:true}).getByRole('button',{name:'نظرة عامة',exact:true}).click();
          await page.getByRole('navigation',{name:'أقسام المالية'}).getByRole('button',{name:'شحن مباشر بالرقم',exact:true}).click();
          await page.getByLabel('رقم موبايل المتدرب').fill(traineeBody.phone);
          await page.getByRole('button',{name:'متابعة',exact:true}).click();
          await expect(page.locator('.transfer-recipient')).toContainText(traineeBody.displayName);
          await page.getByLabel('عدد النقاط',{exact:true}).fill('١٠');
          await page.getByRole('button',{name:'مراجعة الإرسال',exact:true}).click();
          await expect(page.getByText('رصيد المستلم بعد العملية',{exact:true})).toBeVisible();
          await page.getByRole('checkbox',{name:'تأكدت من اسم المستلم واستلمت المبلغ كاملًا',exact:true}).check();
          await page.getByRole('button',{name:'تأكيد الشحن',exact:true}).click();
          await expect(page.getByRole('heading',{name:'تم شحن النقاط',exact:true})).toBeVisible();
          assert.equal((await db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:traineeIdentity.user.id}}})).balance,walletBeforeDispatch+10);
          for(const width of [320,393]){await page.setViewportSize({width,height:851});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'direct topup receipt must fit mobile');}
          await page.setViewportSize({width:393,height:851});
          const ownerPointQuote=await request('/api/backend/admin/point-transfers/quotes',{cookie,method:'POST',body:{recipientId:newGym.owner.id,gymId:newGym.gym.id,points:30}});
          assert.equal(ownerPointQuote.status,403);
          const ownerContext=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
          const ownerSeparator=invitedOwnerCookie.indexOf('=');
          await ownerContext.addCookies([{name:invitedOwnerCookie.slice(0,ownerSeparator),value:invitedOwnerCookie.slice(ownerSeparator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
          const ownerPage=await ownerContext.newPage();await ownerPage.goto(origin);
          await expect(ownerPage.locator('.wallet-signature .wallet-balance')).toBeVisible();
          const ownerWalletBounds=await ownerPage.locator('.wallet-signature').boundingBox();
          assert.ok(ownerWalletBounds.height<320,'owner stock card must keep the Flutter spacing');
          await expect(ownerPage.locator('.portal-app-header>img')).toHaveAttribute('src','/brand/gymbank-wordmark.png');
          await expect(ownerPage.getByRole('button',{name:'بيع نقاط لمتدرب',exact:true})).toHaveCount(0);
          await expect(ownerPage.getByRole('button',{name:'شراء نقاط لرصيد الجيم',exact:true})).toHaveCount(0);
          await expect(ownerPage.getByRole('button',{name:/مستحقاتي والسحب/})).toBeVisible();
          assert.equal((await db.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:traineeIdentity.user.id}}})).balance,walletBeforeDispatch+10);
          assert.equal(await db.pointAccount.count({where:{type:'GYM_INVENTORY',gymId:newGym.gym.id}}),0);
          assert.equal(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'gym entitlements must fit mobile');
          await ownerContext.close();
          const incomingSupport=await request('/api/backend/support/tickets',{cookie:traineeCookie,method:'POST',body:{subject:'Synthetic browser support',category:'HELP',body:'Synthetic support message from mobile viewport',clientKey:randomUUID()}});
          assert.equal(incomingSupport.status,200);
          assert.equal((await request('/api/backend/support/tickets',{cookie,method:'POST',body:{subject:'Admin cannot ask itself',category:'HELP',body:'Synthetic admin self ticket rejected',clientKey:randomUUID()}})).status,403);
          await page.getByRole('button',{name:'طلبات الدعم الواردة',exact:true}).click();
          await expect(page.getByRole('heading',{name:'مركز الدعم والشكاوى'})).toBeVisible();
          await expect(page.getByRole('navigation',{name:'وصول سريع'}).getByRole('button',{name:'المزيد',exact:true})).toHaveAttribute('aria-current','page');
          await expect(page.getByRole('button',{name:'طلب مساعدة جديد',exact:true})).toHaveCount(0);
          await expect(page.getByRole('link',{name:'تواصل واتساب',exact:true})).toHaveCount(0);
          const incomingCard=page.locator('article.card').filter({has:page.getByRole('heading',{name:'Synthetic browser support',exact:true})});
          await incomingCard.getByRole('button',{name:'الرسائل وتفاصيل الطلب',exact:true}).click();
          await expect(page.getByRole('dialog')).toContainText('Synthetic support message from mobile viewport');
          await page.getByLabel('ردك',{exact:true}).fill('Synthetic admin reply to trainee');
          await page.getByRole('button',{name:'إرسال الرد',exact:true}).click();
          await expect(page.getByRole('dialog')).toContainText('Synthetic admin reply to trainee');
          await page.getByRole('button',{name:'إغلاق',exact:true}).click();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'mobile support layout must fit viewport');
          assert.deepEqual(pageErrors,[]);
          await context.close();
          // Restore the synthetic cashier after the earlier revocation assertion, only for UI checks.
          assert.equal((await request(`/api/backend/gyms/${newGym.gym.id}/staff/${membership.id}`,{cookie:invitedOwnerCookie,method:'PATCH',body:{active:true}})).status,200);
          // Both staff roles use the same branch workspace and four tabs as Flutter.
          for(const staffCookie of [cashierCookie,managerCookie]){
            const staffContext=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
            const separator=staffCookie.indexOf('=');
            await staffContext.addCookies([{name:staffCookie.slice(0,separator),value:staffCookie.slice(separator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
            const staffPage=await staffContext.newPage();await staffPage.goto(origin);
            await expect(staffPage.getByRole('heading',{name:'تشغيل الزيارات',exact:true})).toBeVisible();
            await expect(staffPage.getByRole('navigation',{name:'قائمة موظف الفرع'}).getByRole('button')).toHaveCount(4);
            for(const width of [320,393,700,1280]){
              await staffPage.setViewportSize({width,height:851});
              assert.equal(await staffPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,'staff workspace must fit each viewport');
            }
            await staffPage.getByRole('navigation',{name:'قائمة موظف الفرع'}).getByRole('button',{name:'الزيارات',exact:true}).click();
            await expect(staffPage.getByRole('heading',{name:'الزيارات المسجلة',exact:true})).toBeVisible();
            await expect(staffPage.getByRole('heading',{name:'مبيعات النقاط',exact:true})).toHaveCount(0);
            await staffPage.getByRole('navigation',{name:'قائمة موظف الفرع'}).getByRole('button',{name:'التشغيل',exact:true}).click();
            await expect(staffPage.getByText('زيارة بدون حجز مسبق',{exact:true})).toBeVisible();
            await staffContext.close();
          }
          assert.equal((await request(`/api/backend/gyms/${newGym.gym.id}/staff/${membership.id}`,{cookie:invitedOwnerCookie,method:'PATCH',body:{active:false}})).status,200);
          // Real trainee ledger rows reproduce the narrow-column UUID regression.
          const traineeContext=await browser.newContext({viewport:{width:393,height:851},ignoreHTTPSErrors:true});
          const traineeSeparator=traineeCookie.indexOf('=');
          await traineeContext.addCookies([{name:traineeCookie.slice(0,traineeSeparator),value:traineeCookie.slice(traineeSeparator+1),domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
          const posterAsset=await db.campaignAsset.create({data:{objectKey:`synthetic-poster-${id}`,assetId:`synthetic-poster-${id}`,publicUrl:'https://res.cloudinary.com/gym-ci/image/upload/synthetic-poster.png',createdById:admin.id}});
          const campaignBody={title:'Synthetic targeted browser campaign',body:'Synthetic platform notice for one trainee',audience:'TRAINEES',channel:'BOTH',placement:'HOME',status:'PUBLISHED',destination:'QR',priority:100,userIds:[traineeIdentity.user.id],gymIds:[],startsAt:new Date(Date.now()-60000).toISOString(),endsAt:new Date(Date.now()+3600000).toISOString(),imageId:posterAsset.id,expectedVersion:0};
          const campaignResponse=await request('/api/backend/admin/campaigns',{cookie,method:'POST',body:campaignBody});
          assert.equal(campaignResponse.status,200,await campaignResponse.clone().text());const campaign=await campaignResponse.json();
          const excludedCampaigns=await request('/api/backend/campaigns?placement=HOME',{cookie:invitedOwnerCookie});assert.equal(excludedCampaigns.status,200);assert.ok(!(await excludedCampaigns.json()).items.some(c=>c.id===campaign.id));
          const traineePage=await traineeContext.newPage();
          await traineePage.goto(origin);
          const campaignCard=traineePage.locator('.campaign-banner').filter({has:traineePage.getByRole('button',{name:'فتح الإعلان',exact:true})});await expect(campaignCard).toBeVisible();
          assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'campaign must fit the personal mobile portal');
          await campaignCard.getByRole('button',{name:'فتح الإعلان',exact:true}).click();await expect(traineePage.getByRole('heading',{name:'رمز الدخول',exact:true})).toBeVisible();
          const campaignFeed=await request('/api/backend/notifications',{cookie:traineeCookie});assert.equal(campaignFeed.status,200);assert.ok((await campaignFeed.json()).items.some(c=>c.id===`campaign:${campaign.id}:1`));
          const posterBody={...campaignBody,title:'',body:'',imageId:posterAsset.id,destination:'NONE',channel:'AD',priority:99};
          const posterResponse=await request('/api/backend/admin/campaigns',{cookie,method:'POST',body:posterBody});assert.equal(posterResponse.status,200,await posterResponse.clone().text());const posterCampaign=await posterResponse.json();
          await traineePage.clock.install();
          await traineePage.getByRole('button',{name:'الرئيسية',exact:true}).click();
          await expect(traineePage.locator('.campaign-banner')).toHaveCount(1);
          await expect(traineePage.getByRole('button',{name:'عرض الإعلان 2',exact:true})).toBeVisible();
          await traineePage.clock.fastForward(4000);
          await expect(traineePage.locator('.campaign-poster-only')).toBeVisible();
          await expect(traineePage.locator('.campaign-banner img')).toHaveAttribute('src',posterAsset.publicUrl);
          await expect(traineePage.locator('.campaign-copy')).toHaveCount(0);
          await traineePage.getByRole('button',{name:'عرض الإعلان 1',exact:true}).click();await expect(campaignCard).toBeVisible();
          const pausePoster=await request(`/api/backend/admin/campaigns/${posterCampaign.id}`,{cookie,method:'PUT',body:{...posterBody,status:'PAUSED',expectedVersion:1}});assert.equal(pausePoster.status,200);
          const paused=await request(`/api/backend/admin/campaigns/${campaign.id}`,{cookie,method:'PUT',body:{...campaignBody,status:'PAUSED',expectedVersion:1}});assert.equal(paused.status,200);
          await traineePage.getByRole('button',{name:'الرئيسية',exact:true}).click();await expect(traineePage.locator('.campaign-banner').filter({has:traineePage.getByRole('button',{name:'فتح الإعلان',exact:true})})).toHaveCount(0);
          await expect(traineePage.locator('.wallet-signature .wallet-balance')).toBeVisible();
          for(const width of [320,393,700]){
            await traineePage.setViewportSize({width,height:851});
            const walletBounds=await traineePage.locator('.wallet-signature').boundingBox();
            assert.ok(walletBounds.height<280,'trainee balance card must match compact mobile hierarchy');
            const actions=traineePage.locator('.trainee-quick-actions button');
            const first=await actions.nth(0).boundingBox(),second=await actions.nth(1).boundingBox();
            assert.ok(Math.abs(first.y-second.y)<2,'QR and topup actions must share one row');
          }
          await traineePage.setViewportSize({width:393,height:851});
          await traineePage.getByRole('button',{name:'السجل كامل',exact:true}).click();
          await expect(traineePage.getByRole('heading',{name:'حركة نقاطك',exact:true})).toBeVisible();
          const records=traineePage.locator('.native-record-list .native-movement-card');
          await expect(records.first()).toBeVisible();
          for(const width of [320,393,700]) {
            await traineePage.setViewportSize({width,height:851});
            const bounds=await records.first().boundingBox();
            assert.ok(bounds.width>width*0.65,'ledger card must use the available width');
            assert.ok(bounds.height<650,'closed references must not inflate ledger rows');
            assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'ledger must fit mobile viewport');
            assert.equal(await records.first().evaluate(el=>el.tagName),'ARTICLE');
          }
          const ref=records.first().locator('.record-reference').first();
          await ref.locator('summary').click();
          await expect(ref.locator('.record-reference-body code')).toHaveText(/^[a-f0-9-]{36}$/);
          assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'expanded UUID must not overflow');
          await traineePage.setViewportSize({width:1280,height:900});
          assert.equal(await records.first().evaluate(el=>el.tagName),'ARTICLE');
          assert.equal(await traineePage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'desktop ledger cards must fit without horizontal overflow');
          const publicDeletionUser=await db.user.create({data:{displayName:'Synthetic Browser Deletion',phoneE164:'+20delete'+randomUUID(),email:`delete-browser-${id}@example.test`,role:'TRAINEE',password:{create:{passwordHash}}}});
          const deletionContext=await browser.newContext({viewport:{width:375,height:812}});
          const deletionPage=await deletionContext.newPage();await deletionPage.goto(origin+'/delete-account');
          await deletionPage.getByLabel('الموبايل أو الإيميل المسجل').fill(publicDeletionUser.email);
          await deletionPage.getByLabel('كلمة السر الحالية').fill(password);
          await deletionPage.getByLabel('اكتب DELETE لتأكيد الحذف النهائي').fill('DELETE');
          await deletionPage.getByRole('button',{name:'تأكيد طلب حذف الحساب',exact:true}).click();
          await expect(deletionPage.getByRole('status')).toContainText('تم حذف الحساب والصور غير المالية');
          assert.equal(await deletionPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),true,'public deletion page fits iPhone viewport');
          await deletionContext.close();
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




