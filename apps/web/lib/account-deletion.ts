import { start } from 'workflow/api';
import { accountMediaErasure } from '../workflows/account-deletion';
// Starting may fail after the DB commits: do not report the destructive action as failed.
// The outbox stays visible in the admin queue, whose process action retries dispatch.
export async function dispatchAccountErasure(path:string,body:unknown){
 if(!['me/account-deletion','auth/account-deletion','auth/account-deletion/status'].includes(path)&&!/^admin\/account-deletions\/[0-9a-f-]{36}\/process$/i.test(path))return;
 const request=(body as {request?:{id?:string;status?:string;erasedAt?:string}})?.request;
 if(request?.id&&request.status==='ERASING'&&request.erasedAt){
  try{await start(accountMediaErasure,[request.id]);}
  catch{console.error('Account erasure dispatch pending',{deletionId:request.id});}
 }
}
