import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createBody,adminAction,customerAction,filters} from '../src/maintenance/validation.js';
test('repair commands bind a version, require bounded minor-unit costs and reject extra authority',()=>{
 const input={branchId:randomUUID(),clientKey:randomUUID(),equipment:'جهاز جري',description:'الموتور لا يعمل ويصدر صوتًا',contactPhone:'+201012345678',imageIds:[]};
 assert.equal(createBody.safeParse(input).success,true);
 for(const patch of [{status:'COMPLETED'},{imageIds:Array.from({length:7},()=>randomUUID())},{contactPhone:'javascript:alert(1)'},{imageUrls:['https://untrusted.test']}])assert.equal(createBody.safeParse({...input,...patch}).success,false);
 const quote={action:'QUOTE',expectedVersion:1,note:'تغيير السير وإصلاح الموتور',estimatedPiasters:'125050',technicianName:'مسؤول الصيانة',technicianPhone:'+201012345678',appointmentAt:new Date(Date.now()+86400000).toISOString()};
 assert.equal(adminAction.parse(quote).action,'QUOTE');
 for(const estimatedPiasters of ['1.5','-1','1000000000000'])assert.equal(adminAction.safeParse({...quote,estimatedPiasters}).success,false);
 assert.equal(customerAction.safeParse(quote).success,false);
 assert.equal(adminAction.safeParse({action:'CONFIRM',expectedVersion:1}).success,false);
 assert.equal(customerAction.safeParse({action:'APPROVE',expectedVersion:1,estimatedPiasters:'1'}).success,false);
 assert.equal(customerAction.safeParse({action:'REOPEN',expectedVersion:1,note:'العطل لا يزال موجودًا'}).success,true);
 assert.equal(customerAction.safeParse({action:'CANCEL',expectedVersion:1,note:''}).success,false);
 assert.equal(filters.safeParse({limit:1000}).success,false);
});
