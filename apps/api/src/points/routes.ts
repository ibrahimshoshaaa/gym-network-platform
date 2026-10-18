import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { DomainError } from '../domain/errors.js';
import { z } from 'zod';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { requireAdmin,requireGymOwner } from '../auth/authorization.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { dispatchPoints,dispatchView,gymWallet,lookup,pointQuote,uuid } from './service.js';
export function registerPointRoutes(app:FastifyInstance,db:PrismaClient){
 for(const admin of [true,false]){const base=admin?'/admin/point-transfers':'/gyms/:gymId/point-transfers';
  for(const step of ['lookup','quotes'] as const)app.post(base+'/'+step,async r=>{const id=await actorId(db,r),gymId=admin?undefined:parse(uuid,(r.params as {gymId:string}).gymId);await consumeAuthLimit(db,'point-'+step,id,step==='lookup'?20:120,900);return db.$transaction(async tx=>step==='lookup'?lookup(tx,id,r.body,gymId):pointQuote(tx,id,r.body,gymId),{isolationLevel:'RepeatableRead'});});
  app.post(base,async(r,reply)=>{const id=await actorId(db,r),gymId=admin?undefined:parse(uuid,(r.params as {gymId:string}).gymId);await consumeAuthLimit(db,'point-dispatch',id,120,3600);return reply.code(201).send(await dispatchPoints(db,id,parse(uuid,r.headers['idempotency-key']),r.body,gymId));});
  app.get(base,async r=>{const id=await actorId(db,r),gymId=admin?undefined:parse(uuid,(r.params as {gymId:string}).gymId),q=parse(z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(25).default(25)}).strict(),r.query);return db.$transaction(async tx=>{if(admin)await requireAdmin(tx,id);else await requireGymOwner(tx,id,gymId!,false);if(q.cursor&&!await tx.pointDispatch.findFirst({where:{id:q.cursor,...(admin?{kind:'ADMIN_TOPUP'}:{gymId})}}))throw new DomainError('INVALID_INPUT');const rows=await tx.pointDispatch.findMany({where:{...(admin?{kind:'ADMIN_TOPUP'}:{gymId}),},orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{})});return {items:rows.slice(0,q.limit).map(dispatchView),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};});});
 }
 app.get('/gyms/:gymId/point-wallet',async r=>{const id=await actorId(db,r),gymId=parse(uuid,(r.params as {gymId:string}).gymId);return db.$transaction(tx=>gymWallet(tx,id,gymId),{isolationLevel:'RepeatableRead'});});
}
