import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../auth/authorization.js';
import { serializable } from '../ledger/service.js';
import { DomainError } from '../domain/errors.js';
import { parse } from './validation.js';
import { audit } from './service.js';
const input=z.object({pricingRequestId:z.string().uuid().nullable(),expectedGymUpdatedAt:z.string().datetime(),expectedBranchUpdatedAt:z.string().datetime(),expectedPricingVersion:z.number().int().nonnegative(),mode:z.enum(['APPROVE_AND_ACTIVATE','APPROVE_PRICE']),reviewed:z.literal(true),reason:z.string().trim().min(5).max(1000)}).strict();
export function approveBranchSetup(db:PrismaClient,actorId:string,gymId:string,branchId:string,body:unknown){const data=parse(input,body);return serializable(db,async tx=>{
 await requireAdmin(tx,actorId);
 await tx.$queryRaw`SELECT id FROM "Gym" WHERE id=${gymId}::uuid FOR UPDATE`;
 await tx.$queryRaw`SELECT id FROM "Branch" WHERE id=${branchId}::uuid FOR UPDATE`;
 const gym=await tx.gym.findUnique({where:{id:gymId},include:{owner:true}}),branch=await tx.branch.findUnique({where:{id:branchId}});
 if(!gym||!branch||branch.gymId!==gymId)throw new DomainError('NOT_FOUND');
 if(!gym.ownerAcceptedAt||!gym.owner.isActive)throw new DomainError('BRANCH_NOT_READY');
 if(!['PENDING','ACTIVE'].includes(gym.status))throw new DomainError('GYM_INACTIVE');
 const request=data.pricingRequestId?await tx.branchPricingRequest.findUnique({where:{id:data.pricingRequestId}}):null;
 if(data.pricingRequestId&&(!request||request.branchId!==branchId))throw new DomainError('NOT_FOUND');
 // An already-applied identical decision is safe to retry; never reactivates a suspended branch.
 if(request?.status==='APPROVED'&&request.reviewedById===actorId&&gym.status==='ACTIVE'&&(data.mode==='APPROVE_PRICE'||branch.status==='ACTIVE')&&branch.visitPricePoints===request.visitPricePoints&&branch.sessionMinutes===request.sessionMinutes&&branch.pricingVersion===request.baseVersion+1)return {gymId,branchId,status:branch.status,alreadyApplied:true};
 if(gym.updatedAt.toISOString()!==data.expectedGymUpdatedAt||branch.updatedAt.toISOString()!==data.expectedBranchUpdatedAt||branch.pricingVersion!==data.expectedPricingVersion)throw new DomainError('STALE_PRICE_REQUEST');
 if(request&&(request.status!=='PENDING'||request.baseVersion!==branch.pricingVersion))throw new DomainError('STALE_PRICE_REQUEST');
 if(!request&&await tx.branchPricingRequest.findFirst({where:{branchId,status:'PENDING'}}))throw new DomainError('STALE_PRICE_REQUEST');
 if(data.mode==='APPROVE_PRICE'&&(!request||gym.status!=='ACTIVE'))throw new DomainError('INVALID_STATE');
 if(data.mode==='APPROVE_AND_ACTIVATE'&&(branch.status==='SUSPENDED'||branch.latitude===null||branch.longitude===null||!branch.address||!branch.city||!branch.governorate||(!request&&(!branch.priceApprovedAt||branch.pricingVersion<1))))throw new DomainError('BRANCH_NOT_READY');
 if(gym.status==='PENDING'){
  await tx.gym.update({where:{id:gymId},data:{status:'ACTIVE'}});await audit(tx,actorId,'GYM_ACTIVE',gymId,data.reason);
 }
 if(request){
  await tx.branch.update({where:{id:branchId},data:{visitPricePoints:request.visitPricePoints,sessionMinutes:request.sessionMinutes,pricingVersion:{increment:1},priceApprovedAt:new Date(),priceApprovedById:actorId}});
  await tx.branchPricingRequest.update({where:{id:request.id},data:{status:'APPROVED',reviewedById:actorId,reviewedAt:new Date(),reviewReason:data.reason}});
  await audit(tx,actorId,'PRICE_CHANGE_APPROVED',request.id,data.reason);
 }
 if(data.mode==='APPROVE_AND_ACTIVATE'&&branch.status!=='ACTIVE'){
  await tx.branch.update({where:{id:branchId},data:{status:'ACTIVE'}});await audit(tx,actorId,'BRANCH_ACTIVE',branchId,data.reason);
 }
 return {gymId,branchId,status:data.mode==='APPROVE_AND_ACTIVATE'?'ACTIVE':branch.status,alreadyApplied:false};
});}
