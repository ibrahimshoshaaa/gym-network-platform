import {boundedBody,checkOrigin,GatewayError} from '../../../../lib/security';
import {failure,json,setWebSession,upstream} from '../../../../lib/gateway';
import {trustedClientAddress} from '../../../../lib/client-address';
export const runtime='nodejs';
export async function GET(r:Request,c:{params:Promise<{action:string}>}){
 try{const {action}=await c.params;if(action!=='status')throw new GatewayError('NOT_FOUND',404);const response=await upstream('auth/phone/status',{method:'GET'},undefined,trustedClientAddress(r));return json(await response.json(),response.status);}catch(e){return failure(e);}
}
export async function POST(r:Request,c:{params:Promise<{action:string}>}){
 try{
  checkOrigin(r);const {action}=await c.params;
  if(!['challenge','register','reset'].includes(action))throw new GatewayError('NOT_FOUND',404);
  if(!r.headers.get('content-type')?.startsWith('application/json'))throw new GatewayError('INVALID_INPUT',400);
  const body=await boundedBody(r,8192);
  const response=await upstream('auth/phone/'+action,{method:'POST',headers:{'content-type':'application/json'},body:body as BodyInit},undefined,trustedClientAddress(r));
  const result=await response.json();
  if(!response.ok)return json({code:result.code??'INVALID_INPUT'},response.status);
  if(action==='register'){
   if(!result.accessToken||!result.user||!result.expiresAt)throw new GatewayError('ACCESS_DENIED',403);
   await setWebSession(result.accessToken,result.expiresAt,true);
   return json({user:result.user,testMode:true});
  }
  return json(result,response.status);
 }catch(e){return failure(e);}
}
