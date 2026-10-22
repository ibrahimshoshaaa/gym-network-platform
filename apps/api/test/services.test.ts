import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceInput, serviceChangeInput, serviceReviewInput } from '../src/services/validation.js';

test('service proposals reject invalid prices, durations and publication/approval injection', () => {
  const body = { name: 'كارديو', points: 15, durationMinutes: 30, reason: 'إضافة خدمة الكارديو' };
  assert.equal(serviceInput.parse(body).description, '');
  for (const patch of [{ points: 0 }, { points: 1.5 }, { points: 1000001 }, { durationMinutes: 0 }, { durationMinutes: 1441 }, { active: true }, { approvedAt: new Date().toISOString() }, { branchId: 'foreign' }, { name: ' ' }]) {
    assert.equal(serviceInput.safeParse({ ...body, ...patch }).success, false);
  }
  assert.equal(serviceChangeInput.safeParse(body).success, false);
  assert.equal(serviceChangeInput.safeParse({ ...body, expectedVersion: 0 }).success, true);
  assert.equal(serviceReviewInput.safeParse({ decision: 'APPROVED', expectedVersion: 0, reason: 'تمت مراجعة السعر', points: 1 }).success, false);
});
