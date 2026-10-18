import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test,{after} from 'node:test';
import {PrismaClient} from '@prisma/client';
import {createTicket,listTickets,ticketDetail,replyTicket,setTicketStatus} from '../src/engagement/support.js';
import {notificationFeed,readNotifications,homeSummary} from '../src/engagement/feed.js';
import {changeUserAccess,issueRecovery,completeRecovery} from '../src/engagement/accounts.js';
import {hashPassword,verifyPassword} from '../src/auth/passwords.js';
import {createSession,authenticate} from '../src/auth/sessions.js';
import {accessReceipt,type ReceiptStorage} from '../src/topups/receipts.js';
import {uploadBusinessImage,type BusinessStorage} from '../src/media/service.js';
import {buildApp} from '../src/app.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw new Error('Disposable local test database required');
const db=new PrismaClient();after(async()=>db.$disconnect());
const password='Synthetic engagement password only!';
async function fixture(){const hash=await hashPassword(password);const create=(role:'TRAINEE'|'GYM_OWNER'|'PLATFORM_ADMIN'|'CASHIER')=>db.user.create({data:{role,displayName:'Synthetic '+role,phoneE164:'+20eng'+randomUUID(),email:randomUUID()+'@example.test',password:{create:{passwordHash:hash}}}});const admin=await create('PLATFORM_ADMIN'),user=await create('TRAINEE'),outsider=await create('TRAINEE'),owner=await create('GYM_OWNER'),cashier=await create('CASHIER');await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:user.id}});const gym=await db.gym.create({data:{ownerId:owner.id,name:'Synthetic engagement gym',ownerAcceptedAt:new Date(),status:'ACTIVE'}});const branch=await db.branch.create({data:{gymId:gym.id,name:'Synthetic engagement branch',visitPricePoints:20,sessionMinutes:120}});return{admin,user,outsider,owner,cashier,gym,branch};}
const rejects=(p:Promise<unknown>,code:string)=>assert.rejects(p,(e:unknown)=>Boolean(e&&typeof e==='object'&&'code'in e&&e.code===code));
test('support is private, immutable, paginated and retry-safe; only actual ticket owner and admins can read evidence',async()=>{
 const f=await fixture();const receipt=await db.receiptEvidence.create({data:{ownerUserId:f.user.id,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),contentHash:randomUUID(),mimeType:'image/jpeg',bytes:10}});
 const body={subject:'Synthetic charge help',category:'TOPUP',body:'Synthetic support question',receiptId:receipt.id,clientKey:randomUUID()};
 const [a,b]=await Promise.all([createTicket(db,f.user.id,body),createTicket(db,f.user.id,body)]);assert.equal(a.id,b.id);
 assert.equal((await listTickets(db,f.user.id,{})).items.length,1);assert.equal((await listTickets(db,f.outsider.id,{})).items.length,0);
 await rejects(ticketDetail(db,f.outsider.id,a.id),'NOT_FOUND');await rejects(createTicket(db,f.outsider.id,{...body,clientKey:randomUUID()}),'RECEIPT_ACCESS_DENIED');
 await rejects(createTicket(db,f.user.id,{...body,clientKey:randomUUID(),operationId:randomUUID()}),'NOT_FOUND');
 const reply={body:'Synthetic admin reply',clientKey:randomUUID()};await replyTicket(db,f.admin.id,a.id,reply);await replyTicket(db,f.admin.id,a.id,reply);
 assert.equal((await ticketDetail(db,f.user.id,a.id)).ticket.status,'WAITING_USER');assert.equal((await ticketDetail(db,f.user.id,a.id)).items.length,2);
 const adminProof=await db.receiptEvidence.create({data:{ownerUserId:f.admin.id,objectKey:'synthetic/'+randomUUID(),assetId:randomUUID(),contentHash:randomUUID(),mimeType:'image/jpeg',bytes:10}});
 await replyTicket(db,f.admin.id,a.id,{body:'Synthetic evidence shared with actual ticket owner',receiptId:adminProof.id,clientKey:randomUUID()});
 const storage:ReceiptStorage={upload:async()=>({objectKey:'unused',assetId:'unused'}),remove:async()=>{},readUrl:()=> 'https://synthetic.example.test/private'};
 assert.ok((await accessReceipt(db,storage,f.user.id,adminProof.id)).url);await rejects(accessReceipt(db,storage,f.outsider.id,adminProof.id),'RECEIPT_ACCESS_DENIED');
 const message=(await ticketDetail(db,f.user.id,a.id)).items[0]!;await assert.rejects(db.supportMessage.update({where:{id:message.id},data:{body:'Edited history'}}));
 await setTicketStatus(db,f.user.id,a.id,{status:'CLOSED',reason:'Synthetic user resolved question'});await rejects(replyTicket(db,f.user.id,a.id,{body:'New closed reply',clientKey:randomUUID()}),'INVALID_STATE');await rejects(setTicketStatus(db,f.user.id,a.id,{status:'OPEN',reason:'Synthetic reopen request'}),'ACCESS_DENIED');await setTicketStatus(db,f.admin.id,a.id,{status:'OPEN',reason:'Synthetic reopened by administrator'});
 assert.equal((await db.pointAccount.findFirstOrThrow({where:{ownerUserId:f.user.id,type:'TRAINEE_WALLET'}})).balance,0);
});
test('notifications derive only authorized source records, retain read state and show expiry warning without confiscation',async()=>{
 const f=await fixture();const t=await createTicket(db,f.user.id,{subject:'Synthetic notification',category:'HELP',body:'Synthetic request for help',clientKey:randomUUID()});
 const first=await notificationFeed(db,f.user.id);assert.ok(first.items.some(i=>i.referenceId===t.id));assert.ok(!(await notificationFeed(db,f.outsider.id)).items.some(i=>i.referenceId===t.id));
 await readNotifications(db,f.user.id,{ids:first.items.map(i=>i.id)});assert.ok((await notificationFeed(db,f.user.id)).items.every(i=>i.read));
 await replyTicket(db,f.admin.id,t.id,{body:'Synthetic answer changes event version',clientKey:randomUUID()});assert.ok((await notificationFeed(db,f.user.id)).items.some(i=>!i.read));
 const w=await db.pointAccount.findFirstOrThrow({where:{ownerUserId:f.user.id,type:'TRAINEE_WALLET'}});
 // An empty wallet can carry a deadline, but must not generate an expiry alarm.
 await db.pointAccount.update({where:{id:w.id},data:{expiresAt:new Date(Date.now()+86400000)}});assert.ok(!(await notificationFeed(db,f.user.id)).items.some(i=>i.id.startsWith('expiry:')));
 const summary=await homeSummary(db,f.cashier.id);assert.ok(!summary.cards.some(c=>c.unit==='piasters'));assert.ok(!summary.cards.some(c=>c.destination==='users'));
});
test('admin-issued recovery is one-time, revokes sessions and cannot bypass disabled or admin identity protections',async()=>{
 const f=await fixture(),oldToken=await createSession(db,f.user.id,new Date(Date.now()+60000));
 await rejects(issueRecovery(db,f.outsider.id,f.user.id,{password,reason:'Synthetic verified recipient',identityVerified:true}),'ACCESS_DENIED');
 await rejects(issueRecovery(db,f.admin.id,f.user.id,{password:'wrong',reason:'Synthetic verified recipient',identityVerified:true}),'INVALID_CREDENTIALS');
 await rejects(issueRecovery(db,f.admin.id,f.admin.id,{password,reason:'Synthetic prohibited self reset',identityVerified:true}),'ACCESS_DENIED');
 const issued=await issueRecovery(db,f.admin.id,f.user.id,{password,reason:'Synthetic offline identity checked',identityVerified:true});const newPassword='Synthetic replacement long password!';
 await completeRecovery(db,{token:issued.token,password:newPassword});assert.equal(await authenticate(db,'Bearer '+oldToken),null);assert.ok(await verifyPassword(newPassword,(await db.userPassword.findUniqueOrThrow({where:{userId:f.user.id}})).passwordHash));
 await rejects(completeRecovery(db,{token:issued.token,password:newPassword}),'RECOVERY_INVALID');
 const other=await issueRecovery(db,f.admin.id,f.user.id,{password,reason:'Synthetic second verified reset',identityVerified:true});await changeUserAccess(db,f.admin.id,f.user.id,{active:false,password,reason:'Synthetic user suspended before reset'});await rejects(completeRecovery(db,{token:other.token,password:newPassword}),'RECOVERY_INVALID');
 await rejects(changeUserAccess(db,f.admin.id,f.admin.id,{active:false,password,reason:'Synthetic prevent removing admin'}),'ACCESS_DENIED');
 const audit=await db.auditLog.findMany({where:{entityId:issued.token}});assert.equal(audit.length,0);
});
test('new private endpoints require authentication and role scopes',async()=>{const app=buildApp(db),f=await fixture(),token=await createSession(db,f.user.id,new Date(Date.now()+60000));try{for(const path of ['/support/tickets','/notifications','/home-summary','/admin/users','/admin/audit','/admin/wallet-expiry']){assert.equal((await app.inject({method:'GET',url:path})).statusCode,401);if(path.startsWith('/admin'))assert.equal((await app.inject({method:'GET',url:path,headers:{authorization:'Bearer '+token}})).statusCode,403);}}finally{await app.close();}});

