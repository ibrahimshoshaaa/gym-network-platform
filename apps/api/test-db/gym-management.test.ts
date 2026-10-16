import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import test, { after } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { buildApp } from '../src/app.js';
import { createSession, hashToken } from '../src/auth/sessions.js';
import { requireBranchAccess } from '../src/auth/authorization.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/(gym_ci|gym_test)$/.test(url.pathname)) throw new Error('Disposable local test database required');
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const password = 'Synthetic invited person passphrase!';
let phone = randomInt(10000000, 80000000), ip = 1;
const contact = () => ({ displayName: 'Synthetic Invited Person', email: `gym-${randomUUID()}@example.test`, phone: `011${++phone}` });
const branchData = () => ({ name: 'Synthetic Branch', address: 'Synthetic address', governorate: 'Menofia', city: 'Synthetic city', latitude: 30.5, longitude: 31.0, visitPricePoints: 25, sessionMinutes: 120, openingHours: 'Daily 10:00–23:00' });

async function fixture() {
  const admin = await db.user.create({ data: { role: 'PLATFORM_ADMIN', displayName: 'Synthetic Admin', phoneE164: `+209${Date.now()}${ip}` } });
  const adminToken = await createSession(db, admin.id, new Date(Date.now() + 3600000));
  const app = buildApp(db), remoteAddress = `203.0.113.${ip++}`;
  const request = (method: 'GET' | 'POST' | 'PATCH', url: string, token?: string, payload?: unknown) => app.inject({ method, url, remoteAddress, ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}), ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
  const ownerContact = contact();
  const create = await request('POST', '/admin/gyms', adminToken, { name: `Synthetic Gym ${randomUUID()}`, owner: ownerContact });
  assert.equal(create.statusCode, 201, create.body);
  const created = create.json();
  return { app, request, admin, adminToken, ownerContact, created };
}
async function network(ready = true) {
  const f = await fixture();
  const accepted = await f.request('POST', '/auth/invitations/accept', undefined, { token: f.created.invitation.token, password });
  assert.equal(accepted.statusCode, 200, accepted.body);
  const owner = accepted.json();
  const activated = await f.request('PATCH', `/admin/gyms/${f.created.gym.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Synthetic onboarding review' });
  assert.equal(activated.statusCode, 200, activated.body);
  const result = await f.request('POST', `/gyms/${f.created.gym.id}/branches`, owner.accessToken, branchData());
  assert.equal(result.statusCode, 201, result.body);
  const { branch, pricingRequest } = result.json();
  if (ready) {
    assert.equal((await f.request('POST', `/admin/price-change-requests/${pricingRequest.id}/review`, f.adminToken, { decision: 'APPROVED', reason: 'Synthetic price review' })).statusCode, 200);
    const activation = await f.request('PATCH', `/admin/branches/${branch.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Synthetic branch review' });
    assert.equal(activation.statusCode, 200, activation.body);
  }
  return { ...f, owner, branch, pricingRequest, gymId: f.created.gym.id };
}
async function staff(f: Awaited<ReturnType<typeof network>>, role: 'CASHIER' | 'BRANCH_MANAGER' = 'CASHIER', info = contact()) {
  const response = await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, { branchId: f.branch.id, role, contact: info });
  assert.equal(response.statusCode, 201, response.body);
  const invitation = response.json();
  const accepted = await f.request('POST', '/auth/invitations/accept', undefined, { token: invitation.invitation.token, password });
  assert.equal(accepted.statusCode, 200, accepted.body);
  return { ...accepted.json(), invitation, contact: info };
}

