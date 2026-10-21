import type {Prisma} from '@prisma/client';
import {requireActor} from '../auth/authorization.js';
import {authority} from '../auth/delegation.js';
import {DomainError} from '../domain/errors.js';
type Tx=Prisma.TransactionClient;
/** Roles alone never grant access to a gym or permission to accept a repair bill. */
export async function branchAccess(tx:Tx,actor:string,id:string){
 const user=await requireActor(tx,actor);
 const branch=await tx.branch.findUnique({where:{id},include:{gym:{include:{owner:{select:{isActive:true}}}}}});
 if(!branch)throw new DomainError('NOT_FOUND');
 if(user.role==='PLATFORM_ADMIN')return {branch,admin:true,canApprove:false};
 if(!branch.gym.ownerAcceptedAt||!branch.gym.owner.isActive)throw new DomainError('BRANCH_ACCESS_DENIED');
 if(branch.gym.ownerId===actor)return {branch,admin:false,canApprove:true};
 if(branch.gym.status!=='ACTIVE'||branch.status!=='ACTIVE')throw new DomainError('BRANCH_ACCESS_DENIED');
 const a=await authority(tx,actor,branch.gymId,id);
 const assignment=await tx.staffAssignment.findFirst({where:{userId:actor,branchId:id,active:true}});
 if(!assignment&&!a.full)throw new DomainError('BRANCH_ACCESS_DENIED');
 const fullBranch=assignment?.role==='BRANCH_MANAGER'&&await tx.staffDelegation.findFirst({where:{userId:actor,gymId:branch.gymId,branchId:id,active:true,fullAccess:true}});
 return {branch,admin:false,canApprove:a.full||Boolean(fullBranch)};
}
export async function availableBranches(tx:Tx,actor:string){
 const user=await requireActor(tx,actor);
 if(user.role==='PLATFORM_ADMIN')throw new DomainError('ACCESS_DENIED');
 const assignments=await tx.staffAssignment.findMany({where:{userId:actor,active:true},select:{branchId:true,role:true,branch:{select:{gymId:true}}}});
 const grants=await tx.staffDelegation.findMany({where:{userId:actor,active:true,fullAccess:true},select:{gymId:true,branchId:true}});
 const managerGyms=new Set(assignments.filter(a=>a.role==='BRANCH_MANAGER').map(a=>a.branch.gymId));
 const globalGyms=grants.filter(g=>g.branchId===null&&managerGyms.has(g.gymId)).map(g=>g.gymId);
 const candidates=await tx.branch.findMany({where:{OR:[{gym:{ownerId:actor}},{id:{in:assignments.map(a=>a.branchId)}},{gymId:{in:globalGyms}}]},orderBy:[{name:'asc'},{id:'asc'}],select:{id:true,name:true,gymId:true,status:true,gym:{select:{name:true,ownerId:true,ownerAcceptedAt:true,status:true,owner:{select:{isActive:true}}}}}});
 return candidates.filter(b=>b.gym.ownerAcceptedAt&&b.gym.owner.isActive&&(b.gym.ownerId===actor||(b.status==='ACTIVE'&&b.gym.status==='ACTIVE'))).map(b=>({id:b.id,name:b.name,gymId:b.gymId,gymName:b.gym.name,canApprove:b.gym.ownerId===actor||globalGyms.includes(b.gymId)||Boolean(assignments.some(a=>a.branchId===b.id&&a.role==='BRANCH_MANAGER')&&grants.some(g=>g.branchId===b.id&&g.gymId===b.gymId))}));
}
