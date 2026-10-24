import { isIP } from 'node:net';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';

import { createBooking, expireScheduledBooking } from './bookings/service.js';
import { consumeAuthLimit } from './auth/throttle.js';
import { requireAdmin } from './auth/authorization.js';
import { DomainError } from './domain/errors.js';

let database: PrismaClient | undefined;
function databaseClient(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
 return database??=new PrismaClient();
}
export async function reserveDurableBooking(actor:string,key:string,input:unknown){
 try {
  await consumeAuthLimit(databaseClient(),'booking-create',actor,30,900);
  return {status:200,body:await createBooking(databaseClient(),actor,key,input)};
 }catch(error){
  if(!(error instanceof DomainError))throw error;
  const statuses:Record<string,number>={INVALID_INPUT:400,ACCESS_DENIED:403,UNAUTHENTICATED:401,NOT_FOUND:404,RATE_LIMITED:429};
  return {status:statuses[error.code]??409,body:{code:error.code}};
 }
}
export function expireDurableBooking(id:string){return expireScheduledBooking(databaseClient(),id);}
export async function reservedBookingTimers(actor:string,cursor?:string){
 const db=databaseClient();
 await requireAdmin(db,actor);
 return db.booking.findMany({where:{status:'RESERVED',...(cursor?{id:{gt:cursor}}:{})},orderBy:{id:'asc'},take:100,select:{id:true,deadlineAt:true}});
}

let app: ReturnType<typeof buildApp> | undefined;
function backend() {
  if (!app) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    app = buildApp(databaseClient());
  }
  return app;
}

// Server-only entrypoint. The Next.js gateway still owns CSRF, cookies,
// the path allowlist and bounded request bodies. Fastify retains user auth.
export async function internalRequest(path: string, init: {
  method?: string;
  headers: Record<string, string>;
  body?: Uint8Array | string;
  remoteAddress?: string;
}) {
  if (!/^[a-z][a-zA-Z0-9/-]*(?:\?.*)?$/.test(path) || path.includes('..')) {
    throw new Error('Invalid internal API path');
  }
  const method = init.method ?? 'GET';
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)) {
    throw new Error('Unsupported internal API method');
  }
  const headers = { ...init.headers };
  delete headers['x-gym-origin-secret'];
  const result = await backend().inject({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS',
    url: '/' + path,
    headers,
    ...(init.body !== undefined ? { payload: typeof init.body === 'string' ? init.body : Buffer.from(init.body) } : {}),
    remoteAddress: init.remoteAddress && isIP(init.remoteAddress) ? init.remoteAddress : '127.0.0.1',
  });
  const output = new Headers();
  for (const [key, value] of Object.entries(result.headers)) {
    if (value !== undefined && !['content-length', 'transfer-encoding', 'connection'].includes(key)) {
      output.set(key, Array.isArray(value) ? value.join(', ') : String(value));
    }
  }
  output.set('cache-control', 'no-store');
  return new Response([204, 205, 304].includes(result.statusCode) ? null : new Uint8Array(result.rawPayload), {
    status: result.statusCode,
    headers: output,
  });
}

/** Durable ad acceptance replays only the same actor/version, never a new approval. */
export async function acceptDurablePromotion(actor:string,id:string,input:unknown){
 const {ownerBody}=await import('./promotions/validation.js');
 const {parse}=await import('./gyms/validation.js');
 const {changePromotion,promotionDetail}=await import('./promotions/service.js');
 try {
  const d=parse(ownerBody,input);
  if(d.action!=='ACCEPT')return {status:400,body:{code:'INVALID_INPUT'}};
  const db=databaseClient();
  const row=await db.promotionRequest.findUnique({where:{id}});
  if(row?.acceptedById===actor&&row.version===d.expectedVersion+1&&row.status==='APPROVED')
   return {status:200,body:await promotionDetail(db,actor,id)};
  return {status:200,body:await changePromotion(db,actor,id,input)};
 }catch(error){
  if(!(error instanceof DomainError))throw error;
  return {status:error.code==='INVALID_INPUT'?400:['ACCESS_DENIED','UNAUTHENTICATED'].includes(error.code)?403:409,body:{code:error.code}};
 }
}
export async function settleDurablePromotion(id:string){
 const {serializable}=await import('./ledger/service.js');
 const {collectDueCharges}=await import('./charges/service.js');
 const {randomUUID}=await import('node:crypto');
 return serializable(databaseClient(),async tx=>{
  const charge=await tx.gymServiceCharge.findUnique({where:{kind_sourceId:{kind:'PROMOTION',sourceId:id}}});
  if(!charge||charge.voidedAt)return null;
  if(charge.dueAt>new Date())return charge.dueAt.toISOString();
  const gym=await tx.gym.findUniqueOrThrow({where:{id:charge.gymId}});
  await collectDueCharges(tx,gym.id,gym.ownerId,randomUUID());
  return null;
 });
}

/** Only an opaque deletion id enters durable execution; credentials never do. */
export async function eraseAccountMedia(id:string){
 const {eraseMediaBatch}=await import('./accounts/deletion-media.js');
 return eraseMediaBatch(databaseClient(),id);
}
