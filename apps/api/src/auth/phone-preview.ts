import {whatsappConfig,requireWhatsapp,whatsappSecretSchema,whatsappProofHash} from './whatsapp-service.js';
import {grantWelcomePoints} from '../points/welcome.js';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {Prisma,type PrismaClient} from '@prisma/client';
import {z} from 'zod';
import {DomainError} from '../domain/errors.js';
import {serializable} from '../ledger/service.js';
import {applicationFields} from '../applications/service.js';
import {hashPassword} from './passwords.js';
import {hashToken} from './sessions.js';
import {consumeAuthLimit} from './throttle.js';
import {textbeeConfig,newPhoneCode,smsCodeHash,sendTextbeeCode} from './textbee.js';
import {sessionResult} from './trainees.js';
import {newPasswordSchema,phoneSchema,phoneCodeSchema} from './validation.js';

// Simulated OTP accepts valid phone numbers only when explicitly enabled.
// Fixed-code recovery is restricted to unverified test identities. SMS proofs use a separate mode.
export function phonePreviewEnabled(env:NodeJS.ProcessEnv=process.env){
 const production=env.VERCEL_ENV==='production'||(env.NODE_ENV==='production'&&env.VERCEL_ENV!=='preview');
 return env.GYMBANK_OTP_MODE==='test' && (!production||env.GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION==='true');
}
export function phoneOtpMode(): 'test'|'textbee'|null {
 if(process.env.GYMBANK_OTP_MODE==='textbee')return textbeeConfig()?'textbee':null;
 return phonePreviewEnabled()?'test':null;
}
export function phonePreviewStatus(){const mode=phoneOtpMode();return {enabled:mode!==null||whatsappConfig()!==null,testMode:mode==='test',smsEnabled:mode!==null,whatsappEnabled:whatsappConfig()!==null};}
function requirePreview(){const mode=phoneOtpMode();if(!mode)throw new DomainError('PHONE_OTP_DISABLED');return mode;}

const challengeInput=z.object({phone:phoneSchema,purpose:z.enum(['REGISTER','RESET']),language:z.enum(['ar','en']).default('ar')}).strict();
const proof={phone:phoneSchema,challengeId:z.string().uuid(),code:phoneCodeSchema.optional(),whatsappToken:whatsappSecretSchema.optional()};
const oneProof=(v:{code?:string;whatsappToken?:string})=>Boolean(v.code)!==Boolean(v.whatsappToken);
const registerInput=z.object({...proof,displayName:z.string().trim().min(2).max(100),password:newPasswordSchema,accountType:z.enum(['trainee','owner']).default('trainee'),gym:applicationFields.optional()}).strict().refine(oneProof).refine(v=>v.accountType!=='owner'||v.gym!==undefined);
const resetInput=z.object({...proof,newPassword:newPasswordSchema}).strict().refine(oneProof);
function parse<S extends z.ZodType>(schema:S,input:unknown):z.infer<S>{const r=schema.safeParse(input);if(!r.success)throw new DomainError('INVALID_INPUT');return r.data;}

