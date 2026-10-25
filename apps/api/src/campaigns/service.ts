import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Prisma,PrismaClient} from '@prisma/client';
import {requireActor,requireAdmin} from '../auth/authorization.js';
import {parse} from '../gyms/validation.js';
import {audit} from '../gyms/service.js';
import {serializable} from '../ledger/service.js';
import {DomainError} from '../domain/errors.js';
export const campaignSchema=z.object({title:z.string().trim().max(120).default(''),body:z.string().trim().max(1000).default(''),audience:z.enum(['TRAINEES','OWNERS','STAFF','ALL']),channel:z.enum(['AD','NOTIFICATION','BOTH']),placement:z.enum(['HOME','GYMS','WALLET']),status:z.enum(['DRAFT','PUBLISHED','PAUSED']),destination:z.enum(['NONE','GYMS','TOPUP','QR','SUPPORT','POINT_WALLET','WITHDRAWALS']),priority:z.number().int().min(0).max(100),userIds:z.array(z.string().uuid()).max(100),gymIds:z.array(z.string().uuid()).max(50),startsAt:z.string().datetime(),endsAt:z.string().datetime(),imageId:z.string().uuid().nullable(),expectedVersion:z.number().int().min(0)}).strict().refine(d=>Date.parse(d.endsAt)>Date.parse(d.startsAt)).refine(d=>Boolean(d.title||d.body||d.imageId),{message:'Add a poster or text'});
export type Audience={id:string;role:string;owner:boolean;staff:boolean;gymIds:string[]};
export function campaignMatches(c:{audience:string;userIds:string[];gymIds:string[]},v:Audience){
 if(v.role==='PLATFORM_ADMIN')return false;
 if(c.audience==='TRAINEES'&&v.role!=='TRAINEE')return false;
 if(c.audience==='OWNERS'&&!v.owner)return false;
 if(c.audience==='STAFF'&&!v.staff)return false;
 return (!c.userIds.length||c.userIds.includes(v.id))&&(!c.gymIds.length||c.gymIds.some(g=>v.gymIds.includes(g)));
}
export function campaignDestination(destination:string,owner:boolean,trainee:boolean){
 const map:Record<string,string>={GYMS:trainee?'gyms':'gyms',TOPUP:trainee?'topup':owner?'withdrawals':'cashier',QR:trainee?'qr':'cashier',SUPPORT:'support',POINT_WALLET:trainee?'wallet':owner?'withdrawals':'cashier',WITHDRAWALS:owner?'withdrawals':trainee?'wallet':'home',NONE:trainee?'wallet':'home'};
 return map[destination]??(trainee?'wallet':'home');
}
async function viewer(tx:Prisma.TransactionClient,id:string):Promise<Audience>{
 const user=await requireActor(tx,id);
 const [owned,assigned,visits]=await Promise.all([
 tx.gym.findMany({where:{ownerId:id,ownerAcceptedAt:{not:null}},select:{id:true}}),
 tx.staffAssignment.findMany({where:{userId:id,active:true,branch:{gym:{status:'ACTIVE',ownerAcceptedAt:{not:null},owner:{isActive:true}}}},select:{branch:{select:{gymId:true}}}}),
 tx.visit.findMany({where:{traineeId:id},distinct:['branchId'],take:500,select:{branch:{select:{gymId:true}}}}),
 ]);
 return {id,role:user.role,owner:owned.length>0,staff:assigned.length>0,gymIds:[...new Set([...owned.map(g=>g.id),...assigned.map(a=>a.branch.gymId),...visits.map(v=>v.branch.gymId)])]};
}
export async function activeCampaigns(tx:Prisma.TransactionClient,id:string,channel:'AD'|'NOTIFICATION',placement?:string){
 const v=await viewer(tx,id),now=new Date();
 const rows=await tx.campaign.findMany({where:{status:'PUBLISHED',channel:{in:[channel,'BOTH']},startsAt:{lte:now},endsAt:{gt:now},...(placement?{placement}:{})},orderBy:[{priority:'desc'},{startsAt:'desc'},{id:'asc'}],include:{image:{select:{publicUrl:true}}},take:200});
 return rows.filter(c=>campaignMatches(c,v)).slice(0,25).map(c=>({id:c.id,version:c.version,title:c.title,description:c.body,imageUrl:c.image?.publicUrl??null,at:c.startsAt,endsAt:c.endsAt,destination:campaignDestination(c.destination,v.owner,v.role==='TRAINEE'),hasAction:c.destination!=='NONE'}));
}
export async function saveCampaign(db:PrismaClient,actorId:string,id:string|undefined,input:unknown){
 const d=parse(campaignSchema,input);return serializable(db,async tx=>{
  await requireAdmin(tx,actorId);const target=id??randomUUID();await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`campaign:${target}`},0))`;
  const old=id?await tx.campaign.findUnique({where:{id}}):null;
  if(id&&!old)throw new DomainError('NOT_FOUND');if((old?.version??0)!==d.expectedVersion)throw new DomainError('STALE_SETTINGS');
  if(d.imageId&&!await tx.campaignAsset.findUnique({where:{id:d.imageId}}))throw new DomainError('INVALID_INPUT');
  const {expectedVersion,...settings}=d;const data={...settings,startsAt:new Date(d.startsAt),endsAt:new Date(d.endsAt),version:expectedVersion+1,updatedById:actorId};
  const row=old?await tx.campaign.update({where:{id:target},data}):await tx.campaign.create({data:{id:target,createdById:actorId,...data}});
  await audit(tx,actorId,'CAMPAIGN_'+d.status,row.id,`Audience ${d.audience}; channel ${d.channel}; version ${row.version}; schedule ${d.startsAt} to ${d.endsAt}`);return row;
 });
}
