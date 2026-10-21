import {z} from 'zod';
import type {PrismaClient} from '@prisma/client';
import {requireActor} from '../auth/authorization.js';
import {DomainError} from '../domain/errors.js';
import {parse} from '../gyms/validation.js';
import {serializable} from '../ledger/service.js';
import {audit} from '../gyms/service.js';
export const ratingBody=z.object({score:z.number().int().min(1).max(5),expectedVersion:z.number().int().min(0)}).strict();
export function saveRating(db:PrismaClient,actor:string,visitId:string,input:unknown){const d=parse(ratingBody,input);return serializable(db,async tx=>{
 const user=await requireActor(tx,actor);if(user.role!=='TRAINEE')throw new DomainError('ACCESS_DENIED');await tx.$queryRaw`SELECT id FROM "Visit" WHERE id=${visitId}::uuid FOR UPDATE`;const visit=await tx.visit.findUnique({where:{id:visitId},include:{rating:true}});if(!visit||visit.traineeId!==actor)throw new DomainError('NOT_FOUND');if(visit.status==='CANCELLED'||visit.expiresAt>new Date())throw new DomainError('INVALID_STATE');
 if((visit.rating?.version??0)!==d.expectedVersion){if(visit.rating?.score===d.score&&visit.rating.version===d.expectedVersion+1)return {score:visit.rating.score,version:visit.rating.version};throw new DomainError('STALE_SETTINGS');}
 const row=await tx.visitRating.upsert({where:{visitId},create:{visitId,traineeId:actor,branchId:visit.branchId,score:d.score},update:{score:d.score,version:{increment:1}}});await audit(tx,actor,'VISIT_RATED',visitId,'تقييم الزيارة '+d.score);return {score:row.score,version:row.version};
});}
