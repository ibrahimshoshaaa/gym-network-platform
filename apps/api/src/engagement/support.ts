import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@prisma/client';
import { requireActor, requireAdmin } from '../auth/authorization.js';
import { parse } from '../gyms/validation.js';
import { audit } from '../gyms/service.js';
import { serializable } from '../ledger/service.js';
import { DomainError } from '../domain/errors.js';
const uuid=z.string().uuid();
const messageSchema=z.object({body:z.string().trim().min(5).max(3000),receiptId:uuid.optional(),clientKey:uuid}).strict();
const ticketSchema=messageSchema.extend({subject:z.string().trim().min(3).max(150),category:z.enum(['HELP','TOPUP','VISIT','WITHDRAWAL','REFUND','ACCOUNT']),operationId:uuid.optional()});
const pageSchema=z.object({cursor:uuid.optional(),status:z.enum(['OPEN','WAITING_USER','WAITING_ADMIN','CLOSED']).optional(),limit:z.coerce.number().int().min(1).max(50).default(25)}).strict();
export async function ticketAccess(tx:Prisma.TransactionClient,actorId:string,id:string){
 const actor=await requireActor(tx,actorId),ticket=await tx.supportTicket.findUnique({where:{id}});
 if(!ticket || (actor.role!=='PLATFORM_ADMIN' && ticket.userId!==actorId))throw new DomainError('NOT_FOUND');
 return {actor,ticket};
}
async function evidence(tx:Prisma.TransactionClient,actorId:string,id?:string){if(id && !await tx.receiptEvidence.findFirst({where:{id,ownerUserId:actorId}}))throw new DomainError('RECEIPT_ACCESS_DENIED');}
async function reference(tx:Prisma.TransactionClient,actorId:string,id?:string){
 if(!id)return;
 const actor=await requireActor(tx,actorId);
 const scoped=await tx.branch.findMany({where:{OR:[{gym:{ownerId:actorId,ownerAcceptedAt:{not:null}}},{staff:{some:{userId:actorId,active:true}}}]},select:{id:true}});
 const branch={id:{in:scoped.map(b=>b.id)}};
 const admin=actor.role==='PLATFORM_ADMIN';
 if(await tx.topupRequest.findFirst({where:{id,...(!admin?{requestorUserId:actorId}:{})},select:{id:true}}))return;
 if(await tx.visit.findFirst({where:{id,...(!admin?{OR:[{traineeId:actorId},{branch}]}:{})},select:{id:true}}))return;
 if(await tx.pointSale.findFirst({where:{id,...(!admin?{OR:[{traineeId:actorId},{branchId:{in:scoped.map(b=>b.id)}}]}:{})},select:{id:true}}))return;
 if(await tx.withdrawalRequest.findFirst({where:{id,...(!admin?{gym:{ownerId:actorId,ownerAcceptedAt:{not:null}}}:{})},select:{id:true}}))return;
 throw new DomainError('NOT_FOUND');
}
export async function createTicket(db:PrismaClient,actorId:string,input:unknown){
 const d=parse(ticketSchema,input);
 return serializable(db,async tx=>{
  await requireActor(tx,actorId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${d.clientKey},0))`;
  const old=await tx.supportMessage.findUnique({where:{clientKey:d.clientKey},include:{ticket:true}});
  if(old){if(old.authorId!==actorId || old.body!==d.body || old.receiptId!==(d.receiptId??null) || old.ticket.subject!==d.subject || old.ticket.category!==d.category || old.ticket.operationId!==(d.operationId??null))throw new DomainError('IDEMPOTENCY_CONFLICT');return {id:old.ticketId};}
  await evidence(tx,actorId,d.receiptId);await reference(tx,actorId,d.operationId);
  const ticket=await tx.supportTicket.create({data:{userId:actorId,subject:d.subject,category:d.category,operationId:d.operationId,messages:{create:{authorId:actorId,body:d.body,receiptId:d.receiptId,clientKey:d.clientKey}}}});
  await audit(tx,actorId,'SUPPORT_OPENED',ticket.id,'User submitted support case; no financial balances changed');
  return {id:ticket.id};
 });
}
export async function listTickets(db:PrismaClient,actorId:string,input:unknown){const q=parse(pageSchema,input);return db.$transaction(async tx=>{
 const actor=await requireActor(tx,actorId);
 if(q.cursor){const cursor=await ticketAccess(tx,actorId,q.cursor);if(q.status && cursor.ticket.status!==q.status)throw new DomainError('INVALID_INPUT');}
 const rows=await tx.supportTicket.findMany({where:{...(actor.role!=='PLATFORM_ADMIN'?{userId:actorId}:{}),...(q.status?{status:q.status}:{})},orderBy:{id:'desc'},take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),include:{user:{select:{displayName:true,role:true}}}});
 return {items:rows.slice(0,q.limit),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};
});}
export async function ticketDetail(db:PrismaClient,actorId:string,id:string,before?:string){return db.$transaction(async tx=>{
 const {ticket}=await ticketAccess(tx,actorId,id);
 if(before && !await tx.supportMessage.findFirst({where:{id:before,ticketId:id}}))throw new DomainError('INVALID_INPUT');
 const rows=await tx.supportMessage.findMany({where:{ticketId:id},orderBy:[{createdAt:'desc'},{id:'desc'}],take:51,...(before?{cursor:{id:before},skip:1}:{}),select:{id:true,body:true,receiptId:true,createdAt:true,author:{select:{displayName:true,role:true}},authorId:true}});
 return {ticket,items:rows.slice(0,50).reverse(),nextCursor:rows.length>50?rows[49]!.id:null};
});}
export async function replyTicket(db:PrismaClient,actorId:string,id:string,input:unknown){const d=parse(messageSchema,input);return serializable(db,async tx=>{
 await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id=${id}::uuid FOR UPDATE`;
 const {actor,ticket}=await ticketAccess(tx,actorId,id);
 const old=await tx.supportMessage.findUnique({where:{clientKey:d.clientKey}});
 if(old){if(old.ticketId!==id||old.authorId!==actorId||old.body!==d.body||old.receiptId!==(d.receiptId??null))throw new DomainError('IDEMPOTENCY_CONFLICT');return {id:old.id};}
 if(ticket.status==='CLOSED')throw new DomainError('INVALID_STATE');
 await evidence(tx,actorId,d.receiptId);
 const message=await tx.supportMessage.create({data:{ticketId:id,authorId:actorId,...d}});
 await tx.supportTicket.update({where:{id},data:{status:actor.role==='PLATFORM_ADMIN'?'WAITING_USER':'WAITING_ADMIN',updatedAt:new Date()}});
 await audit(tx,actorId,'SUPPORT_REPLIED',id,'Support reply recorded');return {id:message.id};
});}
export async function setTicketStatus(db:PrismaClient,actorId:string,id:string,input:unknown){const d=parse(z.object({status:z.enum(['OPEN','CLOSED']),reason:z.string().trim().min(5).max(1000)}).strict(),input);return serializable(db,async tx=>{
 await tx.$queryRaw`SELECT id FROM "SupportTicket" WHERE id=${id}::uuid FOR UPDATE`;
 const {actor,ticket}=await ticketAccess(tx,actorId,id);
 if(d.status==='OPEN' && actor.role!=='PLATFORM_ADMIN')throw new DomainError('ACCESS_DENIED');
 if(ticket.status===d.status)return {status:d.status};
 await tx.supportMessage.create({data:{ticketId:id,authorId:actorId,body:(d.status==='CLOSED'?'تم إغلاق الطلب: ':'تمت إعادة فتح الطلب: ')+d.reason,clientKey:randomUUID()}});
 await tx.supportTicket.update({where:{id},data:{status:d.status,updatedAt:new Date()}});
 await audit(tx,actorId,'SUPPORT_'+d.status,id,d.reason);return {status:d.status};
});}
export async function setContact(db:PrismaClient,actorId:string,input:unknown){const d=parse(z.object({whatsapp:z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable()}).strict(),input);return serializable(db,async tx=>{await requireAdmin(tx,actorId);const result=await tx.platformContact.upsert({where:{id:'support'},create:{id:'support',...d},update:{...d,updatedAt:new Date()}});await audit(tx,actorId,'SUPPORT_CONTACT_UPDATED',actorId,'Admin updated support contact');return result;});}
