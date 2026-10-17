import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { createNeonHandler } from './neon-handler.js';

// Fail before constructing the application if the trusted server hop is absent.
const secret = process.env.API_ORIGIN_SECRET;
if (!secret || Buffer.byteLength(secret) < 32) throw new Error('API_ORIGIN_SECRET must contain at least 32 bytes');
const db = new PrismaClient();
const app = buildApp(db);
app.addHook('onClose', async () => { await db.$disconnect(); });
export default createNeonHandler(app, secret);
