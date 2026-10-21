import {sleep} from 'workflow';
import {start} from 'workflow/api';
import {reserveBooking,expireBooking,existingTimers} from './booking-steps';
export async function bookingDeadline(id:string,deadline:string){
 'use workflow';
 let next:string|null=deadline;
 while(next){
  await sleep(new Date(new Date(next).getTime()+1));
  next=await expireBooking(id);
 }
}
export async function scheduledReservation(actor:string,key:string,input:unknown){
 'use workflow';
 // This parent is persisted BEFORE funds are reserved. Retrying its reservation
 // step reuses the existing ledger key. The independent child owns the deadline.
 const outcome=await reserveBooking(actor,key,input);
 if('id' in outcome.body&&outcome.body.status==='RESERVED'){
  await start(bookingDeadline,[outcome.body.id,new Date(outcome.body.deadlineAt).toISOString()]);
 }
 return outcome;
}
export async function restoreBookingTimers(actor:string){
 'use workflow';
 let cursor:string|undefined;
 let scheduled=0;
 while(true){
  const rows=await existingTimers(actor,cursor);
  for(const row of rows){await start(bookingDeadline,[row.id,row.deadline]);scheduled++;}
  if(rows.length<100)return {scheduled};
  cursor=rows[rows.length-1]!.id;
 }
}
