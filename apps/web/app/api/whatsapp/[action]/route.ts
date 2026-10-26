import {boundedBody,checkOrigin,GatewayError} from '../../../../lib/security';
import {failure,json,upstream} from '../../../../lib/gateway';
import {trustedClientAddress} from '../../../../lib/client-address';
export const runtime='nodejs';
export async function GET(r:Request,c:{params:Promise<{action:string}>}) {
 try {
  const {action}=await c.params;if(action!=='status')throw new GatewayError('NOT_FOUND',404);
  const result=await upstream('auth/whatsapp/status',{},undefined,trustedClientAddress(r));
  return json(await result.json(),result.status);
 }catch(e){return failure(e);}
}
export async function POST(r:Request,c:{params:Promise<{action:string}>}) {
 try {
  checkOrigin(r);const {action}=await c.params;
  if(!['challenge','check','cancel'].includes(action))throw new GatewayError('NOT_FOUND',404);
  if(!r.headers.get('content-type')?.startsWith('application/json'))throw new GatewayError('INVALID_INPUT',400);
  const body=await boundedBody(r,8192);
  const result=await upstream('auth/whatsapp/'+action,{method:'POST',headers:{'content-type':'application/json'},body:body as BodyInit},undefined,trustedClientAddress(r));
  return json(await result.json(),result.status);
 }catch(e){return failure(e);}
}
