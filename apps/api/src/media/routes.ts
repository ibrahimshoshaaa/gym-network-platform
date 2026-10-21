import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { actorId } from '../gyms/routes.js';
import { parse } from '../gyms/validation.js';
import { consumeAuthLimit } from '../auth/throttle.js';
import { DomainError } from '../domain/errors.js';
import { CloudinaryBusinessStorage,mediaAccess,uploadBusinessImage,type BusinessStorage } from './service.js';
export function registerMediaRoutes(app:FastifyInstance,db:PrismaClient,storage:BusinessStorage=new CloudinaryBusinessStorage()){
 const id=(params:unknown,key:string)=>parse(z.string().uuid(),(params as Record<string,string>)[key]);
 app.get('/gyms/:gymId/images',async r=>{const actor=await actorId(db,r),gymId=id(r.params,'gymId');return db.$transaction(async tx=>{await mediaAccess(tx,actor,gymId);return {items:await tx.businessImage.findMany({where:{gymId},orderBy:{createdAt:'asc'},take:600,select:{id:true,branchId:true,purpose:true,publicUrl:true}})};});});
 app.post('/gyms/:gymId/images',{bodyLimit:4*1024*1024},async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'business-image',actor,20,3600);const q=parse(z.object({branchId:z.string().uuid().optional(),purpose:z.enum(['LOGO','PHOTO','COVER'])}).strict(),r.query);if(!Buffer.isBuffer(r.body))throw new DomainError('INVALID_RECEIPT');return uploadBusinessImage(db,storage,actor,id(r.params,'gymId'),q.branchId,q.purpose,r.body);});
 app.post('/gyms/:gymId/images/:imageId/remove',async r=>{const actor=await actorId(db,r),gymId=id(r.params,'gymId'),imageId=id(r.params,'imageId');const row=await db.$transaction(async tx=>{await mediaAccess(tx,actor,gymId);const row=await tx.businessImage.findFirst({where:{id:imageId,gymId}});if(!row)throw new DomainError('NOT_FOUND');await tx.businessImage.delete({where:{id:imageId}});return row;});await storage.remove(row.objectKey).catch(()=>{});return {removed:true};});
}
