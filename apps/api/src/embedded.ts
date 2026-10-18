import { PrismaClient } from '@prisma/client';
import type { HTTPMethods } from 'fastify';
import { buildApp } from './app.js';

let app: ReturnType<typeof buildApp> | undefined;
function backend() {
  if (!app) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    app = buildApp(new PrismaClient());
  }
  return app;
}

// Server-only entrypoint. The Next.js gateway still owns CSRF, cookies,
// the path allowlist and bounded request bodies. Fastify retains user auth.
export async function internalRequest(path: string, init: {
  method?: string;
  headers: Record<string, string>;
  body?: Uint8Array | string;
}) {
  if (!/^[a-z][a-z0-9/-]*(?:\?.*)?$/.test(path) || path.includes('..')) {
    throw new Error('Invalid internal API path');
  }
  const headers = { ...init.headers };
  delete headers['x-gym-origin-secret'];
  const result = await backend().inject({
    method: (init.method ?? 'GET') as HTTPMethods,
    url: '/' + path,
    headers,
    ...(init.body !== undefined ? { payload: typeof init.body === 'string' ? init.body : Buffer.from(init.body) } : {}),
    remoteAddress: '127.0.0.1',
  });
  const output = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value !== undefined && !['content-length', 'transfer-encoding', 'connection'].includes(key)) {
      output.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
  }
  output.set('cache-control', 'no-store');
  return new Response([204, 205, 304].includes(result.statusCode) ? null : new Uint8Array(result.rawPayload), {
    status: result.statusCode,
    headers: output,
  });
}
