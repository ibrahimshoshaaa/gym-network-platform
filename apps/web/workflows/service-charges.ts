import {sleep} from 'workflow';
import {start} from 'workflow/api';
import {acceptPromotion,collectPromotion} from './service-charge-steps';

export async function promotionChargeDeadline(id:string,dueAt:string){
 'use workflow';
 let next:string|null=dueAt;
 while(next){
  await sleep(new Date(next));
  next=await collectPromotion(id);
 }
}
export async function scheduledPromotionAcceptance(actor:string,id:string,input:unknown){
 'use workflow';
 const outcome=await acceptPromotion(actor,id,input);
 if('startsAt' in outcome.body&&outcome.body.startsAt){
  await start(promotionChargeDeadline,[id,new Date(outcome.body.startsAt).toISOString()]);
 }
 return outcome;
}
