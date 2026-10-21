import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {requireAdmin} from '../auth/authorization.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {parse} from '../gyms/validation.js';
import {CloudinaryBusinessStorage,type BusinessStorage} from '../media/service.js';
import {DomainError} from '../domain/errors.js';
import {audit} from '../gyms/service.js';
import {governorates,categories} from './validation.js';
import {listMarket,listingDetail,saveListing,changeListingStatus,reportListing,uploadMarketImage,removeMarketImage} from './service.js';
export function registerMarketRoutes(app:FastifyInstance,db:PrismaClient,storage:BusinessStorage=new CloudinaryBusinessStorage()){
 const id=(p:unknown)=>parse(z.object({id:z.string().uuid()}).strict(),p).id;
 app.get('/market/options',async r=>{await actorId(db,r);return {governorates,categories};});
 app.get('/market/listings',async r=>listMarket(db,await actorId(db,r),r.query));
 app.get('/market/mine',async r=>listMarket(db,await actorId(db,r),r.query,'MINE'));
 app.get('/market/listings/:id',async r=>listingDetail(db,await actorId(db,r),id(r.params)));
 app.post('/market/listings',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'market-write',actor,30,3600);return saveListing(db,actor,undefined,r.body);});
 app.patch('/market/listings/:id',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'market-write',actor,30,3600);return saveListing(db,actor,id(r.params),r.body);});
 app.post('/market/listings/:id/status',async r=>changeListingStatus(db,await actorId(db,r),id(r.params),r.body));
 app.post('/market/listings/:id/report',async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'market-report',actor,10,3600);return reportListing(db,actor,id(r.params),r.body);});
 app.post('/market/assets',{bodyLimit:4*1024*1024},async r=>{const actor=await actorId(db,r);await consumeAuthLimit(db,'market-image',actor,20,3600);if(!Buffer.isBuffer(r.body))throw new DomainError('INVALID_RECEIPT');return uploadMarketImage(db,storage,actor,r.body);});
 app.post('/market/assets/:id/remove',async r=>removeMarketImage(db,storage,await actorId(db,r),id(r.params)));
 app.get('/admin/market/listings',async r=>listMarket(db,await actorId(db,r),r.query,'ADMIN'));
 app.post('/admin/market/listings/:id/review',async r=>changeListingStatus(db,await actorId(db,r),id(r.params),r.body,true));
 app.get('/admin/market/reports',async r=>{const actor=await actorId(db,r);await requireAdmin(db,actor);const q=parse(z.object({cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(30).default(20)}).strict(),r.query);const rows=await db.marketReport.findMany({where:{status:'OPEN'},orderBy:{id:'asc'},take:q.limit+1,...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),include:{listing:{select:{id:true,title:true,version:true,status:true}},reporter:{select:{displayName:true}}}});return {items:rows.slice(0,q.limit),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};});
 app.post('/admin/market/reports/:id/resolve',async r=>{const actor=await actorId(db,r),reportId=id(r.params);return db.$transaction(async tx=>{await requireAdmin(tx,actor);const row=await tx.marketReport.findUnique({where:{id:reportId}});if(!row)throw new DomainError('NOT_FOUND');await tx.marketReport.update({where:{id:reportId},data:{status:'REVIEWED',reviewedById:actor,reviewedAt:new Date()}});await audit(tx,actor,'MARKET_REPORT_REVIEWED',reportId,'Marketplace report reviewed');return {reviewed:true};});});
}
