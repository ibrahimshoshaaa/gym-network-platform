import type {FastifyInstance} from 'fastify';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {actorId} from '../gyms/routes.js';
import {parse} from '../gyms/validation.js';
import {consumeAuthLimit} from '../auth/throttle.js';
import {CloudinaryBusinessStorage,type BusinessStorage} from '../media/service.js';
import {DomainError} from '../domain/errors.js';
import {saveRating} from '../ratings/service.js';
import {promotionBranches,promotionList,promotionDetail,createPromotion,uploadPoster,changePromotion,nearbyPromotions,promotionAccess} from './service.js';
export function registerPromotionRoutes(app:FastifyInstance,db:PrismaClient,storage:BusinessStorage=new CloudinaryBusinessStorage()){
 const id=(p:unknown)=>parse(z.object({id:z.string().uuid()}).strict(),p).id;
 app.get('/promotions/branches',async r=>({items:await promotionBranches(db,await actorId(db,r))}));
 app.get('/promotions/branches/:id/services',async r=>{const actor=await actorId(db,r),branchId=id(r.params);await promotionAccess(db,actor,branchId);return {items:await db.branchService.findMany({where:{branchId,active:true,approvedAt:{not:null}},select:{id:true,name:true,points:true,durationMinutes:true},orderBy:{name:'asc'}})};});
 app.get('/promotions/requests',async r=>promotionList(db,await actorId(db,r),r.query));
 app.get('/promotions/requests/:id',async r=>promotionDetail(db,await actorId(db,r),id(r.params)));
 app.post('/promotions/requests',async r=>{const a=await actorId(db,r);await consumeAuthLimit(db,'promotion-post',a,10,3600);return createPromotion(db,a,r.body);});
 app.post('/promotions/requests/:id/action',async r=>changePromotion(db,await actorId(db,r),id(r.params),r.body));
 app.post('/promotions/branches/:id/assets',{bodyLimit:4*1024*1024},async r=>{const a=await actorId(db,r);await consumeAuthLimit(db,'promotion-image',a,15,3600);if(!Buffer.isBuffer(r.body))throw new DomainError('INVALID_RECEIPT');return uploadPoster(db,storage,a,id(r.params),r.body);});
 app.get('/admin/promotions/requests',async r=>promotionList(db,await actorId(db,r),r.query,true));
 app.post('/admin/promotions/requests/:id/review',async r=>changePromotion(db,await actorId(db,r),id(r.params),r.body,true));
 app.get('/trainee/nearby-promotions',async r=>nearbyPromotions(db,await actorId(db,r),r.query));
 app.post('/trainee/visits/:id/rating',async r=>{const a=await actorId(db,r);await consumeAuthLimit(db,'visit-rating',a,30,3600);return saveRating(db,a,id(r.params),r.body);});
}
