import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {permissions} from '../auth/delegation.js';
import {requireActor} from '../auth/authorization.js';
import {DomainError} from '../domain/errors.js';
import {parse} from './validation.js';
import {audit} from './service.js';
import {serializable} from '../ledger/service.js';
export const delegationSchema=z.object({userId:z.string().uuid(),branchId:z.string().uuid().nullable(),permissions:z.array(z.enum(permissions)).max(permissions.length).refine(v=>!v.includes('TRANSFER_STOCK')),fullAccess:z.boolean(),active:z.boolean(),expectedVersion:z.number().int().min(0)}).strict();
export async function saveDelegation(db:PrismaClient,actorId:string,gymId:string,input:unknown){
 const d=parse(delegationSchema,input);
 return serializable(db,async tx=>{
  await requireActor(tx,actorId);const gym=await tx.gym.findUnique({where:{id:gymId}});
  if(!gym||gym.ownerId!==actorId||!gym.ownerAcceptedAt)throw new DomainError('GYM_ACCESS_DENIED');
  if(d.userId===actorId)throw new DomainError('INVALID_INPUT');
  const target={userId:d.userId,role:'BRANCH_MANAGER' as const,branch:{gymId,...(d.branchId?{id:d.branchId}:{})}};
  const assigned=await tx.staffAssignment.findFirst({where:{...target,active:true}});
  const invited=await tx.staffInvitation.findFirst({where:{userId:d.userId,gymId,role:'BRANCH_MANAGER',type:'STAFF',acceptedAt:null,revokedAt:null,expiresAt:{gt:new Date()},...(d.branchId?{branchId:d.branchId}:{})}});
  if(!assigned&&!invited)throw new DomainError('BRANCH_ACCESS_DENIED');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`delegation:${gymId}:${d.userId}:${d.branchId??'gym'}`},0))`;
  const old=await tx.staffDelegation.findFirst({where:{userId:d.userId,gymId,branchId:d.branchId}});
  if((old?.version??0)!==d.expectedVersion)throw new DomainError('STALE_SETTINGS');
  const data={permissions:[...new Set(d.permissions)].sort(),fullAccess:d.fullAccess,active:d.active,grantedById:actorId,version:d.expectedVersion+1};
  const row=old?await tx.staffDelegation.update({where:{id:old.id},data}):await tx.staffDelegation.create({data:{userId:d.userId,gymId,branchId:d.branchId,...data}});
  await audit(tx,actorId,'STAFF_DELEGATION_CHANGED',row.id,JSON.stringify({userId:d.userId,scope:d.branchId??'GYM',...data}));return row;
 });
}