test('owner invitation, pending gym, price review and activation form one complete onboarding flow', async () => {
  const f = await fixture();
  try {
    assert.equal(f.created.gym.status, 'PENDING');
    const invitation = await db.staffInvitation.findUniqueOrThrow({ where: { id: f.created.invitation.id } });
    assert.equal(invitation.tokenHash, hashToken(f.created.invitation.token));
    assert.notEqual(invitation.tokenHash, f.created.invitation.token);
    assert.equal(await db.userPassword.count({ where: { userId: f.created.owner.id } }), 0);
    assert.equal((await f.request('PATCH', `/admin/gyms/${f.created.gym.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Too early' })).statusCode, 409);
    const accepted = await f.request('POST', '/auth/invitations/accept', undefined, { token: f.created.invitation.token, password });
    assert.equal(accepted.statusCode, 200, accepted.body);
    const owner = accepted.json();
    assert.equal(owner.user.phoneVerified, false); assert.equal(owner.user.emailVerified, false);
    assert.equal((await f.request('POST', '/auth/staff/login', undefined, { identifier: f.ownerContact.email, password })).statusCode, 200);
    const createdBranch = await f.request('POST', `/gyms/${f.created.gym.id}/branches`, owner.accessToken, branchData());
    assert.equal(createdBranch.statusCode, 201, createdBranch.body);
    const { branch, pricingRequest } = createdBranch.json();
    assert.equal(branch.status, 'PENDING'); assert.equal(branch.pricingVersion, 0);
    const inventory = await db.pointAccount.findUniqueOrThrow({ where: { type_branchId: { type: 'BRANCH_INVENTORY', branchId: branch.id } } });
    assert.equal(inventory.balance, 0); assert.equal(inventory.expiresAt, null);
    assert.equal(await db.moneyAccount.count({ where: { gymId: f.created.gym.id } }), 0);
    assert.equal((await f.request('PATCH', `/admin/branches/${branch.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Too early' })).statusCode, 409);
    await f.request('PATCH', `/admin/gyms/${f.created.gym.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Reviewed contract placeholder' });
    const review = await f.request('POST', `/admin/price-change-requests/${pricingRequest.id}/review`, f.adminToken, { decision: 'APPROVED', reason: 'Reviewed price' });
    assert.equal(review.statusCode, 200, review.body);
    const activation = await f.request('PATCH', `/admin/branches/${branch.id}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Reviewed details' });
    assert.equal(activation.statusCode, 200, activation.body);
    const publicRows = (await f.request('GET', '/branches')).json().items;
    assert.ok(publicRows.some((b: { id: string }) => b.id === branch.id));
    const own = (await f.request('GET', '/me/access', owner.accessToken)).json();
    assert.equal(own.ownedGyms[0].id, f.created.gym.id);
    assert.equal(await db.auditLog.count({ where: { action: 'INVITATION_ACCEPTED', entityId: invitation.id } }), 1);
  } finally { await f.app.close(); }
});

test('trainee and owner cannot provision gyms, activate branches, approve prices or cross tenant scopes', async () => {
  const f = await network(), other = await network();
  try {
    assert.equal((await f.request('POST', '/admin/gyms', f.owner.accessToken, { name: 'Denied', owner: contact() })).statusCode, 403);
    assert.equal((await f.request('GET', '/admin/gyms', f.owner.accessToken)).statusCode, 403);
    assert.equal((await f.request('GET', '/admin/gyms')).statusCode, 401);
    assert.equal((await f.request('POST', `/gyms/${other.gymId}/branches`, f.owner.accessToken, branchData())).statusCode, 403);
    assert.equal((await f.request('GET', `/gyms/${other.gymId}/staff`, f.owner.accessToken)).statusCode, 403);
    assert.equal((await f.request('PATCH', `/gyms/${f.gymId}/branches/${other.branch.id}`, f.owner.accessToken, { name: 'Denied' })).statusCode, 403);
    assert.equal((await f.request('PATCH', `/admin/branches/${f.branch.id}/status`, f.owner.accessToken, { status: 'SUSPENDED', reason: 'Denied' })).statusCode, 403);
    assert.equal((await f.request('POST', `/admin/price-change-requests/${f.pricingRequest.id}/review`, f.owner.accessToken, { decision: 'APPROVED', reason: 'Denied' })).statusCode, 403);
    const mine = (await f.request('GET', '/gyms', f.owner.accessToken)).json();
    assert.ok(mine.items.every((g: { ownerId: string }) => g.ownerId === f.owner.user.id));
  } finally { await f.app.close(); await other.app.close(); }
});

test('pending price changes preserve active prices, reject safely, and concurrent approval increments once', async () => {
  const f = await network();
  try {
    const path = `/gyms/${f.gymId}/branches/${f.branch.id}/price-change-requests`;
    const proposal = await f.request('POST', path, f.owner.accessToken, { visitPricePoints: 40, sessionMinutes: 180, reason: 'Synthetic proposal' });
    assert.equal(proposal.statusCode, 201, proposal.body);
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id: f.branch.id } })).visitPricePoints, 25);
    assert.equal((await f.request('POST', path, f.owner.accessToken, { visitPricePoints: 50, sessionMinutes: 120, reason: 'Duplicate' })).statusCode, 409);
    const rejected = await f.request('POST', `/admin/price-change-requests/${proposal.json().id}/review`, f.adminToken, { decision: 'REJECTED', reason: 'Needs different terms' });
    assert.equal(rejected.statusCode, 200, rejected.body);
    assert.equal((await db.branch.findUniqueOrThrow({ where: { id: f.branch.id } })).visitPricePoints, 25);
    const next = (await f.request('POST', path, f.owner.accessToken, { visitPricePoints: 35, sessionMinutes: 150, reason: 'Revised terms' })).json();
    const reviews = await Promise.all(Array.from({ length: 2 }, () => f.request('POST', `/admin/price-change-requests/${next.id}/review`, f.adminToken, { decision: 'APPROVED', reason: 'Approved terms' })));
    reviews.forEach(r => assert.equal(r.statusCode, 200, r.body));
    const branch = await db.branch.findUniqueOrThrow({ where: { id: f.branch.id } });
    assert.equal(branch.visitPricePoints, 35); assert.equal(branch.sessionMinutes, 150); assert.equal(branch.pricingVersion, 2);
    assert.equal(await db.auditLog.count({ where: { entityId: next.id, action: 'PRICE_CHANGE_APPROVED' } }), 1);
    assert.equal((await f.request('GET', `/gyms/${f.gymId}/branches/${f.branch.id}/pricing-history`, f.owner.accessToken)).json().items.length, 3);
    await assert.rejects(db.branchPricingRequest.update({ where: { id: next.id }, data: { visitPricePoints: 1 } }));
    await assert.rejects(db.branchPricingRequest.delete({ where: { id: next.id } }));
  } finally { await f.app.close(); }
});

