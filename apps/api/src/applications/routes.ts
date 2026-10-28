import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {ownApplication,resubmitApplication,listApplications,reviewApplication} from './service.js';
import {DomainError} from '../domain/errors.js';
export function registerApplicationRoutes(app:FastifyInstance,db:PrismaClient){
 app.post('/auth/owners/register',{bodyLimit:8192,onRequest:async r=>consumeAuthLimit(db,'owner-register-ip',r.ip,5,3600)},async()=>{throw new DomainError('PHONE_VERIFICATION_REQUIRED');});
 app.get('/me/gym-application',async r=>ownApplication(db,await actorId(db,r)));
 app.post('/me/gym-application/resubmit',async r=>{const id=await actorId(db,r);await consumeAuthLimit(db,'owner-resubmit',id,5,3600);return resubmitApplication(db,id,r.body);});
 app.get('/admin/gym-applications',async r=>listApplications(db,await actorId(db,r),r.query));
 app.post('/admin/gym-applications/:id/review',async r=>reviewApplication(db,await actorId(db,r),parse(z.string().uuid(),(r.params as {id:string}).id),r.body));
}
