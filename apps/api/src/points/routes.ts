import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {requireAdmin} from '../auth/authorization.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {DomainError} from '../domain/errors.js';
import {dispatchPoints,dispatchView,lookup,pointQuote,uuid} from './service.js';
export function registerPointRoutes(app:FastifyInstance,db:PrismaClient){
 const base='/admin/point-transfers';
 for(const step of ['lookup','quotes'] as const)app.post(base+'/'+step,async r=>{
  const id=await actorId(db,r);await consumeAuthLimit(db,'point-'+step,id,step==='lookup'?20:120,900);
  return db.$transaction(async tx=>step==='lookup'?lookup(tx,id,r.body):pointQuote(tx,id,r.body),{isolationLevel:'RepeatableRead'});
 });
 app.post(base,async(r,reply)=>{
  const id=await actorId(db,r);await consumeAuthLimit(db,'point-dispatch',id,120,3600);
  return reply.code(201).send(await dispatchPoints(db,id,parse(uuid,r.headers['idempotency-key']),r.body));
 });
 app.get(base,async r=>{
  const id=await actorId(db,r),q=parse(z.object({cursor:uuid.optional(),limit:z.coerce.number().int().min(1).max(25).default(25)}).strict(),r.query);
  return db.$transaction(async tx=>{
   await requireAdmin(tx,id);
   if(q.cursor&&!await tx.pointDispatch.findFirst({where:{id:q.cursor,kind:'ADMIN_TOPUP'}}))throw new DomainError('INVALID_INPUT');
   const rows=await tx.pointDispatch.findMany({where:{kind:'ADMIN_TOPUP'},orderBy:[{createdAt:'desc'},{id:'desc'}],take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{})});
   return {items:rows.slice(0,q.limit).map(dispatchView),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};
  });
 });
}