test('owner metadata updates cannot change approved pricing, status, ownership or verification', async () => {
  const f = await network();
  try {
    const path = `/gyms/${f.gymId}/branches/${f.branch.id}`;
    for (const body of [{ visitPricePoints: 1 }, { status: 'ACTIVE' }, { gymId: randomUUID() }, { latitude: 999, longitude: 31 }, { latitude: 30 }]) assert.equal((await f.request('PATCH', path, f.owner.accessToken, body)).statusCode, 400);
    assert.equal((await f.request('PATCH', path, f.owner.accessToken, { name: 'Updated branch', address: 'Updated address' })).statusCode, 200);
    assert.equal((await f.request('PATCH', `/gyms/${f.gymId}`, f.owner.accessToken, { ownerId: f.admin.id })).statusCode, 400);
    assert.equal((await f.request('PATCH', `/gyms/${f.gymId}`, f.owner.accessToken, { description: 'Updated profile' })).statusCode, 200);
    assert.equal((await f.request('POST', `/gyms/${f.gymId}/branches/${f.branch.id}/price-change-requests`, f.owner.accessToken, { visitPricePoints: -1, sessionMinutes: 100, reason: 'Invalid' })).statusCode, 400);
  } finally { await f.app.close(); }
});

test('staff consent, role and branch scope are enforced and assignment disable takes effect immediately', async () => {
  const f = await network(), other = await network();
  try {
    const cashier = await staff(f), manager = await staff(f, 'BRANCH_MANAGER');
    assert.equal((await f.request('POST', '/auth/staff/login', undefined, { identifier: cashier.contact.email, password })).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${f.branch.id}/manage`, cashier.accessToken)).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${other.branch.id}/manage`, cashier.accessToken)).statusCode, 403);
    for (const person of [cashier, manager]) assert.equal((await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, person.accessToken, { branchId: f.branch.id, role: 'CASHIER', contact: contact() })).statusCode, 403);
    assert.equal((await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, { branchId: other.branch.id, role: 'CASHIER', contact: contact() })).statusCode, 403);
    const assignment = await db.staffAssignment.findUniqueOrThrow({ where: { userId_branchId_role: { userId: cashier.user.id, branchId: f.branch.id, role: 'CASHIER' } } });
    assert.equal((await f.request('PATCH', `/gyms/${other.gymId}/staff/${assignment.id}`, other.owner.accessToken, { active: false })).statusCode, 403);
    assert.equal((await f.request('PATCH', `/gyms/${f.gymId}/staff/${assignment.id}`, f.owner.accessToken, { active: false })).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${f.branch.id}/manage`, cashier.accessToken)).statusCode, 403);
    assert.equal((await f.request('POST', '/auth/staff/login', undefined, { identifier: cashier.contact.email, password })).statusCode, 401);
    await assert.rejects(db.$transaction(tx => requireBranchAccess(tx, cashier.user.id, f.branch.id, 'SELL_POINTS')), /BRANCH_ACCESS_DENIED/);
    // Personal identity access survives removal of one tenant assignment.
    assert.equal((await f.request('GET', '/me', cashier.accessToken)).statusCode, 200);
  } finally { await f.app.close(); await other.app.close(); }
});

test('reissued, revoked, expired and consumed invitations cannot be used', async () => {
  const f = await network();
  try {
    const info = contact(), body = { branchId: f.branch.id, role: 'CASHIER', contact: info };
    const first = (await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, body)).json();
    assert.equal(await db.staffAssignment.count({ where: { userId: first.user.id } }), 0);
    const secondResponse = await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, body);
    assert.equal(secondResponse.statusCode, 201, secondResponse.body); const second = secondResponse.json();
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token: first.invitation.token, password })).statusCode, 400);
    assert.equal((await f.request('POST', `/invitations/${second.invitation.id}/revoke`, f.owner.accessToken)).statusCode, 200);
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token: second.invitation.token, password })).statusCode, 400);
    const raw = randomBytes(32).toString('base64url');
    await db.staffInvitation.create({ data: { type: 'STAFF', role: 'CASHIER', tokenHash: hashToken(raw), userId: first.user.id, gymId: f.gymId, branchId: f.branch.id, createdById: f.owner.user.id, createdAt: new Date(Date.now() - 100000), expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token: raw, password })).statusCode, 400);
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token: f.created.invitation.token, password })).statusCode, 400);
    const listed = await f.request('GET', `/gyms/${f.gymId}/invitations`, f.owner.accessToken);
    assert.equal(listed.body.includes('tokenHash'), false); assert.equal(listed.body.includes(raw), false);
  } finally { await f.app.close(); }
});

test('existing trainee invitation requires their current password and cannot overwrite credentials', async () => {
  const f = await network();
  try {
    const info = contact();
    const registration = await f.request('POST', '/auth/register', undefined, { ...info, password });
    assert.equal(registration.statusCode, 201, registration.body); const trainee = registration.json();
    const invited = await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, { branchId: f.branch.id, role: 'CASHIER', contact: info });
    assert.equal(invited.statusCode, 201, invited.body);
    const token = invited.json().invitation.token;
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token, password: 'An attacker chosen different password!' })).statusCode, 401);
    assert.equal(await db.staffAssignment.count({ where: { userId: trainee.user.id } }), 0);
    const accepted = await f.request('POST', '/auth/invitations/accept', undefined, { token, password });
    assert.equal(accepted.statusCode, 200, accepted.body);
    assert.equal(accepted.json().user.role, 'TRAINEE');
    assert.equal((await f.request('POST', '/auth/login', undefined, { identifier: info.email, password })).statusCode, 200);
    assert.equal((await f.request('POST', '/auth/staff/login', undefined, { identifier: info.email, password })).statusCode, 200);
    assert.equal((await f.request('GET', '/me/access', trainee.accessToken)).json().assignments[0].role, 'CASHIER');
  } finally { await f.app.close(); }
});

test('an existing identity gains no gym owner access until accepting the owner invitation', async () => {
  const f = await fixture();
  try {
    const info = contact();
    const registered = (await f.request('POST', '/auth/register', undefined, { ...info, password })).json();
    const created = await f.request('POST', '/admin/gyms', f.adminToken, { name: 'Another synthetic gym', owner: info });
    assert.equal(created.statusCode, 201, created.body); const gym = created.json();
    assert.equal((await f.request('GET', '/gyms', registered.accessToken)).json().items.length, 0);
    assert.equal((await f.request('POST', `/gyms/${gym.gym.id}/branches`, registered.accessToken, branchData())).statusCode, 403);
    assert.equal((await f.request('POST', '/auth/invitations/accept', undefined, { token: gym.invitation.token, password })).statusCode, 200);
    assert.equal((await f.request('GET', '/gyms', registered.accessToken)).json().items[0].id, gym.gym.id);
  } finally { await f.app.close(); }
});

test('concurrent invitation acceptance creates one assignment, credential and acceptance audit', async () => {
  const f = await network();
  try {
    const invited = (await f.request('POST', `/gyms/${f.gymId}/staff-invitations`, f.owner.accessToken, { branchId: f.branch.id, role: 'CASHIER', contact: contact() })).json();
    const responses = await Promise.all(Array.from({ length: 2 }, () => f.request('POST', '/auth/invitations/accept', undefined, { token: invited.invitation.token, password })));
    assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 400]);
    assert.equal(await db.staffAssignment.count({ where: { userId: invited.user.id } }), 1);
    assert.equal(await db.userPassword.count({ where: { userId: invited.user.id } }), 1);
    assert.equal(await db.auditLog.count({ where: { entityId: invited.invitation.id, action: 'INVITATION_ACCEPTED' } }), 1);
  } finally { await f.app.close(); }
});

test('suspending one gym hides only its branches and blocks its operations without deleting records', async () => {
  const f = await network(), other = await network();
  try {
    const cashier = await staff(f);
    assert.equal((await f.request('PATCH', `/admin/gyms/${f.gymId}/status`, f.adminToken, { status: 'SUSPENDED', reason: 'Synthetic review hold' })).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${f.branch.id}/manage`, cashier.accessToken)).statusCode, 403);
    const rows = (await f.request('GET', '/branches?limit=100')).json().items;
    assert.ok(!rows.some((r: { id: string }) => r.id === f.branch.id));
    assert.ok(rows.some((r: { id: string }) => r.id === other.branch.id));
    await assert.rejects(db.$transaction(tx => requireBranchAccess(tx, f.owner.user.id, f.branch.id, 'TRANSFER_STOCK')), /BRANCH_ACCESS_DENIED/);
    assert.equal((await f.request('GET', `/gyms/${f.gymId}/branches`, f.owner.accessToken)).statusCode, 200);
    assert.equal((await f.request('PATCH', `/admin/gyms/${f.gymId}/status`, f.adminToken, { status: 'ACTIVE', reason: 'Review resolved' })).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${f.branch.id}/manage`, cashier.accessToken)).statusCode, 200);
    assert.equal((await f.request('PATCH', `/admin/branches/${f.branch.id}/status`, f.adminToken, { status: 'SUSPENDED', reason: 'Branch hold' })).statusCode, 200);
    assert.equal((await f.request('GET', `/branches/${f.branch.id}/manage`, cashier.accessToken)).statusCode, 403);
  } finally { await f.app.close(); await other.app.close(); }
});

test('staff can change their password and earlier sessions are revoked', async () => {
  const f = await network();
  try {
    const cashier = await staff(f);
    const response = await f.request('POST', '/auth/password/change', cashier.accessToken, { currentPassword: password, newPassword: 'Changed synthetic staff passphrase!' });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await f.request('GET', '/me', cashier.accessToken)).statusCode, 401);
    assert.equal((await f.request('POST', '/auth/staff/login', undefined, { identifier: cashier.contact.phone, password: 'Changed synthetic staff passphrase!' })).statusCode, 200);
  } finally { await f.app.close(); }
});

test('pagination and public directory omit private ownership, staff and invitation data', async () => {
  const f = await network();
  try {
    const rows = await f.request('GET', '/branches?limit=1');
    assert.equal(rows.statusCode, 200, rows.body); assert.equal(rows.json().items.length, 1);
    if (rows.json().nextCursor) {
      const next = await f.request('GET', `/branches?limit=1&cursor=${rows.json().nextCursor}`);
      if (next.json().items.length) assert.notEqual(next.json().items[0].id, rows.json().items[0].id);
    }
    for (const secret of ['ownerId', 'tokenHash', 'createdById', f.ownerContact.email]) assert.equal(rows.body.includes(secret), false);
    assert.equal((await f.request('GET', '/branches?limit=1000')).statusCode, 400);
    assert.equal((await f.request('GET', '/branches?cursor=not-a-uuid')).statusCode, 400);
  } finally { await f.app.close(); }
});
