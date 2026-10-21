import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBody,reviewBody,distanceKm} from '../src/promotions/validation.js';
import {ratingBody} from '../src/ratings/service.js';
test('promotions and ratings accept only bounded commands; distance uses actual coordinates',()=>{
 const post={branchId:randomUUID(),clientKey:randomUUID(),title:'عرض تجريبي',body:'تفاصيل وشروط العرض التجريبي',imageId:null};
 assert.equal(createBody.safeParse(post).success,true);
 assert.equal(createBody.safeParse({...post,status:'APPROVED'}).success,false);
 const quote={action:'QUOTE',expectedVersion:1,reason:'عرض مناسب للمراجعة',feePiasters:'125050',startsAt:new Date().toISOString(),endsAt:new Date(Date.now()+86400000).toISOString(),radiusKm:20};
 assert.equal(reviewBody.safeParse(quote).success,true);
 for(const patch of [{feePiasters:'1.5'},{feePiasters:'-1'},{radiusKm:101},{expectedVersion:0}])assert.equal(reviewBody.safeParse({...quote,...patch}).success,false);
 for(const score of [0,6,2.5])assert.equal(ratingBody.safeParse({score,expectedVersion:0}).success,false);
 assert.equal(ratingBody.safeParse({score:5,expectedVersion:0,traineeId:randomUUID()}).success,false);
 assert.equal(distanceKm(30,31,30,31),0);assert.ok(distanceKm(30,31,30.1,31)>10);assert.ok(distanceKm(30,31,30.1,31)<12);
});
