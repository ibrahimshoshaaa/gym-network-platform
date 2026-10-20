import type {Prisma} from '@prisma/client';
import {DomainError} from '../domain/errors.js';
export const permissions=['MANAGE_CASHIERS','EDIT_BRANCH','REQUEST_PRICING','REQUEST_WITHDRAWAL','TRANSFER_STOCK'] as const;
export type Permission=typeof permissions[number];
/** Live grants never replace membership or the owner's active status. */
export async function authority(tx:Prisma.TransactionClient,userId:string,gymId:string,branchId?:string){
 const gym=await tx.gym.findUnique({where:{id:gymId},include:{owner:{select:{isActive:true}}}});
 if(!gym||!gym.ownerAcceptedAt||!gym.owner.isActive)throw new DomainError('GYM_ACCESS_DENIED');
 if(gym.ownerId===userId)return {gym,owner:true,full:true,permissions:[...permissions]};
 const manager=await tx.staffAssignment.findFirst({where:{userId,active:true,role:'BRANCH_MANAGER',branch:{gymId}}});
 if(!manager)return {gym,owner:false,full:false,permissions:[] as Permission[]};
 const grants=await tx.staffDelegation.findMany({where:{userId,gymId,active:true,OR:[{branchId:null},...(branchId?[{branchId}]:[])]}});
 const local=branchId?await tx.staffAssignment.findFirst({where:{userId,branchId,active:true,role:'BRANCH_MANAGER'}}):null;
 const usable=grants.filter(g=>g.branchId===null||Boolean(local));
 const full=usable.some(g=>g.branchId===null&&g.fullAccess);
 return {gym,owner:false,full,permissions:full?[...permissions]:[...new Set(usable.flatMap(g=>g.fullAccess?[...permissions]:g.permissions.filter((p):p is Permission=>permissions.includes(p as Permission))))]};
}
export async function requirePermission(tx:Prisma.TransactionClient,userId:string,gymId:string,permission:Permission,branchId?:string){
 const actor=await tx.user.findUnique({where:{id:userId}});if(!actor?.isActive)throw new DomainError('ACCESS_DENIED');
 const a=await authority(tx,userId,gymId,branchId);
 if(!a.owner&&(!a.permissions.includes(permission)||a.gym.status!=='ACTIVE'))throw new DomainError('BRANCH_ACCESS_DENIED');
 if(branchId&&!await tx.branch.findFirst({where:{id:branchId,gymId,...(a.owner||a.full?{}:{status:{not:'SUSPENDED'}})}}))throw new DomainError('BRANCH_ACCESS_DENIED');
 return a;
}