export async function requestPhoneChallenge(db:PrismaClient,input:unknown){
 const {language,...data}=parse(challengeInput,input),mode=requirePreview();
 // Avoid billing an SMS for an already registered number, before consuming send limits.
 if(data.purpose==='REGISTER'&&await db.user.findUnique({where:{phoneE164:data.phone},select:{id:true}}))throw new DomainError('ACCOUNT_UNAVAILABLE');
 if(mode==='textbee'){
  await consumeAuthLimit(db,'sms-phone-hour',data.phone,5,3600);
  await consumeAuthLimit(db,'sms-phone-day',data.phone,10,86400);
  await consumeAuthLimit(db,'sms-device-day',textbeeConfig()!.deviceId,100,86400);
 }
 const code=mode==='test'?'123456':newPhoneCode();
 const challenge=await serializable(db,async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`phone-otp:${data.phone}`},0))`;
  if(data.purpose==='REGISTER'&&await tx.user.findUnique({where:{phoneE164:data.phone},select:{id:true}}))throw new DomainError('ACCOUNT_UNAVAILABLE');
  const previous=await tx.phoneOtpChallenge.findFirst({where:{phone:data.phone,mode:{not:'whatsapp'},...(mode==='test'?{purpose:data.purpose}:{})},orderBy:{createdAt:'desc'}});
  if(previous&&Date.now()-previous.createdAt.getTime()<60000)throw new DomainError('PHONE_OTP_WAIT');
  await tx.phoneOtpChallenge.updateMany({where:{phone:data.phone,purpose:data.purpose,consumedAt:null},data:{consumedAt:new Date()}});
  const id=randomUUID(),expiresAt=new Date(Date.now()+5*60000);
  const codeHash=mode==='test'?hashToken(`${id}:${data.phone}:${data.purpose}:${code}`):smsCodeHash(id,data.phone,data.purpose,code);
  await tx.phoneOtpChallenge.create({data:{id,...data,mode,codeHash,expiresAt}});
  return {challengeId:id,expiresAt:expiresAt.toISOString(),retryAfterSeconds:60,testMode:mode==='test'};
 });
 // Send only after commit: serializable retries must never send duplicate messages.
 if(mode==='textbee')try{await sendTextbeeCode(data.phone,code,data.purpose,undefined,language);}catch(error){
  await db.phoneOtpChallenge.updateMany({where:{id:challenge.challengeId,consumedAt:null},data:{consumedAt:new Date()}});
  throw error;
 }
 return challenge;
}

async function withChallenge<T>(db:PrismaClient,data:{phone:string;challengeId:string;code?:string;whatsappToken?:string},purpose:'REGISTER'|'RESET',run:(tx:Prisma.TransactionClient,mode:'test'|'textbee'|'whatsapp')=>Promise<T>,consume=true):Promise<T>{
 const mode=data.whatsappToken?'whatsapp':requirePreview();
 const whatsapp=mode==='whatsapp'?requireWhatsapp():null;
 const result=await serializable(db,async tx=>{
  await tx.$queryRaw`SELECT id FROM "PhoneOtpChallenge" WHERE id=${data.challengeId}::uuid FOR UPDATE`;
  const c=await tx.phoneOtpChallenge.findUnique({where:{id:data.challengeId}});
  if(!c||c.phone!==data.phone||c.purpose!==purpose||c.mode!==mode||c.consumedAt||c.expiresAt<=new Date()||c.attempts>=5)return {ok:false as const};
  if(mode==='whatsapp'&&(!c.verifiedAt||c.whatsappDestinationId!==whatsapp?.phoneNumberId))return {ok:false as const};
  const actual=mode==='whatsapp'?whatsappProofHash(c.id,c.phone,purpose,data.whatsappToken!):mode==='test'?hashToken(`${c.id}:${c.phone}:${purpose}:${data.code}`):smsCodeHash(c.id,c.phone,purpose,data.code!);
  if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(c.codeHash,'hex'))){await tx.phoneOtpChallenge.update({where:{id:c.id},data:{attempts:{increment:1}}});return {ok:false as const};}
  const value=await run(tx,mode);
  if(consume)await tx.phoneOtpChallenge.update({where:{id:c.id},data:{consumedAt:new Date()}});
  return {ok:true as const,value};
 });
 if(!result.ok)throw new DomainError('PHONE_OTP_INVALID');
 return result.value;
}

export async function registerPhonePreview(db:PrismaClient,input:unknown){
 const data=parse(registerInput,input);if(data.whatsappToken)requireWhatsapp();else requirePreview();
 const passwordHash=await hashPassword(data.password);
 try{return await withChallenge(db,data,'REGISTER',async (tx,mode)=>{
  const user=await tx.user.create({data:{phoneE164:data.phone,displayName:data.displayName,role:data.accountType==='owner'?'GYM_OWNER':'TRAINEE',...(mode!=='test'?{phoneVerifiedAt:new Date()}:{}),password:{create:{passwordHash}},...(data.accountType==='trainee'?{pointAccounts:{create:{type:'TRAINEE_WALLET' as const}}}:{})}});
  await grantWelcomePoints(tx,user.id);
  if(mode==='test')await tx.phoneTestIdentity.create({data:{userId:user.id,phone:data.phone}});
  if(data.accountType==='owner')await tx.gymApplication.create({data:{ownerId:user.id,...data.gym!}});
  await tx.auditLog.create({data:{actorId:user.id,entityId:user.id,action:mode==='test'?'PHONE_OTP_TEST_REGISTERED':'PHONE_OTP_REGISTERED',reason:mode==='test'?'Explicitly enabled simulated OTP; no SMS delivered and phone ownership is not verified':mode==='whatsapp'?'Phone ownership verified by signed inbound WhatsApp message':'Phone ownership verified by one-time SMS code'}});
  // A fixed test code must never mark phone ownership as verified.
  return {...await sessionResult(tx,user),testMode:mode==='test'};
 });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2002')throw new DomainError('ACCOUNT_UNAVAILABLE');throw e;}
}

async function resetUser(tx:Prisma.TransactionClient,phone:string,mode:'test'|'textbee'|'whatsapp'){
 const user=await tx.user.findUnique({where:{phoneE164:phone},include:{password:true}});
 // Only disclose a missing account after a real ownership proof was checked.
 if(!user&&mode!=='test')throw new DomainError('PHONE_ACCOUNT_NOT_FOUND');
 // Staff can recover an established password after real SMS verification.
 // Fixed test codes never recover staff or platform administrator accounts.
 const allowedRoles=mode!=='test'?['TRAINEE','GYM_OWNER','BRANCH_MANAGER','CASHIER']:['TRAINEE','GYM_OWNER'];
 if(!user?.isActive||!user.password||!allowedRoles.includes(user.role))throw new DomainError('PHONE_OTP_INVALID');
 if(mode==='test'){
  const identity=await tx.phoneTestIdentity.findUnique({where:{phone}});
  // A test-created account upgraded by a real SMS can never be reset with a fixed code.
  if(!identity||identity.userId!==user.id||user.phoneVerifiedAt)throw new DomainError('PHONE_OTP_INVALID');
 }
 return user;
}
export async function verifyPhoneResetCode(db:PrismaClient,input:unknown){
 const data=parse(z.object(proof).strict().refine(oneProof),input);
 return withChallenge(db,data,'RESET',async (tx,mode)=>{
  await resetUser(tx,data.phone,mode);
  return {ok:true,testMode:mode==='test'};
 },false);
}

export async function resetPhonePreviewPassword(db:PrismaClient,input:unknown){
 const data=parse(resetInput,input);if(data.whatsappToken)requireWhatsapp();else requirePreview();
 const passwordHash=await hashPassword(data.newPassword);
 return withChallenge(db,data,'RESET',async (tx,mode)=>{
  const found=await resetUser(tx,data.phone,mode);
  await tx.$queryRaw`SELECT id FROM "User" WHERE id=${found.id}::uuid FOR UPDATE`;
  const user=await resetUser(tx,data.phone,mode);
  await tx.userPassword.update({where:{userId:user.id},data:{passwordHash,changedAt:new Date()}});
  if(mode!=='test')await tx.user.update({where:{id:user.id},data:{phoneVerifiedAt:new Date()}});
  await tx.authSession.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
  await tx.qrTicket.deleteMany({where:{userId:user.id}});
  await tx.auditLog.create({data:{actorId:user.id,entityId:user.id,action:mode==='test'?'PHONE_OTP_TEST_PASSWORD_RESET':'PHONE_OTP_PASSWORD_RESET',reason:mode==='test'?'Simulated OTP for a dedicated test identity; all previous sessions revoked':mode==='whatsapp'?'Password reset after inbound WhatsApp phone verification; all previous sessions revoked':'Password reset after SMS phone verification; all previous sessions revoked'}});
  return {ok:true,testMode:mode==='test'};
 });
}
