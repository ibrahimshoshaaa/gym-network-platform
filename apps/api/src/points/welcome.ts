import type {Prisma,PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {requireAdmin} from '../auth/authorization.js';
import {DomainError} from '../domain/errors.js';
import {parse} from '../gyms/validation.js';
import {serializable,postInTransaction} from '../ledger/service.js';

export const welcomeSchema=z.object({expectedVersion:z.number().int().min(0).max(2147483646),enabled:z.boolean(),points:z.number().int().min(0).max(100000)}).strict().refine(v=>!v.enabled||v.points>0);
export async function welcomeSettings(tx:Prisma.TransactionClient){
 const row=await tx.welcomePointsPolicy.findUnique({where:{id:'default'}});
 return row?{version:row.version,enabled:row.enabled,points:row.points}:{version:0,enabled:false,points:0};
}
export function saveWelcomeSettings(db:PrismaClient,actorId:string,input:unknown){
 const d=parse(welcomeSchema,input);
 return serializable(db,async tx=>{
  await requireAdmin(tx,actorId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('welcome-points-policy',0))`;
  if(d.enabled&&!await tx.pricingPolicy.findFirst())throw new DomainError('PRICING_NOT_CONFIGURED');
  const current=await welcomeSettings(tx);
  if(current.version!==d.expectedVersion)throw new DomainError('STALE_SETTINGS');
  const data={enabled:d.enabled,points:d.points,version:d.expectedVersion+1,createdById:actorId};
  await tx.welcomePointsPolicy.upsert({where:{id:'default'},create:{id:'default',...data},update:data});
  await tx.auditLog.create({data:{actorId,action:'WELCOME_POINTS_CONFIGURED',entityId:actorId,reason:`New trainee welcome points: ${d.enabled?'enabled':'disabled'}; quantity ${d.points}`}});
  return welcomeSettings(tx);
 });
}
// Called only during creation, inside the registration transaction. Login/reset never grants.
export async function grantWelcomePoints(tx:Prisma.TransactionClient,userId:string){
 const policy=await tx.welcomePointsPolicy.findUnique({where:{id:'default'}});
 if(!policy?.enabled||policy.points<=0)return;
 const user=await tx.user.findUnique({where:{id:userId}});
 if(!user?.isActive||user.role!=='TRAINEE')return;
 await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
 if(await tx.welcomePointsGrant.findUnique({where:{userId}}))return;
 await requireAdmin(tx,policy.createdById);
 const account=await tx.pointAccount.findUniqueOrThrow({where:{type_ownerUserId:{type:'TRAINEE_WALLET',ownerUserId:userId}}});
 const issuance=await tx.pointAccount.findFirstOrThrow({where:{type:'ISSUANCE'}});
 const posted=await postInTransaction(tx,{actorId:policy.createdById,idempotencyKey:`welcome:${userId}`,referenceId:userId,reason:'Platform-configured welcome points for newly registered trainee',points:{kind:'ISSUE',entries:[{accountId:issuance.id,delta:-BigInt(policy.points)},{accountId:account.id,delta:BigInt(policy.points)}]}});
 await tx.welcomePointsGrant.create({data:{userId,points:policy.points,policyVersion:policy.version,pointTransactionId:posted.pointTransactionId!}});
 await tx.pointAccount.update({where:{id:account.id},data:{expiresAt:new Date(Date.now()+90*86400000)}});
}
