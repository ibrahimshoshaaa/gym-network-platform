import {accountUpload} from '../accounts/uploads.js';
import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {requireActor,requireAdmin} from '../auth/authorization.js';
import {DomainError} from '../domain/errors.js';
import {parse} from '../gyms/validation.js';
import {audit} from '../gyms/service.js';
import {serializable} from '../ledger/service.js';
import {cleanReceipt} from '../topups/receipts.js';
import type {BusinessStorage} from '../media/service.js';
import {createBody,updateBody,filters,versionBody,reviewBody,reportBody,searchText} from './validation.js';
type Tx=Prisma.TransactionClient;
const include={images:{select:{id:true,publicUrl:true},orderBy:{createdAt:'asc' as const}},seller:{select:{displayName:true,role:true}}};
function view<T extends {pricePiasters:bigint;requestHash:string;clientKey:string;searchText:string}>(row:T){const {requestHash,clientKey,searchText,...data}=row;return {...data,pricePiasters:row.pricePiasters.toString()};}
async function locked(tx:Tx,id:string){await tx.$queryRaw`SELECT id FROM "MarketListing" WHERE id=${id}::uuid FOR UPDATE`;const row=await tx.marketListing.findUnique({where:{id}});if(!row)throw new DomainError('NOT_FOUND');return row;}
async function attach(tx:Tx,actor:string,id:string,images:string[]){
 // Lock image rows in a stable order before checking ownership/attachment.
 const rows=await tx.$queryRaw<{id:string;ownerId:string;listingId:string|null}[]>`SELECT id,"ownerId","listingId" FROM "MarketImage" WHERE id=ANY(${images}::uuid[]) ORDER BY id FOR UPDATE`;
 if(rows.length!==images.length||rows.some(r=>r.ownerId!==actor||(r.listingId!==null&&r.listingId!==id)))throw new DomainError('ACCESS_DENIED');
 await tx.marketImage.updateMany({where:{listingId:id,id:{notIn:images}},data:{listingId:null}});
 await tx.marketImage.updateMany({where:{id:{in:images}},data:{listingId:id}});
}
export async function uploadMarketImage(db:PrismaClient,storage:BusinessStorage,actor:string,bytes:Buffer){
 await requireActor(db,actor);const data=await cleanReceipt(bytes);
 return accountUpload(db,storage,actor,data,`gym-market/${actor}/${randomUUID()}`,'upload',async object=>{await requireActor(db,actor);return db.marketImage.create({data:{ownerId:actor,...object},select:{id:true,publicUrl:true}});});
}
export async function removeMarketImage(db:PrismaClient,storage:BusinessStorage,actor:string,id:string){
 const row=await serializable(db,async tx=>{await requireActor(tx,actor);const row=await tx.marketImage.findUnique({where:{id}});if(!row||row.ownerId!==actor)throw new DomainError('NOT_FOUND');if(row.listingId)throw new DomainError('INVALID_STATE');await tx.marketImage.delete({where:{id}});return row;});
 await storage.remove(row.objectKey).catch(()=>{});return {removed:true};
}
export function saveListing(db:PrismaClient,actor:string,id:string|undefined,input:unknown){
 const data=id?parse(updateBody,input):parse(createBody,input);
 const {imageIds,pricePiasters,...fields}=data;
 const content={title:fields.title,description:fields.description,category:fields.category,condition:fields.condition,governorate:fields.governorate,city:fields.city,contactPhone:fields.contactPhone,pricePiasters};
 const hash=createHash('sha256').update(JSON.stringify({...content,pricePiasters:pricePiasters.toString(),imageIds})).digest('hex');
 return serializable(db,async tx=>{
  const user=await requireActor(tx,actor);
  const now=new Date(),status=user.role==='PLATFORM_ADMIN'?'APPROVED':'PENDING';
  let listingId=id;
  if(!id){
   const key=(data as ReturnType<typeof createBody.parse>).clientKey;
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor+':market:'+key},0))`;
   const old=await tx.marketListing.findUnique({where:{sellerId_clientKey:{sellerId:actor,clientKey:key}},include});
   if(old){if(old.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT');return view(old);}
   if(await tx.marketListing.count({where:{sellerId:actor,status:{in:['PENDING','APPROVED']}}})>=30)throw new DomainError('MARKET_LISTING_LIMIT');
   const row=await tx.marketListing.create({data:{...content,sellerId:actor,status,clientKey:key,requestHash:hash,searchText:searchText(content.title+' '+content.description),...(status==='APPROVED'?{reviewedById:actor,reviewedAt:now}:{})}});listingId=row.id;
  }else{
   const row=await locked(tx,id);if(row.sellerId!==actor)throw new DomainError('ACCESS_DENIED');if(row.version!==(data as ReturnType<typeof updateBody.parse>).expectedVersion)throw new DomainError('STALE_SETTINGS');
   await tx.marketListing.update({where:{id},data:{...content,status,version:{increment:1},searchText:searchText(content.title+' '+content.description),reviewReason:null,reviewedById:status==='APPROVED'?actor:null,reviewedAt:status==='APPROVED'?now:null}});
  }
  await attach(tx,actor,listingId!,imageIds);
  await audit(tx,actor,id?'MARKET_EDITED':'MARKET_CREATED',listingId!,'Marketplace listing '+status);
  return view(await tx.marketListing.findUniqueOrThrow({where:{id:listingId!},include}));
 });
}
export async function listingDetail(db:PrismaClient,actor:string,id:string){
 const user=await requireActor(db,actor),row=await db.marketListing.findUnique({where:{id},include:{...include,seller:{select:{displayName:true,role:true,isActive:true}}}});
 if(!row||((row.status!=='APPROVED'||!row.seller.isActive)&&row.sellerId!==actor&&user.role!=='PLATFORM_ADMIN'))throw new DomainError('NOT_FOUND');
 const result=view(row);const {isActive,...seller}=row.seller;return {...result,seller,canEdit:row.sellerId===actor};
}
export async function listMarket(db:PrismaClient,actor:string,input:unknown,scope:'PUBLIC'|'MINE'|'ADMIN'='PUBLIC'){
 const f=parse(filters,input);await requireActor(db,actor);if(scope==='ADMIN')await requireAdmin(db,actor);
 if(f.status&&scope==='PUBLIC')throw new DomainError('INVALID_INPUT');
 const where:Prisma.MarketListingWhereInput={...(scope==='PUBLIC'?{status:'APPROVED',seller:{isActive:true}}:scope==='MINE'?{sellerId:actor}:{}),...(scope!=='PUBLIC'&&f.status?{status:f.status}:{}),...(f.q?{searchText:{contains:searchText(f.q)}}:{}),...(f.category?{category:f.category}:{}),...(f.condition?{condition:f.condition}:{}),...(f.governorate?{governorate:f.governorate}:{}),...(f.min!==undefined||f.max!==undefined?{pricePiasters:{gte:f.min,lte:f.max}}:{})};
 const orderBy:Prisma.MarketListingOrderByWithRelationInput[]=f.sort==='LATEST'?[{createdAt:'desc'},{id:'desc'}]:[{pricePiasters:f.sort==='PRICE_ASC'?'asc':'desc'},{id:'desc'}];
 const rows=await db.marketListing.findMany({where,include,orderBy,take:f.limit+1,...(f.cursor?{cursor:{id:f.cursor},skip:1}:{})});
 return {items:rows.slice(0,f.limit).map(r=>{const v=view(r);if(scope==='PUBLIC'){const {contactPhone,reviewReason,reviewedById,reviewedAt,...card}=v;return card;}return v;}),nextCursor:rows.length>f.limit?rows[f.limit-1]!.id:null};
}
export function changeListingStatus(db:PrismaClient,actor:string,id:string,input:unknown,admin=false){
 const data=admin?parse(reviewBody,input):parse(versionBody,input);
 return serializable(db,async tx=>{await requireActor(tx,actor);if(admin)await requireAdmin(tx,actor);const row=await locked(tx,id);
 if(!admin&&row.sellerId!==actor)throw new DomainError('ACCESS_DENIED');if(row.version!==data.expectedVersion)throw new DomainError('STALE_SETTINGS');
 if(admin&&row.status==='SOLD')throw new DomainError('INVALID_STATE');
 if(admin&&data.status==='REJECTED'&&row.status!=='PENDING')throw new DomainError('INVALID_STATE');
 const updated=await tx.marketListing.update({where:{id},data:{status:data.status,version:{increment:1},...(admin?{reviewReason:(data as ReturnType<typeof reviewBody.parse>).reason,reviewedById:actor,reviewedAt:new Date()}:{})},include});
 await audit(tx,actor,admin?'MARKET_REVIEWED':'MARKET_STATUS',id,'Marketplace status '+data.status);return view(updated);});
}
export async function reportListing(db:PrismaClient,actor:string,id:string,input:unknown){
 const data=parse(reportBody,input);await requireActor(db,actor);const listing=await db.marketListing.findFirst({where:{id,status:'APPROVED',seller:{isActive:true}}});if(!listing)throw new DomainError('NOT_FOUND');if(listing.sellerId===actor)throw new DomainError('INVALID_INPUT');
 return db.marketReport.upsert({where:{listingId_reporterId:{listingId:id,reporterId:actor}},create:{listingId:id,reporterId:actor,...data},update:{},select:{id:true,status:true}});
}
