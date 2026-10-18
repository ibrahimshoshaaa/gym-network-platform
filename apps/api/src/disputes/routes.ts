import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {createHold,releaseHold,listHolds} from './service.js';
export function registerDisputeRoutes(app:FastifyInstance,db:PrismaClient){app.get('/disputes',async r=>listHolds(db,await actorId(db,r),r.query));app.post('/admin/disputes',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'dispute-admin',actor,30,3600);return createHold(db,actor,r.body);});app.post('/admin/disputes/:id/release',async r=>releaseHold(db,await actorId(db,r),parse(z.string().uuid(),(r.params as {id:string}).id),r.body));}
