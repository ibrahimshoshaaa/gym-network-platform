import {dispatchAccountErasure} from '../../../../lib/account-deletion';
import {bookingWorkflowRequest} from "../../../../lib/scheduled-reservation";
import {trustedClientAddress} from '../../../../lib/client-address';
import {allowedPath,boundedBody,checkOrigin,GatewayError} from '../../../../lib/security';
import {failure,json,upstream} from '../../../../lib/gateway';
export const runtime='nodejs';
const publicRoutes=new Set(['auth/account-deletion','auth/account-deletion/status','auth/signin','auth/register','auth/owners/register','auth/invitations/accept','auth/phone/challenge','auth/phone/register','auth/phone/reset']);
export async function GET(r:Request,c:{params:Promise<{path:string[]}>}){return proxy(r,c);}
export async function POST(r:Request,c:{params:Promise<{path:string[]}>}){return proxy(r,c);}
export async function PUT(r:Request,c:{params:Promise<{path:string[]}>}){return proxy(r,c);}
export async function PATCH(r:Request,c:{params:Promise<{path:string[]}>}){return proxy(r,c);}
async function proxy(r:Request,c:{params:Promise<{path:string[]}>}){try{
 const {path:segments}=await c.params,path=segments.join('/'),method=r.method;
 // Native clients send Bearer credentials. Cookies never authorize this bridge.
 if(r.headers.has('origin'))checkOrigin(r);
 const isPublic=(method==='POST'&&publicRoutes.has(path))||(method==='GET'&&path==='auth/phone/status');
 const custom=(method==='GET'&&['me','me/access','me/gym-application'].includes(path))||(method==='POST'&&['auth/logout','me/gym-application/resubmit'].includes(path));
 const bookingAdmin=(method==='GET'&&['admin/booking-policy','admin/bookings/review'].includes(path))||(method==='POST'&&(path==='admin/booking-policy'||path==='admin/bookings/process-due'||/^admin\/bookings\/[0-9a-f-]{36}\/decision$/i.test(path)));
 if(!isPublic&&!custom&&(!allowedPath(method,path)||((path.startsWith('admin/')&&!bookingAdmin)||path==='reports/export')))throw new GatewayError('NOT_FOUND',404);
 const match=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(r.headers.get('authorization')??'');
 if(!isPublic&&!match)throw new GatewayError('UNAUTHENTICATED',401);
 const headers=new Headers(),type=r.headers.get('content-type')??'';
 let body:Uint8Array|undefined;
 if(method!=='GET'){
  const image=/^(maintenance|promotions)\/branches\/[0-9a-f-]{36}\/assets$/i.test(path)||path==='market/assets'||path==='receipts'||/^gyms\/[^/]+\/images$/.test(path)||/^gyms\/[^/]+\/branches\/[^/]+\/images$/.test(path);
  if(image?!/^image\/(jpeg|png|webp)$/.test(type):!type.startsWith('application/json'))throw new GatewayError('INVALID_INPUT',400);
  const maintenance=/^(admin\/)?maintenance\/requests(?:\/[0-9a-f-]{36}\/action)?$/i.test(path);
  headers.set('content-type',type);body=await boundedBody(r,image?4*1024*1024:maintenance?24*1024:8192);
  const key=r.headers.get('idempotency-key');if(key)headers.set('idempotency-key',key);
 }
 const url=new URL(r.url);if(url.search.length>2048)throw new GatewayError('INVALID_INPUT',400);const scheduled=await bookingWorkflowRequest(path,method,match?.[1]??'',body,r.headers.get('idempotency-key')??'');if(scheduled)return scheduled;const response=await upstream(path+url.search,{method,headers,...(body?{body:body as BodyInit}:{})},match?.[1],trustedClientAddress(r));
 if(response.status===204)return new Response(null,{status:204,headers:{'Cache-Control':'no-store, private'}});
 const result=await response.json();if(response.ok)await dispatchAccountErasure(path,result);return json(result,response.status);
 }catch(e){return failure(e);}}

