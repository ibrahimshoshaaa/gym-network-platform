import {randomUUID,timingSafeEqual} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {DomainError} from '../domain/errors.js';
import {serializable} from '../ledger/service.js';
import {applicationFields} from '../applications/service.js';
import {hashPassword} from './passwords.js';
import {hashToken} from './sessions.js';
import {sessionResult} from './trainees.js';
import {newPasswordSchema,phoneSchema} from './validation.js';

// Simulated OTP accepts any syntactically valid phone on the isolated preview.
// Recovery still requires an identity created by this preview, never a legacy account.
export function phonePreviewEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.GYMBANK_OTP_MODE==='test' && (env.VERCEL_ENV==='preview'||(env.NODE_ENV!=='production'&&!env.VERCEL_ENV));
}
export function phonePreviewStatus(){const enabled=phonePreviewEnabled();return {enabled,testMode:enabled};}
function requirePreview(){
 if(!phonePreviewEnabled())throw new DomainError('PHONE_OTP_DISABLED');
}
const challengeInput=z.object({phone:phoneSchema,purpose:z.enum(['REGISTER','RESET'])}).strict();
const proof={phone:phoneSchema,challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)};
const registerInput=z.object({...proof,displayName:z.string().trim().min(2).max(100),password:newPasswordSchema,accountType:z.enum(['trainee','owner']).default('trainee'),gym:applicationFields.optional()}).strict().refine(v=>v.accountType!=='owner'||v.gym!==undefined);
const resetInput=z.object({...proof,newPassword:newPasswordSchema}).strict();
function parse<S extends z.ZodType>(schema:S,input:unknown):z.infer<S>{const r=schema.safeParse(input);if(!r.success)throw new DomainError('INVALID_INPUT');return r.data;}

export async function requestPhoneChallenge(db:PrismaClient,input:unknown){
 const data=parse(challengeInput,input);requirePreview();
 return serializable(db,async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-otp:${data.phone}`},0))`;
  const previous=await tx.phoneOtpChallenge.findFirst({where:{phone:data.phone,purpose:data.purpose},orderBy:{createdAt:'desc'}});
  if(previous&&Date.now()-previous.createdAt.getTime()<60000)throw new DomainError('PHONE_OTP_WAIT');
  await tx.phoneOtpChallenge.updateMany({where:{phone:data.phone,purpose:data.purpose,consumedAt:null},data:{consumedAt:new Date()}});
  const id=randomUUID(),expiresAt=new Date(Date.now()+5*60000);
  await tx.phoneOtpChallenge.create({data:{id,...data,mode:'test',codeHash:hashToken(`${id}:${data.phone}:${data.purpose}:123456`),expiresAt}});
  return {challengeId:id,expiresAt:expiresAt.toISOString(),retryAfterSeconds:60,testMode:true};
 });
}

async function withChallenge<T>(db:PrismaClient,data:{phone:string;challengeId:string;code:string},purpose:'REGISTER'|'RESET',run:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
 requirePreview();
 const result=await serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "PhoneOtpChallenge" WHERE id=${data.challengeId}::uuid FOR UPDATE`;
  const c=await tx.phoneOtpChallenge.findUnique({where:{id:data.challengeId}});
  if(!c||c.phone!==data.phone||c.purpose!==purpose||c.mode!=='test'||c.consumedAt||c.expiresAt<=new Date()||c.attempts>=5)return {ok:false as const};
  const actual=hashToken(`${c.id}:${c.phone}:${purpose}:${data.code}`);
  if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(c.codeHash,'hex'))){await tx.phoneOtpChallenge.update({where:{id:c.id},data:{attempts:{increment:1}}});return {ok:false as const};}
  const value=await run(tx);
  await tx.phoneOtpChallenge.update({where:{id:c.id},data:{consumedAt:new Date()}});
  return {ok:true as const,value};
 });
 if(!result.ok)throw new DomainError('PHONE_OTP_INVALID');
 return result.value;
}

export async function registerPhonePreview(db:PrismaClient,input:unknown){
 const data=parse(registerInput,input);requirePreview();
 const passwordHash=await hashPassword(data.password);
 try{return await withChallenge(db,data,'REGISTER',async tx=>{
  const user=await tx.user.create({data:{phoneE164:data.phone,displayName:data.displayName,role:data.accountType==='owner'?'GYM_OWNER':'TRAINEE',password:{create:{passwordHash}},...(data.accountType==='trainee'?{pointAccounts:{create:{type:'TRAINEE_WALLET' as const}}}:{})}});
  await tx.phoneTestIdentity.create({data:{userId:user.id,phone:data.phone}});
  if(data.accountType==='owner')await tx.gymApplication.create({data:{ownerId:user.id,...data.gym!}});
  await tx.auditLog.create({data:{actorId:user.id,entityId:user.id,action:'PHONE_OTP_TEST_REGISTERED',reason:'Simulated OTP in the isolated preview; no SMS delivered and phone ownership is not verified'}});
  // phoneVerifiedAt intentionally remains null: a test code proves no ownership.
  return {...await sessionResult(tx,user),testMode:true};
 });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new DomainError('ACCOUNT_UNAVAILABLE');throw e;}
}

export async function resetPhonePreviewPassword(db:PrismaClient,input:unknown){
 const data=parse(resetInput,input);requirePreview();
 const passwordHash=await hashPassword(data.newPassword);
 return withChallenge(db,data,'RESET',async tx=>{
  const identity=await tx.phoneTestIdentity.findUnique({where:{phone:data.phone}});
  if(!identity)throw new DomainError('PHONE_OTP_INVALID');
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${identity.userId}::uuid FOR UPDATE`;
  const user=await tx.user.findUnique({where:{id:identity.userId},include:{password:true}});
  if(!user?.isActive||user.phoneE164!==data.phone||!user.password||!['TRAINEE','GYM_OWNER'].includes(user.role))throw new DomainError('PHONE_OTP_INVALID');
  await tx.userPassword.update({where:{userId:user.id},data:{passwordHash,changedAt:new Date()}});
  await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
  await tx.qrTicket.deleteMany({where:{userId:user.id}});
  await tx.auditLog.create({data:{actorId:user.id,entityId:user.id,action:'PHONE_OTP_TEST_PASSWORD_RESET',reason:'Simulated OTP for a dedicated test identity; all previous sessions revoked'}});
  return {ok:true,testMode:true};
 });
}
