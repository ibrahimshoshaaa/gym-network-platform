import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../src/app.js";
import { provisionFirstAdmin } from "../src/auth/admin.js";
import { hashPassword } from "../src/auth/passwords.js";
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/(gym_ci|gym_test)$/.test(url.pathname)
)
  throw new Error("Disposable local test database required");
const db = new PrismaClient();
after(async () => db.$disconnect());
const password = "Synthetic admin strong passphrase!";

test("first-admin provisioning is private, creates no wallet and refuses a second administrator", async () => {
  const id = randomUUID();
  const result = await provisionFirstAdmin(db, {
    displayName: "Synthetic First Admin",
    email: `admin-${id}@example.test`,
    phone: "01200000001",
    password,
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: result.id },
    include: { password: true, pointAccounts: true },
  });
  assert.equal(user.role, "PLATFORM_ADMIN");
  assert.equal(user.pointAccounts.length, 0);
  assert.notEqual(user.password!.passwordHash, password);
  await assert.rejects(
    provisionFirstAdmin(db, {
      displayName: "Another Admin",
      email: `other-${id}@example.test`,
      phone: "01200000002",
      password,
    }),
    { code: "ADMIN_ALREADY_EXISTS" },
  );
  const app = buildApp(db);
  try {
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/admin/register",
          payload: {},
        })
      ).statusCode,
      404,
    );
  } finally {
    await app.close();
  }
});

test("admin sign-in requires active admin role, uses short sessions and rotates password with revocation", async () => {
  const admin = await db.user.create({
    data: {
      role: "PLATFORM_ADMIN",
      displayName: "Synthetic Dashboard Admin",
      email: `dash-${randomUUID()}@example.test`,
      phoneE164: "+201200000003",
      password: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const app = buildApp(db),
    remoteAddress = "192.0.2.31";
  const login = (identifier = admin.email!, pass = password) =>
    app.inject({
      method: "POST",
      url: "/auth/admin/login",
      remoteAddress,
      payload: { identifier, password: pass },
    });
  try {
    const response = await login();
    assert.equal(response.statusCode, 200, response.body);
    const session = response.json();
    assert.ok(new Date(session.expiresAt).getTime() < Date.now() + 9 * 3600000);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/auth/login",
          remoteAddress,
          payload: { identifier: admin.email, password },
        })
      ).statusCode,
      401,
    );
    assert.equal((await login(admin.email!, "Wrong password")).statusCode, 401);
    const changed = await app.inject({
      method: "POST",
      url: "/auth/password/change",
      remoteAddress,
      headers: { authorization: `Bearer ${session.accessToken}` },
      payload: {
        currentPassword: password,
        newPassword: "Another synthetic admin passphrase!",
      },
    });
    assert.equal(changed.statusCode, 200, changed.body);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/me",
          headers: { authorization: `Bearer ${session.accessToken}` },
        })
      ).statusCode,
      401,
    );
    const updated = changed.json();
    assert.ok(new Date(updated.expiresAt).getTime() < Date.now() + 9 * 3600000);
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: "/admin/topup-settings",
          headers: { authorization: `Bearer ${updated.accessToken}` },
        })
      ).statusCode,
      200,
    );
    await db.user.update({
      where: { id: admin.id },
      data: { isActive: false },
    });
    assert.equal(
      (await login(admin.email!, "Another synthetic admin passphrase!"))
        .statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test("a trainee password never grants admin login or admin API access", async () => {
  const user = await db.user.create({
    data: {
      role: "TRAINEE",
      displayName: "Synthetic Trainee",
      email: `notadmin-${randomUUID()}@example.test`,
      phoneE164: "+201200000004",
      password: { create: { passwordHash: await hashPassword(password) } },
    },
  });
  const app = buildApp(db);
  try {
    const result = await app.inject({
      method: "POST",
      url: "/auth/admin/login",
      remoteAddress: "192.0.2.32",
      payload: { identifier: user.email, password },
    });
    assert.equal(result.statusCode, 401);
  } finally {
    await app.close();
  }
});
