import assert from 'node:assert/strict';
import test from 'node:test';
import { branchCreateSchema, branchUpdateSchema, gymCreateSchema, staffInviteSchema } from '../src/gyms/validation.js';

test('branch and staff commands reject ownership/status/approval injection and malformed terms', () => {
  const branch = { name: 'Test branch', address: 'Test address', governorate: 'Menofia', city: 'Test city', latitude: 30.5, longitude: 31, visitPricePoints: 25, sessionMinutes: 120 };
  assert.equal(branchCreateSchema.safeParse(branch).success, true);
  for (const extra of [{ status: 'ACTIVE' }, { priceApprovedAt: new Date() }, { visitPricePoints: 0 }, { sessionMinutes: -1 }, { latitude: 91 }, { longitude: 181 }]) assert.equal(branchCreateSchema.safeParse({ ...branch, ...extra }).success, false);
  assert.equal(branchUpdateSchema.safeParse({ latitude: 30 }).success, false);
  assert.equal(branchUpdateSchema.safeParse({ visitPricePoints: 1 }).success, false);
  assert.equal(staffInviteSchema.safeParse({ branchId: '00000000-0000-4000-8000-000000000001', role: 'PLATFORM_ADMIN', contact: { displayName: 'Person', email: 'person@example.test', phone: '01012345678' } }).success, false);
});

test('gym creation requires exactly one owner source', () => {
  const owner = { displayName: 'Owner', email: 'owner@example.test', phone: '01012345678' };
  assert.equal(gymCreateSchema.safeParse({ name: 'Gym', owner }).success, true);
  assert.equal(gymCreateSchema.safeParse({ name: 'Gym' }).success, false);
  assert.equal(gymCreateSchema.safeParse({ name: 'Gym', owner, ownerId: '00000000-0000-4000-8000-000000000001' }).success, false);
});
