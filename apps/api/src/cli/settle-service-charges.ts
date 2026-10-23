import {PrismaClient} from '@prisma/client';
import {settleGymCharges} from '../charges/service.js';

// Existing balances are reconciled in separate retryable transactions per gym.
const db=new PrismaClient();
try{
 let cursor:string|undefined;
 let settled=0;
 while(true){
  const charges=await db.gymServiceCharge.groupBy({by:['gymId'],where:{voidedAt:null,dueAt:{lte:new Date()},...(cursor?{gymId:{gt:cursor}}:{})},orderBy:{gymId:'asc'},take:100});
  const gyms=await db.gym.findMany({where:{id:{in:charges.map(c=>c.gymId)}},orderBy:{id:'asc'},select:{id:true,ownerId:true}});
  for(const gym of gyms){await settleGymCharges(db,gym.id,gym.ownerId);settled++;}
  if(gyms.length<100)break;
  cursor=gyms[gyms.length-1]!.id;
 }
 console.info('Service debt reconciliation complete',{gyms:settled});
}finally{await db.$disconnect();}
