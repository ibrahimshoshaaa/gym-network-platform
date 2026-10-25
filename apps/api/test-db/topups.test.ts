import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, before } from 'node:test';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/auth/sessions.js';
import { publishPolicy, savePaymentMethod, savePackage } from '../src/topups/settings.js';
import { getQuote, submitTopup, reviewTopup } from '../src/topups/service.js';
import { reverseLedger } from '../src/ledger/service.js';
import type { ReceiptStorage } from '../src/topups/receipts.js';

const url = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/(gym_ci|gym_test)$/.test(url.pathname)) throw new Error('Disposable local test database required');
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
const user = (role: 'TRAINEE' | 'PLATFORM_ADMIN' | 'GYM_OWNER' = 'TRAINEE') => db.user.create({ data: { role, displayName: 'Synthetic Topup User', phoneE164: `+20topup${randomUUID()}` } });
let admin: Awaited<ReturnType<typeof user>>;
before(async () => {
  admin = await user('PLATFORM_ADMIN');
  await publishPolicy(db, admin.id, { expectedVersion: 0, pointPricePiasters: '100', redemptionBps: 8000 });
  await savePaymentMethod(db, admin.id, 'INSTAPAY', { expectedVersion: 0, account: 'synthetic@instapay', accountName: 'Synthetic Receiver', enabled: true });
});
async function fixture() {
  const trainee = await user();
  const wallet = await db.pointAccount.create({ data: { type: 'TRAINEE_WALLET', ownerUserId: trainee.id } });
  return { trainee, wallet };
}
async function evidence(userId: string) {
  return db.receiptEvidence.create({ data: { ownerUserId: userId, objectKey: `synthetic/${randomUUID()}`, assetId: randomUUID(), contentHash: randomUUID(), mimeType: 'image/jpeg', bytes: 10 } });
}
async function input(userId: string, override: Record<string, unknown> = {}) {
  const policy = await db.pricingPolicy.findFirstOrThrow({ orderBy: { version: 'desc' } });
  const method = await db.paymentMethod.findUniqueOrThrow({ where: { type: 'INSTAPAY' } });
  const receipt = await evidence(userId);
  return { kind: 'TRAINEE', points: 20, pricingVersion: policy.version, receiptId: receipt.id, paymentMethod: 'INSTAPAY', paymentMethodVersion: method.version, ...override };
}
function approval(amount = '2000', reference = randomUUID()) {
  return { decision: 'APPROVED', reason: 'Synthetic transfer independently verified', paymentReference: reference, receivedAmountPiasters: amount, fundsReceived: true, receiptReviewed: true };
}
const expectCode = async (p: Promise<unknown>, code: string) => assert.rejects(p, (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && e.code === code);

test('only admin configures prices; concurrent expected version saves have one winner', async () => {
  const trainee = await user();
  const current = await db.pricingPolicy.findFirstOrThrow({ orderBy: { version: 'desc' } });
  const data = { expectedVersion: current.version, pointPricePiasters: '100', redemptionBps: 8000 };
  await expectCode(publishPolicy(db, trainee.id, data), 'ACCESS_DENIED');
  const outcomes = await Promise.allSettled([publishPolicy(db, admin.id, data), publishPolicy(db, admin.id, data)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected' && r.reason.code === 'STALE_SETTINGS').length, 1);
  await assert.rejects(db.pricingPolicy.update({ where: { id: current.id }, data: { redemptionBps: 9000 } }));
});

test('concurrent initial payment-channel configuration rejects the stale save', async () => {
  const data = { expectedVersion: 0, account: 'synthetic-wallet', accountName: 'Synthetic Wallet Receiver', enabled: true };
  const outcomes = await Promise.allSettled([savePaymentMethod(db, admin.id, 'WALLET', data), savePaymentMethod(db, admin.id, 'WALLET', data)]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(r => r.status === 'rejected' && r.reason.code === 'STALE_SETTINGS').length, 1);
});

test('submitted request is pending; concurrent approvals create one balanced issuance and one wallet renewal', async () => {
  const { trainee, wallet } = await fixture();
  const data = await input(trainee.id), key = randomUUID();
  const request = await submitTopup(db, trainee.id, key, data);
  assert.equal(request.status, 'PENDING');
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: wallet.id } })).balance, 0);
  assert.equal((await submitTopup(db, trainee.id, key, data)).id, request.id);
  await expectCode(submitTopup(db, trainee.id, key, { ...data, points: 21 }), 'IDEMPOTENCY_CONFLICT');
  await expectCode(reviewTopup(db, trainee.id, request.id, approval()), 'ACCESS_DENIED');
  const review = approval();
  const results = await Promise.all(Array.from({ length: 8 }, () => reviewTopup(db, admin.id, request.id, review)));
  assert.equal(new Set(results.map(r => r.pointTransactionId)).size, 1);
  const updated = await db.pointAccount.findUniqueOrThrow({ where: { id: wallet.id } });
  assert.equal(updated.balance, 20); assert.ok(updated.expiresAt!.getTime() > Date.now() + 89 * 86400000);
  const entries = await db.pointPosting.findMany({ where: { transactionId: results[0]!.pointTransactionId! } });
  assert.equal(entries.length, 2); assert.equal(entries.reduce((n, e) => n + e.delta, 0), 0);
  assert.equal(await db.moneyTransaction.count({ where: { referenceId: request.id } }), 0);
  await expectCode(reverseLedger(db, { actorId: admin.id, idempotencyKey: randomUUID(), reason: 'Cannot bypass topup workflow', pointTransactionId: results[0]!.pointTransactionId! }), 'DOMAIN_APPROVAL_REQUIRED');
  await assert.rejects(db.topupRequest.update({ where: { id: request.id }, data: { points: 99 } }));
});

