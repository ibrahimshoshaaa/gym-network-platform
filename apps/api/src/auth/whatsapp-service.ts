import {randomBytes, randomInt, randomUUID, timingSafeEqual} from 'node:crypto';
import type {PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {DomainError} from '../domain/errors.js';
import {serializable} from '../ledger/service.js';
import {hashToken} from './sessions.js';
import {consumeAuthLimit} from './throttle.js';
import {phoneSchema} from './validation.js';

export function whatsappConfig(env: NodeJS.ProcessEnv = process.env) {
 const phone = env.GYMBANK_WHATSAPP_PHONE ?? '';
 const phoneNumberId = env.GYMBANK_WHATSAPP_PHONE_NUMBER_ID ?? '';
 const appSecret = env.GYMBANK_WHATSAPP_APP_SECRET ?? '';
 const verifyToken = env.GYMBANK_WHATSAPP_VERIFY_TOKEN ?? '';
 if (env.GYMBANK_WHATSAPP_ENABLED !== 'true' || !/^\+[1-9]\d{7,14}$/.test(phone) ||
     !/^\d{5,32}$/.test(phoneNumberId) || appSecret.length < 16 || verifyToken.length < 32) return null;
 return {phone, phoneNumberId, appSecret, verifyToken};
}
export function requireWhatsapp() {
 const config = whatsappConfig();
 if (!config) throw new DomainError('WHATSAPP_UNAVAILABLE');
 return config;
}
export const whatsappSecretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const whatsappProofHash = (id:string, phone:string, purpose:string, token:string) => hashToken(`whatsapp:${id}:${phone}:${purpose}:${token}`);
const numericMessageHash = (phone:string, purpose:string, code:string) => hashToken(`whatsapp-message:${phone}:${purpose}:${code}`);
export const matchesHash = (actual:string, expected:string) => /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));
const challengeSchema = z.object({phone:phoneSchema,purpose:z.enum(['REGISTER','RESET'])}).strict();
const checkSchema = challengeSchema.extend({challengeId:z.string().uuid(),whatsappToken:whatsappSecretSchema}).strict();
function parse<S extends z.ZodType>(schema:S, input:unknown):z.infer<S> {
 const parsed=schema.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT');return parsed.data;
}

export async function requestWhatsappChallenge(db:PrismaClient,input:unknown) {
 const config=requireWhatsapp(), {language,...data}=parse(challengeSchema.extend({language:z.enum(['ar','en']).default('ar')}),input);
 if(data.purpose==='REGISTER'&&await db.user.findUnique({where:{phoneE164:data.phone},select:{id:true}}))throw new DomainError('ACCOUNT_UNAVAILABLE');
 await consumeAuthLimit(db,'whatsapp-phone-hour',data.phone,5,3600);
 const id=randomUUID(), token=randomBytes(32).toString('base64url');
 let messageCode='';
 const expiresAt=new Date(Date.now()+5*60000);
 await serializable(db,async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-otp:${data.phone}`},0))`;
  if(data.purpose==='REGISTER'&&await tx.user.findUnique({where:{phoneE164:data.phone},select:{id:true}}))throw new DomainError('ACCOUNT_UNAVAILABLE');
  const previous=await tx.phoneOtpChallenge.findFirst({where:{phone:data.phone,purpose:data.purpose,mode:'whatsapp'},orderBy:{createdAt:'desc'}});
  if(previous&&Date.now()-previous.createdAt.getTime()<60000)throw new DomainError('PHONE_OTP_WAIT');
  // The phone lock serializes allocations for this sender. Never reuse a code
  // from this phone/purpose's history, including an expired or consumed proof.
  messageCode='';
  for(let attempt=0;attempt<10;attempt++){
   const candidate=String(randomInt(100000000)).padStart(8,'0');
   if(!await tx.phoneOtpChallenge.findUnique({where:{whatsappMessageHash:numericMessageHash(data.phone,data.purpose,candidate)},select:{id:true}})){messageCode=candidate;break;}
  }
  if(!messageCode)throw new DomainError('SERVICE_UNAVAILABLE');
  await tx.phoneOtpChallenge.updateMany({where:{phone:data.phone,purpose:data.purpose,consumedAt:null},data:{consumedAt:new Date()}});
  await tx.phoneOtpChallenge.create({data:{id,...data,mode:'whatsapp',expiresAt,
   codeHash:whatsappProofHash(id,data.phone,data.purpose,token),
   whatsappMessageHash:numericMessageHash(data.phone,data.purpose,messageCode),whatsappDestinationId:config.phoneNumberId}});
 });
 const message=(language==='en'?(data.purpose==='RESET'?'Verify password recovery in GymBank':'Verify mobile number in GymBank'):(data.purpose==='RESET'?'تأكيد استرجاع كلمة السر في GymBank':'تأكيد رقم الموبايل في GymBank'))+`\n${language==='en'?'Verification code:':'رمز التحقق:'} ${messageCode}`;
 return {challengeId:id,whatsappToken:token,expiresAt:expiresAt.toISOString(),retryAfterSeconds:60,
  whatsappUrl:`https://wa.me/${config.phone.slice(1)}?text=${encodeURIComponent(message)}`,phone:data.phone,businessPhone:config.phone};
}

