import type { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { createNeonHandler } from './neon-handler.js';

// Fail before constructing the application if the trusted server hop is absent.
const secret = process.env.API_ORIGIN_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) throw new Error('API_ORIGIN_SECRET must contain at least 32 bytes');
// The deployment builder supplies an isolated Prisma JS client with its pg
// adapter. The regular local/TCP Prisma client and migrations stay unchanged.
export function buildNeonApp(db: PrismaClient) {
  const app = buildApp(db);
  app.addHook('onClose', async () => { await db.$disconnect(); });
  return createNeonHandler(app, secret!);
}
