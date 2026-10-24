import type { PrismaClient } from '@prisma/client';
import { serializable } from '../ledger/service.js';
import { requireActor } from '../auth/authorization.js';
/** Cloudinary is bounded to 120s; a ten-minute lease also covers DB/worker delays.
 * Unknown remote outcomes keep the key for erasure instead of silently losing it. */
export async function accountUpload<T extends {objectKey:string},R>(
 db:PrismaClient,storage:{upload(data:Buffer,key:string):Promise<T>;remove(key:string):Promise<void>},
 actor:string,data:Buffer,key:string,deliveryType:'upload'|'authenticated',persist:(object:T)=>Promise<R>,
):Promise<R>{
 const lease=await serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor}::uuid FOR SHARE`;
  await requireActor(tx,actor);
  return tx.accountUploadLease.create({data:{userId:actor,objectKey:key,deliveryType,expiresAt:new Date(Date.now()+10*60000)}});
 });
 const object=await storage.upload(data,key);
 try{
  const result=await persist(object);
  await db.accountUploadLease.deleteMany({where:{id:lease.id}}).catch(()=>{});
  return result;
 }catch(error){
  try{await storage.remove(object.objectKey);await db.accountUploadLease.deleteMany({where:{id:lease.id}});}catch{/* Lease retains the uncertain remote object for erasure. */}
  throw error;
 }
}
