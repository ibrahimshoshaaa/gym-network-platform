import type { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { DomainError } from '../domain/errors.js';
export type ErasureStorage = {remove(key:string,type:string):Promise<void>};
export class CloudinaryErasureStorage implements ErasureStorage {
 async remove(key:string,type:string){
  const {CLOUDINARY_CLOUD_NAME:cloud_name,CLOUDINARY_API_KEY:api_key,CLOUDINARY_API_SECRET:api_secret}=process.env;
  if(!cloud_name||!api_key||!api_secret)throw new DomainError('STORAGE_NOT_CONFIGURED');
  const result=await cloudinary.uploader.destroy(key,{...{cloud_name,api_key,api_secret},resource_type:'image',type:type as 'upload'|'authenticated',invalidate:true});
  if(!['ok','not found'].includes(result.result))throw new DomainError('STORAGE_UNAVAILABLE');
 }
}
// Source of truth is the transactional outbox. Repeating a batch or a destroy is safe.
export async function eraseMediaBatch(db:PrismaClient,id:string,storage:ErasureStorage=new CloudinaryErasureStorage()){
 const deletion=await db.accountDeletion.findUnique({where:{id}});
 if(!deletion?.erasedAt||deletion.status==='COMPLETED')return false;
 const rows=await db.accountDeletionAsset.findMany({where:{deletionId:id,completedAt:null},orderBy:{id:'asc'},take:20});
 for(const row of rows){
  await db.accountDeletionAsset.update({where:{id:row.id},data:{attempts:{increment:1}}});
  await storage.remove(row.objectKey,row.deliveryType);
  await db.accountDeletionAsset.update({where:{id:row.id},data:{completedAt:new Date()}});
 }
 const remaining=await db.accountDeletionAsset.count({where:{deletionId:id,completedAt:null}});
 if(!remaining)await db.accountDeletion.updateMany({where:{id,status:'ERASING'},data:{status:'COMPLETED',completedAt:new Date()}});
 return remaining>0;
}
