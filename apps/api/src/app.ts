import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: true, trustProxy: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'gym-network-api',
    version: '0.1.0',
  }));

  // No authenticated or financial endpoints until role guards, idempotency,
  // posting rules and transaction tests are implemented.
  return app;
}
