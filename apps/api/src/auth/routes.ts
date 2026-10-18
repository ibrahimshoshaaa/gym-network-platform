import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { authenticate } from './sessions.js';
import { consumeAuthLimit } from './throttle.js';
import { signIn } from './signin.js';
import { loginAdmin } from './admin.js';
import { loginSchema } from './validation.js';
import { changeTraineePassword, loginTrainee, registerTrainee } from './trainees.js';
import { acceptInvitation, invitationAcceptSchema, loginStaff } from './staff.js';

export function registerTraineeRoutes(app: FastifyInstance, db: PrismaClient) {
  app.post('/auth/signin', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'login-ip', request.ip, 30, 900); },
  }, async request => signIn(db, request.body, request.ip));
  app.post('/auth/admin/login', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'admin-login-ip', request.ip, 20, 900); },
  }, async request => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    await consumeAuthLimit(db, 'admin-login-identity', parsed.data.identifier, 5, 900);
    return loginAdmin(db, parsed.data);
  });
  app.post('/auth/staff/login', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'login-ip', request.ip, 30, 900); },
  }, async request => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    await consumeAuthLimit(db, 'login-identity', parsed.data.identifier, 10, 900);
    return loginStaff(db, parsed.data);
  });
  app.post('/auth/invitations/accept', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'invite-ip', request.ip, 20, 900); },
  }, async request => {
    const parsed = invitationAcceptSchema.safeParse(request.body);
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    await consumeAuthLimit(db, 'invite-token', parsed.data.token, 10, 900);
    return acceptInvitation(db, parsed.data);
  });
  app.post('/auth/register', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'register-ip', request.ip, 5, 3600); },
  }, async (request, reply) => reply.code(201).send(await registerTrainee(db, request.body)));

  app.post('/auth/login', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'login-ip', request.ip, 30, 900); },
  }, async request => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new DomainError('INVALID_INPUT');
    await consumeAuthLimit(db, 'login-identity', parsed.data.identifier, 10, 900);
    return loginTrainee(db, parsed.data);
  });

  app.post('/auth/password/change', {
    bodyLimit: 8192,
    onRequest: async request => { await consumeAuthLimit(db, 'password-ip', request.ip, 10, 900); },
  }, async request => {
    const user = await authenticate(db, request.headers.authorization);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    await consumeAuthLimit(db, 'password-user', user.id, 5, 900);
    return changeTraineePassword(db, user.id, request.headers.authorization!.slice(7), request.body);
  });
}
