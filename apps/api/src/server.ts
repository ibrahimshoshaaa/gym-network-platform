import { buildApp } from './app.js';
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const app = buildApp(db);
app.addHook('onClose', async () => { await db.$disconnect(); });
const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

