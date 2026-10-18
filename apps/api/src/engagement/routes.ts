import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { requireAdmin, requireActor } from '../auth/authorization.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { createTicket,listTickets,ticketDetail,replyTicket,setTicketStatus,setContact } from './support.js';
import { notificationFeed,readNotifications,homeSummary } from './feed.js';
import { listUsers,changeUserAccess,issueRecovery,completeRecovery } from './accounts.js';
export function registerEngagementRoutes(app:FastifyInstance,db:PrismaClient){
 app.get('/public/support-contact',async(_r,reply)=>{reply.header('Cache-Control','no-store');return {whatsapp:(await db.platformContact.findUnique({where:{id:'support'}}))?.whatsapp??null};});
 const id=(p:unknown,key='id')=>parse(z.string().uuid(),(p as Record<string,string>)[key]);
 app.get('/support/tickets',async r=>listTickets(db,await actorId(db,r),r.query));
 app.post('/support/tickets',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'support-create',actor,10,3600);return createTicket(db,actor,r.body);});
 app.get('/support/tickets/:id',async r=>{const q=parse(z.object({before:z.string().uuid().optional()}).strict(),r.query);return ticketDetail(db,await actorId(db,r),id(r.params),q.before);});
 app.post('/support/tickets/:id/messages',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'support-reply',actor,60,3600);return replyTicket(db,actor,id(r.params),r.body);});
 app.post('/support/tickets/:id/status',async r=>setTicketStatus(db,await actorId(db,r),id(r.params),r.body));
 app.get('/support/contact',async r=>{await requireActor(db,await actorId(db,r));return {whatsapp:(await db.platformContact.findUnique({where:{id:'support'}}))?.whatsapp??null};});
 app.put('/admin/support-contact',async r=>setContact(db,await actorId(db,r),r.body));
 app.get('/notifications',async r=>notificationFeed(db,await actorId(db,r)));
 app.post('/notifications/read',async r=>readNotifications(db,await actorId(db,r),r.body));
 app.get('/home-summary',async r=>homeSummary(db,await actorId(db,r)));
 app.get('/admin/users',async r=>listUsers(db,await actorId(db,r),r.query));
 for(const action of ['access','recovery'] as const){const method=action==='access'?'patch':'post';app[method](`/admin/users/:id/${action}`,async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'account-admin',actor,10,900);return action==='access'?changeUserAccess(db,actor,id(r.params),r.body):issueRecovery(db,actor,id(r.params),r.body);});}
 app.post('/auth/recovery/complete',{onRequest:async r=>{await consumeAuthLimit(db,'recovery-ip',r.ip,10,900);}},async r=>completeRecovery(db,r.body));
 app.get('/admin/wallet-expiry',async r=>{await requireAdmin(db,await actorId(db,r));const q=parse(z.object({cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(25).default(25)}).strict(),r.query);const rows=await db.pointAccount.findMany({where:{type:'TRAINEE_WALLET',balance:{gt:0},OR:[{expiresAt:{lte:new Date()}},{expiresAt:null}]},orderBy:{id:'asc'},take:26,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),select:{id:true,balance:true,expiresAt:true,ownerUser:{select:{id:true,displayName:true,phoneE164:true}}}});return {items:rows.slice(0,25),nextCursor:rows.length>25?rows[24]!.id:null};});
 app.get('/admin/audit',async r=>{await requireAdmin(db,await actorId(db,r));const q=parse(z.object({cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(25).default(25),entityId:z.string().uuid().optional()}).strict(),r.query);const rows=await db.auditLog.findMany({where:q.entityId?{entityId:q.entityId}:{},orderBy:[{createdAt:'desc'},{id:'desc'}],take:26,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),select:{id:true,actorId:true,action:true,entityId:true,reason:true,createdAt:true}});return {items:rows.slice(0,25),nextCursor:rows.length>25?rows[24]!.id:null};});
 app.patch('/me/profile',async r=>{const actor=await actorId(db,r);const d=parse(z.object({displayName:z.string().trim().min(2).max(100)}).strict(),r.body);return db.user.update({where:{id:actor},data:d,select:{id:true,displayName:true}});});
}