test('rejection changes no balance and cannot later be approved', async () => {
  const { trainee, wallet } = await fixture();
  const request = await submitTopup(db, trainee.id, randomUUID(), await input(trainee.id));
  await reviewTopup(db, admin.id, request.id, { decision: 'REJECTED', reason: 'Synthetic invalid transfer' });
  await expectCode(reviewTopup(db, admin.id, request.id, approval()), 'INVALID_STATE');
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: wallet.id } })).balance, 0);
});

test('snapshots preserve old rates and payment destination; stale new requests are rejected', async () => {
  const { trainee } = await fixture();
  const data = await input(trainee.id), request = await submitTopup(db, trainee.id, randomUUID(), data);
  const p = await db.pricingPolicy.findFirstOrThrow({ orderBy: { version: 'desc' } });
  await publishPolicy(db, admin.id, { expectedVersion: p.version, pointPricePiasters: '200', redemptionBps: 7000 });
  const method = await db.paymentMethod.findUniqueOrThrow({ where: { type: 'INSTAPAY' } });
  await savePaymentMethod(db, admin.id, 'INSTAPAY', { expectedVersion: method.version, account: 'new-synthetic@instapay', accountName: 'New Synthetic Receiver', enabled: true });
  await expectCode(submitTopup(db, trainee.id, randomUUID(), { ...data, receiptId: (await evidence(trainee.id)).id }), 'STALE_SETTINGS');
  const fresh = await input(trainee.id);
  await expectCode(submitTopup(db, trainee.id, randomUUID(), { ...fresh, paymentMethodVersion: method.version }), 'STALE_SETTINGS');
  const approved = await reviewTopup(db, admin.id, request.id, approval());
  assert.equal(approved.chargePiasters, '2000'); assert.equal(approved.redemptionBps, 8000); assert.equal(approved.paymentAccount, 'synthetic@instapay');
  await publishPolicy(db, admin.id, { expectedVersion: p.version + 1, pointPricePiasters: '100', redemptionBps: 8000 });
});

test('receipt ownership and one-use rule; duplicate payment reference cannot issue points twice', async () => {
  const a = await fixture(), b = await fixture();
  const data = await input(a.trainee.id);
  await expectCode(submitTopup(db, b.trainee.id, randomUUID(), data), 'RECEIPT_ACCESS_DENIED');
  const one = await submitTopup(db, a.trainee.id, randomUUID(), data);
  await expectCode(submitTopup(db, a.trainee.id, randomUUID(), data), 'RECEIPT_ALREADY_USED');
  const two = await submitTopup(db, b.trainee.id, randomUUID(), await input(b.trainee.id));
  const review = approval();
  await reviewTopup(db, admin.id, one.id, review);
  await expectCode(reviewTopup(db, admin.id, two.id, review), 'PAYMENT_REFERENCE_USED');
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: b.wallet.id } })).balance, 0);
  assert.equal((await db.topupRequest.findUniqueOrThrow({ where: { id: two.id } })).status, 'PENDING');
});

