export async function reserveBooking(actor:string,key:string,input:unknown){
 'use step';
 const {reserveDurableBooking}=await import('@gym/api');
 console.info('Durable booking reservation step');
 return reserveDurableBooking(actor,key,input);
}
export async function expireBooking(id:string){
 'use step';
 const {expireDurableBooking}=await import('@gym/api');
 console.info('Durable booking deadline check',{bookingId:id});
 return expireDurableBooking(id);
}
expireBooking.maxRetries=20;
export async function existingTimers(actor:string,cursor?:string){
 'use step';
 const {reservedBookingTimers}=await import('@gym/api');
 const rows=await reservedBookingTimers(actor,cursor);
 return rows.map(row=>({id:row.id,deadline:row.deadlineAt.toISOString()}));
}
