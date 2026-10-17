import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, HTTPMethods } from 'fastify';

// Only the trusted web server knows this secret. User sessions are still
// authenticated by the existing API routes after this transport check.
export function createNeonHandler(app: FastifyInstance, secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error('API_ORIGIN_SECRET must contain at least 32 bytes');
  const expected = Buffer.from(secret);
  const failure = (code: string, status: number) => Response.json({ code }, {
    status, headers: { 'cache-control': 'no-store' },
  });
  return {
    async fetch(request: Request): Promise<Response> {
      const provided = Buffer.from(request.headers.get('x-gym-origin-secret') ?? '');
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        return failure('UNAUTHORIZED', 401);
      }
      const url = new URL(request.url);
      if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)) {
        return failure('METHOD_NOT_ALLOWED', 405);
      }
      const max = request.method === 'POST' && url.pathname === '/receipts' ? 5 * 1024 * 1024 : 8192;
      const length = request.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > max)) return failure('BODY_TOO_LARGE', 413);
      let payload: Buffer | undefined;
      if (request.body) {
        const reader = request.body.getReader();
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > max) {
              await reader.cancel();
              return failure('BODY_TOO_LARGE', 413);
            }
            chunks.push(Buffer.from(value));
          }
          payload = Buffer.concat(chunks, size);
        } catch {
          return failure('INVALID_BODY', 400);
        } finally {
          reader.releaseLock();
        }
      }
      // Never derive client IP from caller-supplied forwarding headers. Existing
      // IP throttles conservatively share one key on this server-only hop.
      const headers: Record<string, string> = {};
      for (const name of ['authorization', 'content-type', 'idempotency-key']) {
        const value = request.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      const result = await app.inject({
        method: request.method as HTTPMethods,
        url: url.pathname + url.search,
        headers,
        payload,
        remoteAddress: '127.0.0.1',
      });
      const responseHeaders = new Headers({ 'cache-control': 'no-store' });
      for (const [name, value] of Object.entries(result.headers)) {
        if (value === undefined || ['connection', 'transfer-encoding', 'content-length', 'keep-alive', 'cache-control'].includes(name)) continue;
        for (const item of Array.isArray(value) ? value : [String(value)]) responseHeaders.append(name, item);
      }
      const noBody = request.method === 'HEAD' || [204, 205, 304].includes(result.statusCode);
      return new Response(noBody ? null : new Uint8Array(result.rawPayload), { status: result.statusCode, headers: responseHeaders });
    },
  };
}
