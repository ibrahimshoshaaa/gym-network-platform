import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { createNeonHandler } from '../src/neon-handler.js';

const secret = 'test-only-origin-secret-with-at-least-32-bytes';
const headers = { 'x-gym-origin-secret': secret };

test('Neon transport rejects missing/wrong secrets before reading the body or calling routes', async () => {
  const app = Fastify();
  let called = false;
  app.post('/work', () => { called = true; return {}; });
  const handler = createNeonHandler(app, secret);
  assert.throws(() => createNeonHandler(app, ''), /API_ORIGIN_SECRET/);
  for (const value of ['', 'wrong', secret + 'x']) {
    const res = await handler.fetch(new Request('https://api.test/work', {
      method: 'POST', headers: { 'x-gym-origin-secret': value }, body: '{}',
    }));
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }
  assert.equal(called, false);
  await app.close();
});

test('Neon transport preserves method, query, user auth and idempotency but strips origin secrets and IP claims', async () => {
  const app = Fastify({ trustProxy: false });
  app.post('/work', request => ({
    query: request.query, body: request.body, auth: request.headers.authorization,
    key: request.headers['idempotency-key'], ip: request.ip,
    secret: request.headers['x-gym-origin-secret'] ?? null,
    forwarded: request.headers['x-forwarded-for'] ?? null,
  }));
  const handler = createNeonHandler(app, secret);
  const res = await handler.fetch(new Request('https://api.test/work?cursor=abc', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json',
      authorization: 'Bearer user-session', 'idempotency-key': 'command-1', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ value: 2 }),
  }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { query: { cursor: 'abc' }, body: { value: 2 },
    auth: 'Bearer user-session', key: 'command-1', ip: '127.0.0.1', secret: null, forwarded: null });
  await app.close();
});

test('Neon transport caps actual streamed bytes, including absent or false content lengths', async () => {
  const app = Fastify();
  const handler = createNeonHandler(app, secret);
  const variants: Record<string, string>[] = [{}, { 'content-length': '2' }, { 'content-length': '9000' }];
  for (const extra of variants) {
    const res = await handler.fetch(new Request('https://api.test/work', {
      method: 'POST', headers: { ...headers, ...extra }, body: 'x'.repeat(8193),
    }));
    assert.equal(res.status, 413);
  }
  await app.close();
});

test('Neon transport allows bounded binary receipts and returns binary/CSV responses intact', async () => {
  const app = Fastify();
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer' }, (_r, body, done) => done(null, body));
  app.post('/receipts', { bodyLimit: 5 * 1024 * 1024 }, r => ({ bytes: (r.body as Buffer).length }));
  app.get('/export', (_r, reply) => reply.type('text/csv').header('content-disposition', 'attachment; filename=test.csv').send(Buffer.from('name\nجيم\n')));
  const handler = createNeonHandler(app, secret);
  const upload = await handler.fetch(new Request('https://api.test/receipts', {
    method: 'POST', headers: { ...headers, 'content-type': 'image/jpeg' }, body: new Uint8Array(9000),
  }));
  assert.deepEqual(await upload.json(), { bytes: 9000 });
  const csv = await handler.fetch(new Request('https://api.test/export', { headers }));
  assert.equal(await csv.text(), 'name\nجيم\n');
  assert.equal(csv.headers.get('content-disposition'), 'attachment; filename=test.csv');
  assert.equal(csv.headers.get('cache-control'), 'no-store');
  assert.equal(csv.headers.get('content-length'), null);
  await app.close();
});

test('Neon transport handles HEAD, empty 204 and ordinary API errors', async () => {
  const app = Fastify();
  app.get('/health', () => ({ status: 'ok' }));
  app.post('/empty', (_r, reply) => reply.status(204).send());
  const handler = createNeonHandler(app, secret);
  const head = await handler.fetch(new Request('https://api.test/health', { method: 'HEAD', headers }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await handler.fetch(new Request('https://api.test/empty', { method: 'POST', headers }))).status, 204);
  assert.equal((await handler.fetch(new Request('https://api.test/missing', { headers }))).status, 404);
  await app.close();
});
