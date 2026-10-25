import {randomUUID} from 'node:crypto';
import type {PrismaClient,UserRole} from '@prisma/client';
import {publishPolicy} from '../src/topups/settings.js';
export async function platformFixture(db:PrismaClient,configurePricing=true){
 const user=(role:UserRole)=>db.user.create({data:{role,displayName:'Synthetic '+role,phoneE164:'+2010'+String(BigInt('0x'+randomUUID().replaceAll('-','').slice(0,12))%100000000n).padStart(8,'0')}});
 const admin=await user('PLATFORM_ADMIN'),owner=await user('GYM_OWNER'),trainee=await user('TRAINEE'),cashier=await user('CASHIER');
 if(configurePricing&&!await db.pricingPolicy.findFirst())await publishPolicy(db,admin.id,{expectedVersion:0,pointPricePiasters:'100',redemptionBps:8000});
 if(!await db.pointAccount.findFirst({where:{type:'ISSUANCE'}}))await db.pointAccount.create({data:{type:'ISSUANCE'}});
 const wallet=await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:trainee.id}});
 const gym=await db.gym.create({data:{ownerId:owner.id,name:'Synthetic Platform Gym',status:'ACTIVE',ownerAcceptedAt:new Date()}});
 return {admin,owner,trainee,cashier,wallet,gym};
}
