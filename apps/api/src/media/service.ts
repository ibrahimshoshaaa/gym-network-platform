import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import type { Prisma, PrismaClient } from '@prisma/client';
import { requireActor, requireGymOwner } from '../auth/authorization.js';
import { serializable } from '../ledger/service.js';
import { DomainError } from '../domain/errors.js';
import { cleanReceipt } from '../topups/receipts.js';
export interface BusinessStorage {upload(data:Buffer,key:string):Promise<{objectKey:string;assetId:string;publicUrl:string}>;remove(key:string):Promise<void>;}
export class CloudinaryBusinessStorage implements BusinessStorage {
 private credentials(){const {CLOUDINARY_CLOUD_NAME:cloud_name,CLOUDINARY_API_KEY:api_key,CLOUDINARY_API_SECRET:api_secret}=process.env;if(!cloud_name||!api_key||!api_secret)throw new DomainError('STORAGE_NOT_CONFIGURED');return {cloud_name,api_key,api_secret};}
 async upload(data:Buffer,key:string){const credentials=this.credentials();return new Promise<{objectKey:string;assetId:string;publicUrl:string}>((resolve,reject)=>{const stream=cloudinary.uploader.upload_stream({...credentials,type:'upload',resource_type:'image',public_id:key,overwrite:false},(err,result)=>{if(err||!result||result.type!=='upload'||result.public_id!==key||!/^https:\/\/res\.cloudinary\.com\//.test(result.secure_url))return reject(new DomainError('STORAGE_UNAVAILABLE'));resolve({objectKey:result.public_id,assetId:result.asset_id,publicUrl:result.secure_url});});stream.end(data);});}
 async remove(key:string){await cloudinary.uploader.destroy(key,{...this.credentials(),type:'upload',resource_type:'image',invalidate:true});}
}
export async function mediaAccess(tx:Prisma.TransactionClient,actorId:string,gymId:string,branchId?:string){const actor=await requireActor(tx,actorId);if(actor.role!=='PLATFORM_ADMIN')await requireGymOwner(tx,actorId,gymId,false);else if(!await tx.gym.findUnique({where:{id:gymId}}))throw new DomainError('NOT_FOUND');if(branchId && !await tx.branch.findFirst({where:{id:branchId,gymId}}))throw new DomainError('BRANCH_ACCESS_DENIED');}
export async function uploadBusinessImage(db:PrismaClient,storage:BusinessStorage,actorId:string,gymId:string,branchId:string|undefined,purpose:'LOGO'|'PHOTO',bytes:Buffer){
 await mediaAccess(db,actorId,gymId,branchId);
 if((purpose==='LOGO')===Boolean(branchId))throw new DomainError('INVALID_INPUT');
 const cleaned=await cleanReceipt(bytes),image=await sharp(cleaned).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
 const object=await storage.upload(image,`gym-business/${gymId}/${randomUUID()}`);
 try{return await serializable(db,async tx=>{await mediaAccess(tx,actorId,gymId,branchId);await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${gymId},0))`;const count=await tx.businessImage.count({where:{gymId,branchId:branchId??null,purpose}});if(count>=(purpose==='LOGO'?1:6))throw new DomainError('IMAGE_LIMIT');const row=await tx.businessImage.create({data:{ownerId:actorId,gymId,branchId,purpose,...object}});return {id:row.id,url:row.publicUrl,purpose:row.purpose};});}
 catch(e){await storage.remove(object.objectKey).catch(()=>{});throw e;}
}
