import {scheduledPromotionAcceptance} from '../workflows/service-charges';
import {start} from 'workflow/api';
import {scheduledReservation,restoreBookingTimers} from '../workflows/booking';
import {upstream,json} from './gateway';
/** Authenticate before persisting a run. Session tokens are never stored in workflows. */
export async function bookingWorkflowRequest(path:string,method:string,token:string,body:Uint8Array|undefined,key:string){
 const promotion=/^promotions\/requests\/([0-9a-f-]{36})\/action$/i.exec(path);
 if(promotion&&method==='POST'){
  let input:unknown;
  try{input=JSON.parse(new TextDecoder().decode(body));}catch{return json({code:'INVALID_INPUT'},400);}
  if(!input||typeof input!=='object'||!('action' in input)||input.action!=='ACCEPT')return null;
  const identity=await upstream('me',{},token);
  if(!identity.ok)return json(await identity.json(),identity.status);
  const user=await identity.json() as {id:string};
  const run=await start(scheduledPromotionAcceptance,[user.id,promotion[1]!,input]);
  const outcome=await run.returnValue;
  return json(outcome.body,outcome.status);
 }
 if(method!=='POST'||!['trainee/bookings','admin/bookings/process-due'].includes(path))return null;
 const identity=await upstream('me',{},token);
 if(!identity.ok)return json(await identity.json(),identity.status);
 const user=await identity.json() as {id:string;role:string};
 if(path.startsWith('admin/')){
  if(user.role!=='PLATFORM_ADMIN')return json({code:'ACCESS_DENIED'},403);
  await start(restoreBookingTimers,[user.id]);
  return null; // Preserve the existing admin processing response.
 }
 if(user.role!=='TRAINEE')return json({code:'ACCESS_DENIED'},403);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key))return json({code:'INVALID_INPUT'},400);
 let input:unknown;
 try{input=JSON.parse(new TextDecoder().decode(body));}catch{return json({code:'INVALID_INPUT'},400);}
 const run=await start(scheduledReservation,[user.id,key,input]);
 // Parent completion waits for reservation and child enqueue, not for the deadline.
 const outcome=await run.returnValue;
 return json(outcome.body,outcome.status);
}