test('approval requires exact confirmed amount and never revives an expired positive wallet', async () => {
  const { trainee, wallet } = await fixture();
  const request = await submitTopup(db, trainee.id, randomUUID(), await input(trainee.id));
  await expectCode(reviewTopup(db, admin.id, request.id, approval('1999')), 'PAYMENT_AMOUNT_MISMATCH');
  await reviewTopup(db, admin.id, request.id, approval());
  await db.pointAccount.update({ where: { id: wallet.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const next = await submitTopup(db, trainee.id, randomUUID(), await input(trainee.id));
  await expectCode(reviewTopup(db, admin.id, next.id, approval()), 'WALLET_EXPIRY_REVIEW_REQUIRED');
  assert.equal((await db.pointAccount.findUniqueOrThrow({ where: { id: wallet.id } })).balance, 20);
});

test('gym purchases are rejected for all principals',async()=>{const {trainee}=await fixture();assert.throws(()=>getQuote(db,trainee.id,{kind:'BRANCH_STOCK',receivingBranchId:randomUUID(),points:10}),/INVALID_INPUT/);});

test('packages are version checked and pending snapshots cannot be edited', async () => {
  const { trainee } = await fixture();
  const pack = await savePackage(db, admin.id, undefined, { expectedVersion: 0, kind: 'TRAINEE', label: 'Synthetic 30 points', points: 30, enabled: true });
  assert.equal((await getQuote(db, trainee.id, { kind: 'TRAINEE', packageId: pack.id, packageVersion: pack.version })).chargePiasters, '3000');
  await savePackage(db, admin.id, pack.id, { expectedVersion: 1, kind: 'TRAINEE', label: 'Synthetic 40 points', points: 40, enabled: true });
  await expectCode(getQuote(db, trainee.id, { kind: 'TRAINEE', packageId: pack.id, packageVersion: 1 }), 'PACKAGE_UNAVAILABLE');
  const data = await input(trainee.id), request = await submitTopup(db, trainee.id, randomUUID(), data);
  await assert.rejects(db.topupRequest.update({ where: { id: request.id }, data: { chargePiasters: 1n } }));
  await assert.rejects(db.receiptEvidence.delete({ where: { id: data.receiptId } }));
});

test('receipt HTTP flow authenticates, normalizes, deduplicates and restricts short-lived access', async () => {
  const uploads: Buffer[] = [];
  const storage: ReceiptStorage = { async upload(data, publicId) { uploads.push(data); return { objectKey: publicId, assetId: randomUUID() }; }, readUrl(key) { return `https://example.test/private/${key}?expires=60`; }, async remove() {} };
  const app = buildApp(db, { receiptStorage: storage });
  const a = await fixture(), b = await fixture();
  const token = await createSession(db, a.trainee.id, new Date(Date.now() + 3600000));
  const other = await createSession(db, b.trainee.id, new Date(Date.now() + 3600000));
  const adminToken = await createSession(db, admin.id, new Date(Date.now() + 3600000));
  const data = await sharp({ create: { width: 21, height: 22, channels: 3, background: '#12aabb' } }).png().toBuffer();
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/receipts', headers: { 'content-type': 'image/png' }, payload: data })).statusCode, 401);
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'image/png' };
    const uploaded = await app.inject({ method: 'POST', url: '/receipts', headers, payload: data });
    assert.equal(uploaded.statusCode, 201, uploaded.body);
    const id = uploaded.json().id;
    assert.deepEqual(Object.keys(uploaded.json()), ['id']);
    assert.equal((await app.inject({ method: 'POST', url: '/receipts', headers, payload: data })).json().id, id);
    assert.equal(uploads.length, 1);
    assert.equal((await sharp(uploads[0]).metadata()).format, 'jpeg');
    assert.equal((await app.inject({ method: 'POST', url: '/receipts', headers: { ...headers, authorization: `Bearer ${other}` }, payload: data })).statusCode, 409);
    assert.equal((await app.inject({ method: 'GET', url: `/receipts/${id}/access`, headers: { authorization: `Bearer ${other}` } })).statusCode, 403);
    for (const accessToken of [token, adminToken]) {
      const access = await app.inject({ method: 'GET', url: `/receipts/${id}/access`, headers: { authorization: `Bearer ${accessToken}` } });
      assert.equal(access.statusCode, 200); assert.equal(access.json().expiresInSeconds, 60); assert.equal(access.headers['cache-control'], 'no-store');
    }
    assert.equal((await app.inject({ method: 'POST', url: '/receipts', headers, payload: Buffer.from('bad') })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/receipts', headers, payload: Buffer.alloc(5242881) })).statusCode, 413);
    const submission = await input(a.trainee.id, { receiptId: id });
    const created = await app.inject({ method: 'POST', url: '/topups', headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID() }, payload: submission });
    assert.equal(created.statusCode, 201, created.body);
    const denied = await app.inject({ method: 'GET', url: '/admin/topups', headers: { authorization: `Bearer ${token}` } });
    assert.equal(denied.statusCode, 403);
    const listed = await app.inject({ method: 'GET', url: '/topups', headers: { authorization: `Bearer ${other}` } });
    assert.equal(listed.json().items.length, 0);
  } finally { await app.close(); }
});


test('central gym stock purchase cannot be quoted',async()=>{const {trainee}=await fixture();assert.throws(()=>getQuote(db,trainee.id,{kind:'BRANCH_STOCK',receivingGymId:randomUUID(),points:10}),/INVALID_INPUT/);});
