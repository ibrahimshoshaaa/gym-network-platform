import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {listingBody,filters,searchText} from '../src/market/validation.js';
test('market inputs preserve minor-unit prices and accept only bounded structured listing data',()=>{
 const input={title:'جهاز تمرين',description:'وصف كافٍ للمنتج المعروض',category:'EQUIPMENT',condition:'USED',pricePiasters:'125099',governorate:'المنوفية',city:'شبين',contactPhone:'+201012345678',imageIds:[randomUUID()]};
 assert.equal(listingBody.parse(input).pricePiasters,125099n);
 for(const patch of [{pricePiasters:'1.5'},{pricePiasters:'-1'},{pricePiasters:'1000000000000'},{contactPhone:'javascript:alert(1)'},{imageIds:[]},{imageIds:[input.imageIds[0],input.imageIds[0]]},{imageIds:Array.from({length:7},()=>randomUUID())},{imageUrl:'https://evil.test'},{status:'APPROVED'}])assert.equal(listingBody.safeParse({...input,...patch}).success,false);
 assert.equal(filters.safeParse({min:'100',max:'99'}).success,false);
 assert.equal(filters.safeParse({limit:200}).success,false);
 assert.equal(searchText('أَوْزَان'),'اوزان');
});
