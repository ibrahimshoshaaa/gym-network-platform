import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { hashToken } from '../src/auth/sessions.js';
import { consumeAuthLimit, throttleKey } from '../src/auth/throttle.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/(gym_ci|gym_test)$/.test(url.pathname)) throw new Error('Disposable local gym_ci or gym_test required');
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const password = 'Synthetic test passphrase 123!';
let phoneCounter = randomInt(10000000, 80000000);
let ipCounter = 1;
const newIp = () => `198.51.100.${ipCounter++}`;
const payload = () => ({ displayName: 'Synthetic Trainee', phone: `010${++phoneCounter}`, email: `auth-${randomUUID()}@example.test`, password });
function fixture() {
  const app = buildApp(db); const ip = newIp(); const data = payload();
  const register = (body: unknown = data) => app.inject({ method: 'POST', url: '/auth/register', remoteAddress: ip, payload: body as Record<string, unknown> });
  const login = (identifier = data.email, suppliedPassword = password, remoteAddress = ip) => app.inject({ method: 'POST', url: '/auth/login', remoteAddress, payload: { identifier, password: suppliedPassword } });
  const me = (token: string) => app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` } });
  return { app, data, ip, register, login, me };
}

test('registration creates exactly one unverified trainee, credential, empty wallet, session and audit', async () => {
  const f = fixture();
  try {
    const response = await f.register({ ...f.data, email: f.data.email.toUpperCase() });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.headers['cache-control'], 'no-store');
    const body = response.json();
    assert.equal(body.user.role, 'TRAINEE');
    assert.equal(body.user.email, f.data.email);
    assert.equal(body.user.phone, `+20${f.data.phone.slice(1)}`);
    assert.equal(body.user.emailVerified, false); assert.equal(body.user.phoneVerified, false);
    assert.equal(body.tokenType, 'Bearer');
    assert.ok(new Date(body.expiresAt).getTime() > Date.now());
    assert.equal((await f.me(body.accessToken)).statusCode, 200);
    const account = await db.user.findUniqueOrThrow({ where: { id: body.user.id }, include: { password: true, pointAccounts: true, sessions: true } });
    assert.ok(account.password!.passwordHash.startsWith('scrypt-v1$'));
    assert.notEqual(account.password!.passwordHash, password);
    assert.equal(account.pointAccounts.length, 1); assert.equal(account.pointAccounts[0]!.balance, 0);
    assert.equal(account.pointAccounts[0]!.type, 'TRAINEE_WALLET');
    assert.equal(account.sessions[0]!.tokenHash, hashToken(body.accessToken));
    assert.equal(account.emailVerifiedAt, null); assert.equal(account.phoneVerifiedAt, null);
    assert.equal(await db.auditLog.count({ where: { actorId: account.id, action: 'TRAINEE_REGISTERED' } }), 1);
    for (const forbidden of ['passwordHash', 'tokenHash', password]) assert.equal(response.body.includes(forbidden), false);
  } finally { await f.app.close(); }
});

test('login works with normalized email or phone without implying contact verification', async () => {
  const f = fixture();
  try {
    assert.equal((await f.register()).statusCode, 201);
    for (const identifier of [f.data.email.toUpperCase(), f.data.phone, `+20${f.data.phone.slice(1)}`]) {
      const response = await f.login(identifier);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().user.emailVerified, false);
      assert.equal(response.json().user.phoneVerified, false);
      assert.equal((await f.me(response.json().accessToken)).statusCode, 200);
    }
  } finally { await f.app.close(); }
});

test('wrong password, unknown identity, inactive identity and staff login return the same error', async () => {
  const f = fixture();
  try {
    const registered = (await f.register()).json();
    const wrong = await f.login(f.data.email, 'incorrect password');
    const unknown = await f.login(`missing-${randomUUID()}@example.test`);
    await db.user.update({ where: { id: registered.user.id }, data: { isActive: false } });
    const inactive = await f.login();
    await db.user.update({ where: { id: registered.user.id }, data: { isActive: true, role: 'PLATFORM_ADMIN' } });
    const staff = await f.login();
    for (const response of [wrong, unknown, inactive, staff]) {
      assert.equal(response.statusCode, 401, response.body);
      assert.equal(response.json().code, 'INVALID_CREDENTIALS');
      assert.equal(response.body.includes('accessToken'), false);
    }
  } finally { await f.app.close(); }
});

test('duplicate email or normalized phone is rejected without claiming existing accounts', async () => {
  const f = fixture();
  try {
    const first = (await f.register()).json();
    const another = payload();
    const emailDuplicate = await f.register({ ...another, email: f.data.email.toUpperCase() });
    const phoneDuplicate = await f.register({ ...another, phone: `+20${f.data.phone.slice(1)}` });
    for (const response of [emailDuplicate, phoneDuplicate]) { assert.equal(response.statusCode, 409, response.body); assert.equal(response.json().code, 'ACCOUNT_UNAVAILABLE'); }
    assert.equal(await db.user.count({ where: { email: another.email } }), 0);
    assert.equal(await db.authSession.count({ where: { userId: first.user.id } }), 1);
    assert.equal(await db.pointAccount.count({ where: { ownerUserId: first.user.id } }), 1);
    // A pre-existing passwordless identity must not be claimed by registration.
    await db.user.create({ data: { phoneE164: `+20${another.phone.slice(1)}`, displayName: 'Legacy synthetic user', role: 'TRAINEE' } });
    assert.equal((await f.register(another)).statusCode, 409);
  } finally { await f.app.close(); }
});

test('concurrent duplicate registration commits only one user, wallet and session', async () => {
  const f = fixture();
  try {
    const responses = await Promise.all([f.register(), f.register()]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [201, 409]);
    const user = await db.user.findUniqueOrThrow({ where: { email: f.data.email } });
    assert.equal(await db.pointAccount.count({ where: { ownerUserId: user.id } }), 1);
    assert.equal(await db.authSession.count({ where: { userId: user.id } }), 1);
  } finally { await f.app.close(); }
});

test('registration cannot inject roles, verification, active state or weak credentials', async () => {
  const f = fixture();
  try {
    for (const input of [{ ...f.data, role: 'PLATFORM_ADMIN' }, { ...f.data, emailVerifiedAt: new Date().toISOString() }, { ...f.data, password: '12345' }]) {
      const response = await f.register(input); assert.equal(response.statusCode, 400, response.body);
    }
    assert.equal(await db.user.count({ where: { email: f.data.email } }), 0);
  } finally { await f.app.close(); }
});

test('registration IP rate limit is shared by two app instances and ignores spoofed proxy headers', async () => {
  const f = fixture(); const second = buildApp(db);
  try {
    for (let n = 0; n < 5; n++) {
      const app = n % 2 ? second : f.app;
      const response = await app.inject({ method: 'POST', url: '/auth/register', remoteAddress: f.ip, headers: { 'x-forwarded-for': newIp() }, payload: { password: 'invalid' } });
      assert.equal(response.statusCode, 400, response.body);
    }
    const limited = await f.register();
    assert.equal(limited.statusCode, 429, limited.body);
    assert.equal(limited.json().code, 'RATE_LIMITED');
    assert.ok(Number(limited.headers['retry-after']) > 0);
    assert.equal(await db.user.count({ where: { email: f.data.email } }), 0);
  } finally { await f.app.close(); await second.close(); }
});

test('normalized login identity limit applies across IPs and worker instances', async () => {
  const f = fixture(); const second = buildApp(db);
  try {
    await f.register();
    for (let n = 0; n < 10; n++) {
      const response = await (n % 2 ? second : f.app).inject({ method: 'POST', url: '/auth/login', remoteAddress: newIp(), payload: { identifier: n % 2 ? f.data.email.toUpperCase() : f.data.email, password: 'incorrect password' } });
      assert.equal(response.statusCode, 401, response.body);
    }
    const limited = await f.login(f.data.email, password, newIp());
    assert.equal(limited.statusCode, 429, limited.body);
  } finally { await f.app.close(); await second.close(); }
});

test('concurrent database limit consumption cannot grant extra attempts and expired windows reset', async () => {
  const identifier = randomUUID();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeAuthLimit(db, 'synthetic-limit', identifier, 3, 900)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  const key = throttleKey('synthetic-limit', identifier);
  await db.authThrottle.update({ where: { key }, data: { expiresAt: new Date(0) } });
  await consumeAuthLimit(db, 'synthetic-limit', identifier, 3, 900);
  assert.equal((await db.authThrottle.findUniqueOrThrow({ where: { key } })).attempts, 1);
});

test('password change requires current password and revokes every earlier session', async () => {
  const f = fixture();
  try {
    const registration = (await f.register()).json(); const login = (await f.login()).json();
    const change = (currentPassword: string) => f.app.inject({ method: 'POST', url: '/auth/password/change', remoteAddress: f.ip, headers: { authorization: `Bearer ${registration.accessToken}` }, payload: { currentPassword, newPassword: 'A different synthetic passphrase 456!' } });
    assert.equal((await change('incorrect password')).statusCode, 401);
    assert.equal((await f.me(login.accessToken)).statusCode, 200);
    const result = await change(password); assert.equal(result.statusCode, 200, result.body);
    const token = result.json().accessToken;
    assert.equal((await f.me(registration.accessToken)).statusCode, 401);
    assert.equal((await f.me(login.accessToken)).statusCode, 401);
    assert.equal((await f.me(token)).statusCode, 200);
    assert.equal((await f.login()).statusCode, 401);
    assert.equal((await f.login(f.data.phone, 'A different synthetic passphrase 456!')).statusCode, 200);
    assert.equal(await db.auditLog.count({ where: { actorId: registration.user.id, action: 'PASSWORD_CHANGED' } }), 1);
    assert.equal((await f.app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } })).statusCode, 204);
    assert.equal((await f.me(token)).statusCode, 401);
  } finally { await f.app.close(); }
});

test('unauthenticated password change and disabled/expired sessions are rejected', async () => {
  const f = fixture();
  try {
    const change = await f.app.inject({ method: 'POST', url: '/auth/password/change', remoteAddress: f.ip, payload: { currentPassword: password, newPassword: 'Another synthetic passphrase 123!' } });
    assert.equal(change.statusCode, 401);
    const body = (await f.register()).json();
    await db.authSession.updateMany({ where: { userId: body.user.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await f.me(body.accessToken)).statusCode, 401);
    const session = (await f.login()).json();
    await db.user.update({ where: { id: body.user.id }, data: { isActive: false } });
    assert.equal((await f.me(session.accessToken)).statusCode, 401);
  } finally { await f.app.close(); }
});

test('verification, reset and financial mutations remain unavailable', async () => {
  const f = fixture();
  try {
    for (const url of ['/auth/otp/verify', '/auth/password/reset', '/auth/verify-email', '/admin/ledger']) assert.equal((await f.app.inject({ method: 'POST', url })).statusCode, 404);
  } finally { await f.app.close(); }
});
