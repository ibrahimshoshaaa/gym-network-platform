import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../dist/app.js';

test('embedded HTTP injection works when synchronous require(ESM) is disabled', async () => {
  const app = buildApp();
  app.post('/compatibility/echo', async request => request.body);
  app.get('/compatibility/binary', async (_request, reply) =>
    reply.type('application/octet-stream').send(Buffer.from([0, 255, 128, 1])));
  try {
    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, 'ok');
    const echo = await app.inject({
      method: 'POST', url: '/compatibility/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ value: 123 }),
    });
    assert.equal(echo.statusCode, 200);
    assert.deepEqual(echo.json(), { value: 123 });
    const binary = await app.inject('/compatibility/binary');
    assert.equal(binary.statusCode, 200);
    assert.deepEqual(binary.rawPayload, Buffer.from([0, 255, 128, 1]));
  } finally {
    await app.close();
  }
});