test('business image uploads are scoped, bounded and never reused as private financial evidence',async()=>{
 const f=await fixture();const {default:sharp}=await import('sharp');const image=await sharp({create:{width:2,height:2,channels:3,background:'#087c70'}}).jpeg().toBuffer();
 let uploads=0,removed=0;
 const storage:BusinessStorage={upload:async(_data,key)=>{uploads++;return{objectKey:key,assetId:randomUUID(),publicUrl:'https://res.cloudinary.com/synthetic/image/upload/'+randomUUID()+'.jpg'};},remove:async()=>{removed++;}};
 await rejects(uploadBusinessImage(db,storage,f.outsider.id,f.gym.id,f.branch.id,'PHOTO',image),'GYM_ACCESS_DENIED');assert.equal(uploads,0);
 const logo=await uploadBusinessImage(db,storage,f.owner.id,f.gym.id,undefined,'LOGO',image);assert.ok(logo.url.startsWith('https://res.cloudinary.com/'));assert.equal('objectKey'in logo,false);
 for(let n=0;n<6;n++)await uploadBusinessImage(db,storage,f.owner.id,f.gym.id,f.branch.id,'PHOTO',image);
 await rejects(uploadBusinessImage(db,storage,f.owner.id,f.gym.id,f.branch.id,'PHOTO',image),'IMAGE_LIMIT');assert.equal(removed,1);
 assert.equal(await db.receiptEvidence.count({where:{objectKey:{startsWith:'gym-business/'+f.gym.id}}}),0);
});
