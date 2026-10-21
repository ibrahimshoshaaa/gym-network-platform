import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PrismaClient,type UserRole} from '@prisma/client';
import {saveListing,listMarket,listingDetail,changeListingStatus,reportListing} from '../src/market/service.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw Error('Disposable local test database required');
const db=new PrismaClient();after(()=>db.$disconnect());
test('market is shared by all active roles but ownership, moderation and image attachment remain scoped',async()=>{
 const make=(role:UserRole)=>db.user.create({data:{role,displayName:'Synthetic market '+role,phoneE164:'+20market'+randomUUID()}});
 const admin=await make('PLATFORM_ADMIN'),buyer=await make('TRAINEE');
 const seller=await make('GYM_OWNER'),manager=await make('BRANCH_MANAGER'),cashier=await make('CASHIER');
 const image=(ownerId:string)=>db.marketImage.create({data:{ownerId,assetId:randomUUID(),objectKey:'synthetic/'+randomUUID(),publicUrl:'https://res.cloudinary.com/test/image/upload/synthetic.jpg'}});
 const asset=await image(seller.id),foreign=await image(buyer.id);
 const content={title:'جهاز تمرين أوزان',description:'جهاز بحالة جيدة من جيم اختبار',category:'EQUIPMENT',condition:'USED',pricePiasters:'125050',governorate:'المنوفية',city:'شبين الكوم',contactPhone:'+201012345678',imageIds:[asset.id]};
 const key=randomUUID(),listing=await saveListing(db,seller.id,undefined,{...content,clientKey:key});
 assert.equal(listing.status,'PENDING');assert.equal((await saveListing(db,seller.id,undefined,{...content,clientKey:key})).id,listing.id);
 await assert.rejects(saveListing(db,seller.id,undefined,{...content,title:'Different content',clientKey:key}));
 await assert.rejects(saveListing(db,seller.id,undefined,{...content,imageIds:[foreign.id],clientKey:randomUUID()}));
 assert.equal((await listMarket(db,buyer.id,{})).items.some(r=>r.id===listing.id),false);
 await assert.rejects(listingDetail(db,buyer.id,listing.id));
 assert.equal((await listMarket(db,seller.id,{},'MINE')).items.some(r=>r.id===listing.id),true);
 await assert.rejects(listMarket(db,seller.id,{},'ADMIN'));
 await assert.rejects(changeListingStatus(db,manager.id,listing.id,{status:'APPROVED',expectedVersion:1,reason:'Unauthorized reviewer'},true));
 const published=await changeListingStatus(db,admin.id,listing.id,{status:'APPROVED',expectedVersion:1,reason:'Reviewed and approved'},true);
 for(const actor of [buyer,seller,manager,cashier,admin]){
  const page=await listMarket(db,actor.id,{q:'اوزان',governorate:'المنوفية',min:'125000',max:'125100'});
  assert.equal(page.items.some(r=>r.id===listing.id),true,actor.role);
 }
 assert.equal('contactPhone' in (await listMarket(db,buyer.id,{})).items.find(r=>r.id===listing.id)!,false);
 assert.equal((await listingDetail(db,buyer.id,listing.id)).contactPhone,content.contactPhone);
 await assert.rejects(saveListing(db,buyer.id,listing.id,{...content,expectedVersion:published.version}));
 await assert.rejects(saveListing(db,seller.id,listing.id,{...content,expectedVersion:1}));
 const report=await reportListing(db,buyer.id,listing.id,{reason:'Synthetic report requiring review'});
 assert.equal((await reportListing(db,buyer.id,listing.id,{reason:'Repeat report'})).id,report.id);
 await assert.rejects(reportListing(db,seller.id,listing.id,{reason:'Cannot report own listing'}));
 const edited=await saveListing(db,seller.id,listing.id,{...content,title:'منتج معدل للمراجعة',expectedVersion:published.version});
 assert.equal(edited.status,'PENDING');await assert.rejects(listingDetail(db,buyer.id,listing.id));
 const reapproved=await changeListingStatus(db,admin.id,listing.id,{status:'APPROVED',expectedVersion:edited.version,reason:'Reviewed updated content'},true);
 await assert.rejects(changeListingStatus(db,cashier.id,listing.id,{status:'SOLD',expectedVersion:reapproved.version}));
 await changeListingStatus(db,seller.id,listing.id,{status:'SOLD',expectedVersion:reapproved.version});
 await assert.rejects(listingDetail(db,buyer.id,listing.id));
 for(const actor of [buyer,manager,cashier,admin]){
  const asset=await image(actor.id);
  const own=await saveListing(db,actor.id,undefined,{...content,imageIds:[asset.id],clientKey:randomUUID()});
  assert.equal(own.status,actor.role==='PLATFORM_ADMIN'?'APPROVED':'PENDING');
 }
 const shared=await image(seller.id);
 const race=await Promise.allSettled([1,2].map(i=>saveListing(db,seller.id,undefined,{...content,title:'Concurrent item '+i,imageIds:[shared.id],clientKey:randomUUID()})));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
});
