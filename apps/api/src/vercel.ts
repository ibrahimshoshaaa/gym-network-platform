import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';

// One client and Fastify instance per warm function, never one per request.
const secret = process.env.API_ORIGIN_SECRET;
if (!secret || secret.length < 64) throw new Error('API_ORIGIN_SECRET must contain at least 64 characters');
const expected = Buffer.from(secret);
const db = new PrismaClient();
const app = buildApp(db);
const ready = app.ready();

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const raw = req.headers['x-gym-origin-secret'];
  const supplied = Buffer.from(typeof raw === 'string' ? raw : '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ code: 'UNAUTHENTICATED' }));
    return;
  }
  delete req.headers['x-gym-origin-secret'];
  await ready;
  app.server.emit('request', req, res);
}
