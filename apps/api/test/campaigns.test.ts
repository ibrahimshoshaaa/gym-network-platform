import assert from 'node:assert/strict';
import test from 'node:test';
import {campaignMatches,campaignDestination,campaignSchema} from '../src/campaigns/service.js';
const person={id:'u',role:'TRAINEE',owner:false,staff:false,gymIds:['g']};
test('campaign audiences intersect account and gym targeting without exposing admin broadcasts',()=>{
 const c={audience:'TRAINEES',userIds:[],gymIds:[]};assert.ok(campaignMatches(c,person));assert.equal(campaignMatches(c,{...person,role:'CASHIER'}),false);
 assert.equal(campaignMatches({...c,userIds:['other']},person),false);assert.equal(campaignMatches({...c,gymIds:['other']},person),false);
 assert.ok(campaignMatches({...c,userIds:['u'],gymIds:['g']},person));assert.equal(campaignMatches({...c,audience:'ALL'},{...person,role:'PLATFORM_ADMIN'}),false);
 assert.ok(campaignMatches({...c,audience:'OWNERS'},{...person,owner:true}));assert.equal(campaignMatches({...c,audience:'STAFF'},person),false);
});
test('campaign navigation stays in the known role-aware sections',()=>{
 assert.equal(campaignDestination('TOPUP',false,true),'topup');assert.equal(campaignDestination('TOPUP',true,false),'withdrawals');
 assert.equal(campaignDestination('WITHDRAWALS',false,true),'wallet');assert.equal(campaignDestination('javascript:alert(1)',false,true),'wallet');
});
test('campaign scheduling and targeting reject malformed or arbitrary HTML destinations',()=>{
 const base={title:'حملة اختبار',body:'نص تجريبي',audience:'ALL',channel:'BOTH',placement:'HOME',status:'DRAFT',destination:'NONE',priority:0,userIds:[],gymIds:[],startsAt:'2026-10-20T00:00:00Z',endsAt:'2026-10-21T00:00:00Z',imageId:null,expectedVersion:0};
 assert.ok(campaignSchema.safeParse(base).success);assert.equal(campaignSchema.safeParse({...base,endsAt:base.startsAt}).success,false);
 assert.equal(campaignSchema.safeParse({...base,destination:'https://external.test'}).success,false);assert.equal(campaignSchema.safeParse({...base,userIds:['all']}).success,false);
});

test('poster-only campaigns accept omitted copy but empty campaigns are rejected',()=>{
 const base={audience:'TRAINEES',channel:'AD',placement:'HOME',status:'PUBLISHED',destination:'NONE',priority:0,userIds:[],gymIds:[],startsAt:'2026-10-20T00:00:00Z',endsAt:'2026-10-21T00:00:00Z',imageId:'12345678-1234-4234-8234-123456789012',expectedVersion:0};
 const poster=campaignSchema.parse(base);assert.equal(poster.title,'');assert.equal(poster.body,'');
 assert.ok(campaignSchema.safeParse({...base,title:' ',body:'  '}).success);
 assert.equal(campaignSchema.safeParse({...base,imageId:null}).success,false);
 assert.ok(campaignSchema.safeParse({...base,imageId:null,title:'عنوان فقط'}).success);
 assert.ok(campaignSchema.safeParse({...base,imageId:null,body:'تفاصيل فقط'}).success);
 assert.equal(campaignSchema.safeParse({...base,title:'x'.repeat(121)}).success,false);
});