export async function checkWhatsappChallenge(db:PrismaClient,input:unknown,cancel=false) {
 requireWhatsapp();const data=parse(checkSchema,input);
 const c=await db.phoneOtpChallenge.findUnique({where:{id:data.challengeId}});
 if(!c||c.mode!=='whatsapp'||c.phone!==data.phone||c.purpose!==data.purpose||
   !matchesHash(whatsappProofHash(c.id,c.phone,c.purpose,data.whatsappToken),c.codeHash))throw new DomainError('PHONE_OTP_INVALID');
 await consumeAuthLimit(db,'whatsapp-check',c.id,100,600);
 if(cancel){await db.phoneOtpChallenge.updateMany({where:{id:c.id,consumedAt:null},data:{consumedAt:new Date()}});return {status:'cancelled'};}
 return {status:c.consumedAt?'cancelled':c.expiresAt<=new Date()?'expired':c.verifiedAt?'verified':'pending'};
}

const messageSchema=z.object({id:z.string().min(1).max(256),from:z.string().regex(/^[1-9]\d{7,14}$/),
 timestamp:z.string().regex(/^\d{1,12}$/),type:z.string(),text:z.object({body:z.string().max(2048)}).optional()});
const envelope=z.object({object:z.literal('whatsapp_business_account'),entry:z.array(z.object({
 changes:z.array(z.object({field:z.string(),value:z.object({metadata:z.object({phone_number_id:z.string()}).optional(),
 messages:z.array(z.unknown()).max(100).optional()})})).max(100),
})).max(100)});
export function whatsappMessages(input:unknown,destination:string) {
 const parsed=envelope.safeParse(input);if(!parsed.success)throw new DomainError('INVALID_INPUT');
 return parsed.data.entry.flatMap(entry=>entry.changes.flatMap(change=>{
  if(change.field!=='messages'||change.value.metadata?.phone_number_id!==destination)return [];
  return (change.value.messages??[]).flatMap(raw=>{
   const m=messageSchema.safeParse(raw);if(!m.success||m.data.type!=='text')return [];
   const match=/^(تأكيد رقم الموبايل في GymBank|تأكيد استرجاع كلمة السر في GymBank|Verify mobile number in GymBank|Verify password recovery in GymBank)\n(?:GBVERIFY ([A-Za-z0-9_-]{43})|(?:رمز التحقق:|Verification code:) ([0-9]{8}))$/.exec(m.data.text?.body?.trim()??'');
   if(!match)return [];
   const phone='+'+m.data.from,purpose=['تأكيد رقم الموبايل في GymBank','Verify mobile number in GymBank'].includes(match[1]!)?'REGISTER':'RESET';
   // Accept outstanding legacy messages during rollout; short codes are bound
   // to the signed webhook sender and purpose, while poll secrets stay long.
   return [{id:m.data.id,phone,time:new Date(Number(m.data.timestamp)*1000),purpose,
    hash:match[3]?numericMessageHash(phone,purpose,match[3]):hashToken(match[2]!)}];
  });
 }));
}

export async function receiveWhatsappMessages(db:PrismaClient,input:unknown) {
 const config=requireWhatsapp();
 for(const m of whatsappMessages(input,config.phoneNumberId))await serializable(db,async tx=>{
  const c=await tx.phoneOtpChallenge.findUnique({where:{whatsappMessageHash:m.hash}});
  if(!c||c.mode!=='whatsapp'||c.phone!==m.phone||c.purpose!==m.purpose||c.whatsappDestinationId!==config.phoneNumberId||
    c.consumedAt||c.verifiedAt||c.expiresAt<=new Date()||m.time.getTime()+1000<c.createdAt.getTime()||m.time>c.expiresAt||m.time.getTime()>Date.now()+60000)return;
  // Lock both the challenge and incoming message identity. Retried deliveries
  // never extend a proof or acknowledge another challenge with the same ID.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wa-message:${m.id}`},0))`;
  if(await tx.phoneOtpChallenge.findUnique({where:{whatsappMessageId:m.id}}))return;
  await tx.phoneOtpChallenge.updateMany({where:{id:c.id,verifiedAt:null,consumedAt:null,expiresAt:{gt:new Date()}},
   data:{verifiedAt:new Date(),whatsappMessageId:m.id}});
 });
 return {ok:true};
}
