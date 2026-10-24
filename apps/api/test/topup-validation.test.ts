import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { calculateQuote, quoteSchema, reviewSchema } from '../src/topups/service.js';
import { policySchema } from '../src/topups/settings.js';
import { cleanReceipt, CloudinaryReceiptStorage } from '../src/topups/receipts.js';

test('quotes use exact integer arithmetic, discounts and whole points', () => {
  assert.deepEqual(calculateQuote(101n, 1500, { points: 3 }), { points: 3, chargePiasters: 258n, requestedAmountPiasters: undefined, unallocatedPiasters: 0n });
  assert.deepEqual(calculateQuote(101n, 1500, { amountPiasters: '300' }), { points: 3, chargePiasters: 258n, requestedAmountPiasters: 300n, unallocatedPiasters: 42n });
  assert.equal(calculateQuote(9007199254740993n, 0, { points: 1 }).chargePiasters, 9007199254740993n);
  assert.throws(() => calculateQuote(100n, 0, { amountPiasters: '1' }));
  assert.throws(() => calculateQuote(9223372036854775807n, 0, { points: 2 }));
});
test('pricing needs explicit settings; selections and approvals reject ambiguous inputs', () => {
  assert.equal(policySchema.safeParse({}).success, false);
  assert.equal(policySchema.safeParse({ expectedVersion: 0, pointPricePiasters: '100', gymDiscountBps: 10000, redemptionBps: 5000 }).success, false);
  assert.equal(quoteSchema.safeParse({ kind: 'TRAINEE', points: 20, amountPiasters: '100' }).success, false);
  assert.equal(quoteSchema.safeParse({ kind: 'BRANCH_STOCK', points: 20 }).success, false);
  assert.equal(reviewSchema.safeParse({ decision: 'APPROVED', reason: 'checked', paymentReference: 'abc', receivedAmountPiasters: '100' }).success, false);
});
test('receipt normalization rejects SVG and corrupt input, removes image metadata', async () => {
  await assert.rejects(cleanReceipt(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>')));
  await assert.rejects(cleanReceipt(Buffer.from('not an image')));
  const data = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).withMetadata().png().toBuffer();
  const normalized = await cleanReceipt(data);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined);
});
test('Cloudinary storage fails closed until credentials are configured', () => {
  const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const before = names.map(n => process.env[n]);
  try { names.forEach(n => delete process.env[n]); assert.throws(() => new CloudinaryReceiptStorage().readUrl('synthetic'), { code: 'STORAGE_NOT_CONFIGURED' }); }
  finally { names.forEach((n, i) => { if (before[i] === undefined) delete process.env[n]; else process.env[n] = before[i]; }); }
});


test('gym purchases are retired even with a valid single destination',()=>{
 const gym='abcdef02-2345-4123-8123-123456789abc',branch='abcdef03-2345-4123-8123-123456789abc';
 assert.equal(quoteSchema.safeParse({kind:'BRANCH_STOCK',receivingGymId:gym,points:10}).success,false);
 assert.equal(quoteSchema.safeParse({kind:'BRANCH_STOCK',receivingGymId:gym,receivingBranchId:branch,points:10}).success,false);
 assert.equal(quoteSchema.safeParse({kind:'TRAINEE',receivingGymId:gym,points:10}).success,false);
});
