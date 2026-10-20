import test from 'node:test';
import assert from 'node:assert/strict';
import { allocatePoints, bookingPolicySchema, cancellationDeadline, isWithinGrace, noShowDecision, snapshotPolicy } from '../src/bookings/policy.js';

test('grace starts at scheduled visit, including the exact boundary', () => {
  const scheduled = new Date('2026-10-20T18:00:00Z');
  const policy = { graceMinutes: 60, mode: 'MANUAL' };
  assert.equal(cancellationDeadline(scheduled, policy).toISOString(), '2026-10-20T19:00:00.000Z');
  assert.equal(isWithinGrace(scheduled, new Date('2026-10-20T19:00:00Z'), policy), true);
  assert.equal(isWithinGrace(scheduled, new Date('2026-10-20T19:00:00.001Z'), policy), false);
});
test('manual no-show leaves the entire allocation undecided', () => {
  assert.deepEqual(noShowDecision(100, { graceMinutes: 60, mode: 'MANUAL' }), { status: 'PENDING_REVIEW' });
});
test('automatic policies support refunds, gym payment and both agreed splits', () => {
  for (const [traineeBps, gymBps, platformBps] of [[10000,0,0],[0,10000,0],[5000,5000,0],[0,5000,5000]]) {
    const result = noShowDecision(100, { graceMinutes: 60, mode: 'AUTOMATIC', allocation: { traineeBps, gymBps, platformBps } });
    assert.deepEqual(result, { status: 'ALLOCATED', traineePoints: traineeBps! / 100, gymPoints: gymBps! / 100, platformPoints: platformBps! / 100 });
  }
});
test('whole point rounding never loses points or pays zero-share parties', () => {
  for (let points = 1; points <= 101; points++) {
    const result = allocatePoints(points, { traineeBps: 0, gymBps: 5000, platformBps: 5000 });
    assert.equal(result.traineePoints, 0);
    assert.equal(result.gymPoints + result.platformPoints, points);
  }
  assert.deepEqual(allocatePoints(1, { traineeBps: 5000, gymBps: 5000, platformBps: 0 }), { traineePoints: 1, gymPoints: 0, platformPoints: 0 });
});
test('invalid policy and point values are rejected', () => {
  for (const allocation of [{traineeBps:5000,gymBps:6000,platformBps:0},{traineeBps:-1,gymBps:10001,platformBps:0}]) {
    assert.equal(bookingPolicySchema.safeParse({ graceMinutes:60,mode:'AUTOMATIC',allocation }).success,false);
  }
  assert.equal(bookingPolicySchema.safeParse({graceMinutes:60,mode:'AUTOMATIC'}).success,false);
  assert.equal(bookingPolicySchema.safeParse({graceMinutes:-1,mode:'MANUAL'}).success,false);
  assert.throws(() => allocatePoints(1.5,{traineeBps:10000,gymBps:0,platformBps:0}));
});
test('snapshot is detached from subsequent policy edits', () => {
  const input = {graceMinutes:60,mode:'AUTOMATIC',allocation:{traineeBps:5000,gymBps:5000,platformBps:0}};
  const snapshot = snapshotPolicy(input);
  input.graceMinutes=120; input.allocation.traineeBps=0;
  assert.equal(snapshot.graceMinutes,60);
  assert.equal(snapshot.mode === 'AUTOMATIC' && snapshot.allocation.traineeBps,5000);
});
