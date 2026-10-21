import {createHash,randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {requireActor,requireAdmin} from '../auth/authorization.js';
import {branchAccess,availableBranches} from '../maintenance/access.js';
import {DomainError} from '../domain/errors.js';
import {parse} from '../gyms/validation.js';
import {audit} from '../gyms/service.js';
import {serializable} from '../ledger/service.js';
import {cleanReceipt} from '../topups/receipts.js';
import type {BusinessStorage} from '../media/service.js';
import {createBody,reviewBody,ownerBody,filters,nearbyQuery} from './validation.js';
type Tx=Prisma.TransactionClient;
const include={branch:{select:{id:true,name:true,gymId:true,city:true,governorate:true,gym:{select:{name:true}}}},requestedBy:{select:{displayName:true}},image:{select:{id:true,publicUrl:true}}};
function view<T extends {feePiasters:bigint|null;clientKey:string;requestHash:string}>(row:T){const {clientKey,requestHash,...rest}=row;return {...rest,feePiasters:row.feePiasters?.toString()??null};}
export async function promotionAccess(tx:Tx,actor:string,branchId:string){const a=await branchAccess(tx,actor,branchId);if(!a.admin&&!a.canApprove&&!await tx.staffAssignment.findFirst({where:{userId:actor,branchId,active:true,role:'BRANCH_MANAGER'}}))throw new DomainError('ACCESS_DENIED');return a;}
export async function promotionBranches(tx:Tx,actor:string){const branches=await availableBranches(tx,actor),assignments=await tx.staffAssignment.findMany({where:{userId:actor,active:true,role:'BRANCH_MANAGER'},select:{branchId:true}});const assigned=new Set(assignments.map(a=>a.branchId));return branches.filter(b=>b.canApprove||assigned.has(b.id));}
export async function uploadPoster(db:PrismaClient,storage:BusinessStorage,actor:string,branchId:string,bytes:Buffer){const a=await promotionAccess(db,actor,branchId);if(a.admin)throw new DomainError('ACCESS_DENIED');const data=await cleanReceipt(bytes),object=await storage.upload(data,`gym-offers/${branchId}/${randomUUID()}`);try{await promotionAccess(db,actor,branchId);return await db.promotionImage.create({data:{...object,ownerId:actor,branchId},select:{id:true,publicUrl:true}});}catch(e){await storage.remove(object.objectKey).catch(()=>{});throw e;}}
export function createPromotion(db:PrismaClient,actor:string,input:unknown){const d=parse(createBody,input),hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');return serializable(db,async tx=>{
 const a=await promotionAccess(tx,actor,d.branchId);if(a.admin)throw new DomainError('ACCESS_DENIED');await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor+':promotion:'+d.clientKey},0))`;
 const old=await tx.promotionRequest.findUnique({where:{requestedById_clientKey:{requestedById:actor,clientKey:d.clientKey}},include});if(old){if(old.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT');return view(old);}
 if(d.imageId){await tx.$queryRaw`SELECT id FROM "PromotionImage" WHERE id=${d.imageId}::uuid FOR UPDATE`;const image=await tx.promotionImage.findUnique({where:{id:d.imageId},include:{request:{select:{id:true}}}});if(!image||image.ownerId!==actor||image.branchId!==d.branchId||image.request)throw new DomainError('ACCESS_DENIED');}
 const row=await tx.promotionRequest.create({data:{branchId:d.branchId,requestedById:actor,clientKey:d.clientKey,requestHash:hash,title:d.title,body:d.body,imageId:d.imageId},include});await audit(tx,actor,'PROMOTION_REQUESTED',row.id,'طلب إعلان فرع للمراجعة');return view(row);
});}
export async function promotionList(db:PrismaClient,actor:string,input:unknown,admin=false){const f=parse(filters,input);if(admin)await requireAdmin(db,actor);const ids=admin?undefined:(await promotionBranches(db,actor)).map(b=>b.id);const rows=await db.promotionRequest.findMany({where:{...(admin?{}:{branchId:{in:ids}}),...(f.status?{status:f.status}:{})},include,orderBy:[{createdAt:'desc'},{id:'desc'}],take:f.limit+1,...(f.cursor?{cursor:{id:f.cursor},skip:1}:{})});return {items:rows.slice(0,f.limit).map(view),nextCursor:rows.length>f.limit?rows[f.limit-1]!.id:null};}
export async function promotionDetail(db:PrismaClient,actor:string,id:string){const row=await db.promotionRequest.findUnique({where:{id},include});if(!row)throw new DomainError('NOT_FOUND');const a=await promotionAccess(db,actor,row.branchId);return {...view(row),canAccept:a.canApprove};}
export function changePromotion(db:PrismaClient,actor:string,id:string,input:unknown,admin=false){const d=admin?parse(reviewBody,input):parse(ownerBody,input);return serializable(db,async tx=>{
 if(admin)await requireAdmin(tx,actor);await tx.$queryRaw`SELECT id FROM "PromotionRequest" WHERE id=${id}::uuid FOR UPDATE`;const row=await tx.promotionRequest.findUnique({where:{id}});if(!row)throw new DomainError('NOT_FOUND');const a=await promotionAccess(tx,actor,row.branchId);if(!admin&&a.admin)throw new DomainError('ACCESS_DENIED');if(row.version!==d.expectedVersion)throw new DomainError('STALE_SETTINGS');
 const ready=a.branch.status==='ACTIVE'&&a.branch.gym.status==='ACTIVE'&&a.branch.gym.ownerAcceptedAt&&a.branch.gym.owner.isActive&&a.branch.priceApprovedAt&&a.branch.pricingVersion>0&&a.branch.visitPricePoints>0&&a.branch.sessionMinutes>0&&a.branch.latitude!==null&&a.branch.longitude!==null&&a.branch.address.trim()&&a.branch.city.trim()&&a.branch.governorate.trim();
 if(['QUOTE','ACCEPT'].includes(d.action)&&!ready)throw new DomainError('BRANCH_NOT_READY');
 let status=row.status,extra:Prisma.PromotionRequestUpdateInput={};const must=(v:boolean)=>{if(!v)throw new DomainError('INVALID_STATE');};
 if(d.action==='QUOTE'&&'feePiasters' in d){must(['PENDING','AWAITING_ACCEPTANCE','PAUSED','APPROVED'].includes(status));const start=new Date(d.startsAt),end=new Date(d.endsAt);if(end<=new Date()||end<=start||end.getTime()-start.getTime()>180*86400000)throw new DomainError('INVALID_INPUT');status='AWAITING_ACCEPTANCE';extra={feePiasters:d.feePiasters,startsAt:start,endsAt:end,radiusKm:d.radiusKm,reviewReason:d.reason,reviewedById:actor,acceptedById:null,acceptedAt:null};}
 else if(d.action==='REJECT'&&'reason' in d){must(['PENDING','AWAITING_ACCEPTANCE'].includes(status));status='REJECTED';extra={reviewReason:d.reason,reviewedById:actor};}
 else if(d.action==='PAUSE'&&'reason' in d){must(status==='APPROVED');status='PAUSED';extra={reviewReason:d.reason,reviewedById:actor};}
 else if(d.action==='ACCEPT'){if(!a.canApprove)throw new DomainError('ACCESS_DENIED');must(status==='AWAITING_ACCEPTANCE'&&row.feePiasters!==null&&Boolean(row.endsAt&&row.endsAt>new Date()));status='APPROVED';extra={acceptedById:actor,acceptedAt:new Date()};}
 else if(d.action==='WITHDRAW'){must(['PENDING','AWAITING_ACCEPTANCE','APPROVED','PAUSED'].includes(status));if(row.requestedById!==actor&&!a.canApprove)throw new DomainError('ACCESS_DENIED');status='WITHDRAWN';}
 await tx.promotionRequest.update({where:{id},data:{...extra,status,version:{increment:1}}});await audit(tx,actor,'PROMOTION_'+d.action,id,'reason' in d?d.reason:'تم '+d.action+' لطلب الإعلان');return view(await tx.promotionRequest.findUniqueOrThrow({where:{id},include}));
});}
export async function nearbyPromotions(db:PrismaClient,actor:string,input:unknown){
 const q=parse(nearbyQuery,input),user=await requireActor(db,actor);if(user.role!=='TRAINEE')throw new DomainError('ACCESS_DENIED');if(q.latitude===undefined||q.longitude===undefined)return {items:[]};
 const lat=q.latitude,lon=q.longitude,span=100/110.5,lonSpan=Math.min(180,100/(111.32*Math.max(.01,Math.cos(lat*Math.PI/180)))),now=new Date();
 const rows=await db.$queryRaw<{id:string;title:string;description:string;imageUrl:string|null;endsAt:Date;branch:string;branchName:string;gymName:string;city:string;distanceKm:number}[]>(Prisma.sql`
 WITH eligible AS (
  SELECT r.id,r.title,r.body AS description,i."publicUrl" AS "imageUrl",r."endsAt",r."radiusKm",b.id AS branch,b.name AS "branchName",g.name AS "gymName",b.city,b.latitude::double precision AS latitude,b.longitude::double precision AS longitude
  FROM "PromotionRequest" r JOIN "Branch" b ON b.id=r."branchId" JOIN "Gym" g ON g.id=b."gymId" JOIN "User" u ON u.id=g."ownerId" LEFT JOIN "PromotionImage" i ON i.id=r."imageId"
  WHERE r.status='APPROVED' AND r."startsAt"<=${now} AND r."endsAt">${now} AND b.status='ACTIVE' AND g.status='ACTIVE' AND g."ownerAcceptedAt" IS NOT NULL AND u."isActive" AND b."pricingVersion">0 AND b."priceApprovedAt" IS NOT NULL AND b."visitPricePoints">0 AND b."sessionMinutes">0 AND length(btrim(b.address))>0 AND length(btrim(b.city))>0 AND length(btrim(b.governorate))>0
  AND b.latitude BETWEEN ${Math.max(-90,lat-span)} AND ${Math.min(90,lat+span)} AND b.longitude BETWEEN -180 AND 180
  ${lon-lonSpan>=-180&&lon+lonSpan<=180?Prisma.sql`AND b.longitude BETWEEN ${lon-lonSpan} AND ${lon+lonSpan}`:Prisma.empty}
 ), ranked AS (SELECT *,6371.0*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(latitude-${lat})/2),2)+cos(radians(${lat}::double precision))*cos(radians(latitude))*power(sin(radians(longitude-${lon})/2),2))))) AS "distanceKm" FROM eligible)
 SELECT id,title,description,"imageUrl","endsAt",branch,"branchName","gymName",city,"distanceKm" FROM ranked WHERE "distanceKm"<="radiusKm" ORDER BY "distanceKm",id LIMIT 10`);
 return {items:rows};
}
