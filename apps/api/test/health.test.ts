import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../src/app.js';

test('health responds and ledger/OTP routes remain unavailable', async () => {
  const app = buildApp();
  try {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, 'ok');
    for (const url of ['/admin/ledger', '/auth/otp/verify', '/branches/example/point-sales']) {
      assert.equal((await app.inject({ method: 'POST', url })).statusCode, 404);
    }
  } finally { await app.close(); }
});
