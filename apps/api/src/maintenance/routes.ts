import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {DomainError} from '../domain/errors.js';
import {CloudinaryBusinessStorage,type BusinessStorage} from '../media/service.js';
import {availableBranches} from './access.js';
import {statuses} from './validation.js';
import {createRequest,listRequests,detail,changeRequest,uploadImage} from './service.js';
export function registerMaintenanceRoutes(app:FastifyInstance,db:PrismaClient,storage:BusinessStorage=new CloudinaryBusinessStorage()){
 const id=(p:unknown)=>parse(z.object({id:z.string().uuid()}).strict(),p).id;
 app.get('/maintenance/branches',async r=>({items:await availableBranches(db,await actorId(db,r)),statuses}));
 app.get('/maintenance/requests',async r=>listRequests(db,await actorId(db,r),r.query));
 app.get('/maintenance/requests/:id',async r=>detail(db,await actorId(db,r),id(r.params)));
 app.post('/maintenance/requests',{bodyLimit:24*1024},async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'maintenance-create',actor,15,3600);return createRequest(db,actor,r.body);});
 app.post('/maintenance/requests/:id/action',{bodyLimit:24*1024},async r=>changeRequest(db,await actorId(db,r),id(r.params),r.body));
 app.post('/maintenance/branches/:id/assets',{bodyLimit:4*1024*1024},async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'maintenance-image',actor,20,3600);if(!Buffer.isBuffer(r.body))throw new DomainError('INVALID_RECEIPT');return uploadImage(db,storage,actor,id(r.params),r.body);});
 app.get('/admin/maintenance/requests',async r=>listRequests(db,await actorId(db,r),r.query,true));
 app.post('/admin/maintenance/requests/:id/action',{bodyLimit:24*1024},async r=>changeRequest(db,await actorId(db,r),id(r.params),r.body,true));
}
