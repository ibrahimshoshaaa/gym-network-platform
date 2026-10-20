import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {requireAdmin} from '../auth/authorization.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {cleanReceipt} from '../topups/receipts.js';
import {CloudinaryBusinessStorage,type BusinessStorage} from '../media/service.js';
import {DomainError} from '../domain/errors.js';
import {activeCampaigns,saveCampaign} from './service.js';
export function registerCampaignRoutes(app:FastifyInstance,db:PrismaClient,storage:BusinessStorage=new CloudinaryBusinessStorage()){
 app.get('/campaigns',async(r,reply)=>{reply.header('Cache-Control','no-store');const id=await actorId(db,r),q=parse(z.object({placement:z.enum(['HOME','GYMS','WALLET'])}).strict(),r.query);return db.$transaction(async tx=>({items:await activeCampaigns(tx,id,'AD',q.placement)}),{isolationLevel:'RepeatableRead',timeout:15000});});
 app.get('/admin/campaigns',async r=>{const id=await actorId(db,r);await requireAdmin(db,id);const q=parse(z.object({cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict(),r.query);const rows=await db.campaign.findMany({where:q.cursor?{id:{gt:q.cursor}}:{},orderBy:{id:'asc'},take:q.limit+1,include:{image:{select:{publicUrl:true}}}});return {items:rows.slice(0,q.limit),nextCursor:rows.length>q.limit?rows[q.limit-1]!.id:null};});
 app.post('/admin/campaigns',async r=>{const id=await actorId(db,r);await consumeAuthLimit(db,'campaign-write',id,30,900);return saveCampaign(db,id,undefined,r.body);});
 app.put('/admin/campaigns/:id',async r=>{const id=await actorId(db,r);await consumeAuthLimit(db,'campaign-write',id,30,900);return saveCampaign(db,id,parse(z.string().uuid(),(r.params as {id:string}).id),r.body);});
 app.post('/admin/campaign-assets',{bodyLimit:4*1024*1024},async r=>{const id=await actorId(db,r);await requireAdmin(db,id);await consumeAuthLimit(db,'campaign-image',id,20,3600);if(!Buffer.isBuffer(r.body))throw new DomainError('INVALID_RECEIPT');const bytes=await cleanReceipt(r.body),object=await storage.upload(bytes,`gym-campaigns/${randomUUID()}`);try{await requireAdmin(db,id);return await db.campaignAsset.create({data:{...object,createdById:id}});}catch(e){await storage.remove(object.objectKey).catch(()=>{});throw e;}});
}
