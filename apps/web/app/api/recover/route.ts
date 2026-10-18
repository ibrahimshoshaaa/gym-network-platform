import {boundedBody,checkOrigin,GatewayError} from '../../../lib/security';
import {failure,json,upstream} from '../../../lib/gateway';
import {trustedClientAddress} from '../../../lib/client-address';
export const runtime='nodejs';
export async function POST(request:Request){try{checkOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new GatewayError('INVALID_INPUT',400);const body=new TextDecoder().decode(await boundedBody(request,4096));let input;try{input=JSON.parse(body);}catch{throw new GatewayError("INVALID_INPUT",400);}if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['token','password'].includes(k)))throw new GatewayError('INVALID_INPUT',400);const r=await upstream('auth/recovery/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)},undefined,trustedClientAddress(request));return json(await r.json(),r.status);}catch(e){return failure(e);}}
