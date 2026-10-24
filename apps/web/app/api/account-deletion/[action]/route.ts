import { boundedBody,checkOrigin,GatewayError } from '../../../../lib/security';
import { failure,json,upstream } from '../../../../lib/gateway';
import { trustedClientAddress } from '../../../../lib/client-address';
import { dispatchAccountErasure } from '../../../../lib/account-deletion';
export const runtime='nodejs';
export async function POST(r:Request,c:{params:Promise<{action:string}>}){
 try{
  checkOrigin(r);
  const {action}=await c.params;
  if(!['request','status'].includes(action))throw new GatewayError('NOT_FOUND',404);
  if(!r.headers.get('content-type')?.startsWith('application/json'))throw new GatewayError('INVALID_INPUT',400);
  const body=await boundedBody(r,8192),path='auth/account-deletion'+(action==='status'?'/status':'');
  const result=await upstream(path,{method:'POST',headers:{'content-type':'application/json'},body:body as BodyInit},undefined,trustedClientAddress(r));
  const data=await result.json();if(result.ok)await dispatchAccountErasure(path,data);
  const response=json(data,result.status),retry=result.headers.get('retry-after');if(retry)response.headers.set('retry-after',retry);
  return response;
 }catch(e){return failure(e);}
}
