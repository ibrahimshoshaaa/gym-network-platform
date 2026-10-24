import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { actorId } from '../gyms/routes.js';
import { requireAdmin } from '../auth/authorization.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { parse } from '../gyms/validation.js';
import { DomainError } from '../domain/errors.js';
import { adminDeletions,cancelDeletion,deletionReceipt,deletionStatus,processDeletion,publicDeletion,publicCancelDeletion,requestDeletion } from './deletion.js';
export function registerDeletionRoutes(app:FastifyInstance,db:PrismaClient){
 app.get('/me/account-deletion',async r=>deletionStatus(db,await actorId(db,r)));
 app.post('/me/account-deletion',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'deletion-user',actor,5,900);return requestDeletion(db,actor,r.body);});
 app.post('/me/account-deletion/cancel',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'deletion-user',actor,5,900);return cancelDeletion(db,actor,r.body);});
 app.post('/auth/account-deletion',{onRequest:async r=>{await consumeAuthLimit(db,'deletion-ip',r.ip,10,900);}},async r=>publicDeletion(db,r.body));
 app.post('/auth/account-deletion/cancel',{onRequest:async r=>{await consumeAuthLimit(db,'deletion-ip',r.ip,10,900);}},async r=>publicCancelDeletion(db,r.body));
 app.post('/auth/account-deletion/status',{onRequest:async r=>{await consumeAuthLimit(db,'deletion-status-ip',r.ip,60,900);}},async r=>{const d=parse(z.object({requestKey:z.string().uuid()}).strict(),r.body);return deletionReceipt(db,d.requestKey);});
 app.get('/admin/account-deletions',async r=>adminDeletions(db,await actorId(db,r),r.query));
 app.get('/admin/account-deletions/:id',async r=>{
  await requireAdmin(db,await actorId(db,r));const id=parse(z.string().uuid(),(r.params as {id:string}).id),row=await db.accountDeletion.findUnique({where:{id},select:{userId:true}});
  if(!row)throw new DomainError('NOT_FOUND');return {...await deletionStatus(db,row.userId),user:await db.user.findUnique({where:{id:row.userId},select:{id:true,displayName:true,phoneE164:true,email:true,role:true}}),gyms:await db.gym.findMany({where:{ownerId:row.userId},select:{id:true,name:true,status:true}})};
 });
 app.post('/admin/account-deletions/:id/process',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'deletion-admin',actor,10,900);return processDeletion(db,actor,parse(z.string().uuid(),(r.params as {id:string}).id),r.body);});
}
