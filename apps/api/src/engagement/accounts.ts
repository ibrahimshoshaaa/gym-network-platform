import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../auth/authorization.js';
import { hashPassword, verifyPassword } from '../auth/passwords.js';
import { hashToken } from '../auth/sessions.js';
import { newPasswordSchema } from '../auth/validation.js';
import { audit } from '../gyms/service.js';
import { parse } from '../gyms/validation.js';
import { serializable } from '../ledger/service.js';
import { DomainError } from '../domain/errors.js';
const operator=z.object({password:z.string().min(1).max(256),reason:z.string().trim().min(5).max(1000)});
async function verifiedAdmin(db:PrismaClient,actorId:string,password:string){
 const actor=await requireAdmin(db,actorId),credential=await db.userPassword.findUnique({where:{userId:actor.id}});
 if(!await verifyPassword(password,credential?.passwordHash))throw new DomainError('INVALID_CREDENTIALS');
 return credential!.passwordHash;
}
export async function listUsers(db:PrismaClient,actorId:string,input:unknown){await requireAdmin(db,actorId);const q=parse(z.object({q:z.string().trim().max(150).optional(),role:z.enum(['GYM_OWNER','BRANCH_MANAGER','CASHIER','TRAINEE','PLATFORM_ADMIN']).optional(),active:z.enum(['true','false']).optional(),cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(50).default(25)}).strict(),input);
 const rows=await db.user.findMany({where:{...(q.q?{OR:[{displayName:{contains:q.q,mode:'insensitive' as const}},{email:{contains:q.q,mode:'insensitive' as const}},{phoneE164:{contains:q.q}}]}:{}),...(q.role?{role:q.role}:{}),...(q.active?{isActive:q.active==='true'}:{})},orderBy:{id:'asc'},take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),select:{id:true,displayName:true,email:true,phoneE164:true,role:true,isActive:true,createdAt:true,_count:{select:{sessions:{where:{revokedAt:null,expiresAt:{gt:new Date()}}}}}}});
 return {items:rows.slice(0,q.limit),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};
}
export async function changeUserAccess(db:PrismaClient,actorId:string,id:string,input:unknown){const d=parse(operator.extend({active:z.boolean()}).strict(),input);const hash=await verifiedAdmin(db,actorId,d.password);return serializable(db,async tx=>{
 await requireAdmin(tx,actorId);await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
 if((await tx.userPassword.findUnique({where:{userId:actorId}}))?.passwordHash!==hash)throw new DomainError('INVALID_CREDENTIALS');
 const target=await tx.user.findUnique({where:{id},include:{password:true}});
 if(!target)throw new DomainError('NOT_FOUND');
 if(target.role==='PLATFORM_ADMIN'||(!target.password && d.active))throw new DomainError('ACCESS_DENIED');
 await tx.user.update({where:{id},data:{isActive:d.active}});
 if(!d.active){await tx.authSession.updateMany({where:{userId:id,revokedAt:null},data:{revokedAt:new Date()}});await tx.accountRecovery.updateMany({where:{userId:id,usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});}
 await audit(tx,actorId,d.active?'USER_ENABLED':'USER_DISABLED',id,d.reason);return {id,isActive:d.active};
});}
export async function issueRecovery(db:PrismaClient,actorId:string,id:string,input:unknown){const d=parse(operator.extend({identityVerified:z.literal(true)}).strict(),input);const hash=await verifiedAdmin(db,actorId,d.password),token=randomBytes(32).toString('base64url');return serializable(db,async tx=>{
 await requireAdmin(tx,actorId);await tx.$queryRaw`SELECT id FROM "User" WHERE id=${id}::uuid FOR UPDATE`;
 if((await tx.userPassword.findUnique({where:{userId:actorId}}))?.passwordHash!==hash)throw new DomainError('INVALID_CREDENTIALS');
 const user=await tx.user.findUnique({where:{id},include:{password:true}});
 if(!user?.isActive||!user.password||user.role==='PLATFORM_ADMIN')throw new DomainError('ACCESS_DENIED');
 await tx.accountRecovery.updateMany({where:{userId:id,usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
 const expiresAt=new Date(Date.now()+30*60000);
 const recovery=await tx.accountRecovery.create({data:{userId:id,issuedById:actorId,tokenHash:hashToken(token),expiresAt}});
 await audit(tx,actorId,'RECOVERY_ISSUED',recovery.id,d.reason);return {token,expiresAt};
});}
export async function completeRecovery(db:PrismaClient,input:unknown){const d=parse(z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),password:newPasswordSchema}).strict(),input);const passwordHash=await hashPassword(d.password);return serializable(db,async tx=>{
 const found=await tx.accountRecovery.findUnique({where:{tokenHash:hashToken(d.token)}});
 if(!found)throw new DomainError('RECOVERY_INVALID');
 await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.userId}::uuid FOR UPDATE`;
 const row=await tx.accountRecovery.findUniqueOrThrow({where:{id:found.id}}),user=await tx.user.findUniqueOrThrow({where:{id:row.userId}});
 if(row.usedAt||row.revokedAt||row.expiresAt<=new Date()||!user.isActive||user.role==='PLATFORM_ADMIN')throw new DomainError('RECOVERY_INVALID');
 const issuer=await tx.user.findUnique({where:{id:row.issuedById}});if(!issuer?.isActive||issuer.role!=='PLATFORM_ADMIN')throw new DomainError('RECOVERY_INVALID');
 await tx.userPassword.update({where:{userId:user.id},data:{passwordHash}});
 await tx.accountRecovery.update({where:{id:row.id},data:{usedAt:new Date()}});
 await tx.accountRecovery.updateMany({where:{userId:user.id,id:{not:row.id},usedAt:null,revokedAt:null},data:{revokedAt:new Date()}});
 await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
 await audit(tx,user.id,'ACCOUNT_RECOVERED',row.id,'One-time admin-issued recovery completed; previous sessions revoked');return {recovered:true};
});}
