import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import test from 'node:test';
const apiRequire=createRequire(new URL('../../api/package.json',import.meta.url));
const webRequire=createRequire(import.meta.url);
const {PrismaClient}=apiRequire('@prisma/client');
const {hashPassword}=await import('../../api/dist/auth/passwords.js');
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/(gym_ci|gym_test)$/.test(url.pathname))throw new Error('Disposable local test database required');
const db=new PrismaClient(),origin='http://127.0.0.1:3100';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,{cookie,method='GET',body,headers={},crossOrigin=false}={}){
 return fetch(origin+path,{method,redirect:'manual',headers:{...(cookie?{cookie}:{}),...(method!=='GET'?{origin:crossOrigin?'https://foreign.example.test':origin}:{}),...(body?{'content-type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
}
const sessionCookie=r=>r.headers.getSetCookie().find(h=>h.startsWith('__Host-gym_session='))?.split(';')[0];
async function ready(child){for(let i=0;i<180;i++){if(child.exitCode!==null)throw new Error('Web server exited before readiness');try{await fetch(origin+'/api/health');return;}catch{await sleep(250);}}throw new Error('Web readiness timed out');}
async function ok(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
test('platform-only browser administration and independent native workflows',{timeout:180000},async()=>{
 const password='Synthetic administrator passphrase!',passwordHash=await hashPassword(password),id=randomUUID();
 const actors={};let index=0;
 for(const role of ['PLATFORM_ADMIN','GYM_OWNER','TRAINEE','BRANCH_MANAGER','CASHIER'])actors[role]=await db.user.create({data:{role,displayName:'Synthetic '+role,email:`${role.toLowerCase()}-${id}@example.test`,phoneE164:'+2015'+String(BigInt('0x'+id.replaceAll('-','').slice(0,10))%10000000n).padStart(7,'0')+(index++),password:{create:{passwordHash}}}});
 await db.pointAccount.create({data:{type:'TRAINEE_WALLET',ownerUserId:actors.TRAINEE.id,balance:0,expiresAt:new Date(Date.now()+86400000*180)}});
 const gym=await db.gym.create({data:{ownerId:actors.GYM_OWNER.id,name:'Platform Web Test Gym',ownerAcceptedAt:new Date(),status:'ACTIVE'}});
 const branch=await db.branch.create({data:{gymId:gym.id,name:'Platform Web Test Branch',status:'ACTIVE',address:'Synthetic address',governorate:'Menofia',city:'Test city',latitude:30,longitude:31,pricingVersion:1,priceApprovedAt:new Date(),visitPricePoints:20,sessionMinutes:120}});
 for(const role of ['BRANCH_MANAGER','CASHIER'])await db.staffAssignment.create({data:{userId:actors[role].id,branchId:branch.id,role}});
 const child=spawn(process.execPath,[webRequire.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3100'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,NODE_ENV:'production',GYM_EMBEDDED_API:'true',API_INTERNAL_URL:'http://127.0.0.1:1',WEB_ORIGIN:origin,WORKFLOW_LOCAL_BASE_URL:origin},stdio:'inherit'});
 try{
  await ready(child);
  assert.equal((await request('/api/backend/admin/topup-settings',{headers:{authorization:'Bearer attacker'}})).status,401);
  assert.equal((await request('/api/session',{method:'POST',crossOrigin:true,body:{mode:'admin',identifier:actors.PLATFORM_ADMIN.email,password}})).status,403);
  for(const mode of ['auto','trainee','staff','invite'])assert.equal((await request('/api/session',{method:'POST',body:{mode,identifier:actors.PLATFORM_ADMIN.email,password}})).status,400);
  const login=await request('/api/session',{method:'POST',body:{mode:'admin',identifier:actors.PLATFORM_ADMIN.email,password,remember:true}});
  const admin=await ok(login),cookie=sessionCookie(login);assert.ok(cookie);assert.equal(admin.user.role,'PLATFORM_ADMIN');
  assert.match(login.headers.getSetCookie().find(h=>h.startsWith('__Host-gym_session=')),/HttpOnly.*Secure|Secure.*HttpOnly/i);
  const session=await ok(await request('/api/session',{cookie}));assert.equal(session.user.id,actors.PLATFORM_ADMIN.id);
  const nativeActors={};
  // A valid native session cannot be replayed as a browser role session.
  for(const role of ['GYM_OWNER','TRAINEE','BRANCH_MANAGER','CASHIER']){
   const denied=await request('/api/session',{method:'POST',body:{mode:'admin',identifier:actors[role].email,password}});assert.equal(denied.status,401);assert.equal(sessionCookie(denied),undefined);
   const native=await ok(await request('/api/mobile/auth/signin',{method:'POST',body:{identifier:actors[role].email,password}}));assert.equal(native.user.role,role);nativeActors[role]=native.accessToken;
   const stale='__Host-gym_session='+native.accessToken;
   assert.equal((await request('/api/session',{cookie:stale})).status,403);
   assert.equal((await request('/api/backend/admin/topup-settings',{cookie:stale})).status,403);
   const headers={authorization:'Bearer '+native.accessToken};assert.equal((await request('/api/mobile/me',{headers})).status,200);
   assert.equal((await request('/api/mobile/admin/users',{headers})).status,404);
   if(role==='GYM_OWNER')assert.equal((await request('/api/mobile/gyms',{headers})).status,200);
   if(role==='TRAINEE')assert.equal((await request('/api/mobile/trainee/wallet',{headers})).status,200);
  }
  const maintenance=await ok(await request('/api/mobile/maintenance/requests',{method:'POST',headers:{authorization:'Bearer '+nativeActors.GYM_OWNER},body:{branchId:branch.id,clientKey:randomUUID(),equipment:'Synthetic platform review equipment',description:'Synthetic maintenance request for admin detail test',contactPhone:'+201555550003',imageIds:[]}}));
  assert.equal((await ok(await request('/api/backend/maintenance/requests/'+maintenance.id,{cookie}))).id,maintenance.id);
  assert.equal((await request('/api/backend/market/options',{cookie})).status,200);
  const support=await ok(await request('/api/mobile/support/tickets',{method:'POST',headers:{authorization:'Bearer '+nativeActors.TRAINEE},body:{subject:'Synthetic platform support',category:'HELP',body:'Synthetic native message for platform admin review',clientKey:randomUUID()}}));
  assert.equal((await request('/api/backend/support/tickets/'+support.id,{cookie})).status,200);
  await ok(await request('/api/backend/support/tickets/'+support.id+'/messages',{cookie,method:'POST',body:{body:'Synthetic platform administrator answer',clientKey:randomUUID()}}));
  for(const path of ['/api/register','/api/phone-auth/status','/api/whatsapp/status','/api/recover','/api/account-deletion/request','/delete-account']){
   const response=await request(path,{...(path.includes('/status')||path==='/delete-account'?{}:{method:'POST',body:{}})});assert.equal(response.status,404,path);
  }
  for(const [method,path] of [['GET','trainee/wallet'],['GET','gyms'],['POST','trainee/bookings'],['POST','topups'],['POST',`cashier/branches/${branch.id}/visits`]])assert.equal((await request('/api/backend/'+path,{cookie,method,...(method==='POST'?{body:{}}:{})})).status,404,path);
  const settings=await ok(await request('/api/backend/admin/topup-settings',{cookie}));
  await ok(await request('/api/backend/admin/pricing-policies',{cookie,method:'POST',body:{expectedVersion:settings.policy?.version??0,pointPricePiasters:'125',redemptionBps:8000}}));
  await ok(await request('/api/backend/admin/welcome-points',{cookie,method:'PUT',body:{expectedVersion:settings.welcomePoints?.version??0,enabled:false,points:7}}));
  const method=settings.paymentMethods.find(m=>m.type==='WALLET');
  await ok(await request('/api/backend/admin/payment-methods/WALLET',{cookie,method:'PUT',body:{expectedVersion:method?.version??0,account:'+201555550000',accountName:'Platform Test Wallet',enabled:true}}));
  await ok(await request('/api/backend/admin/support-contact',{cookie,method:'PUT',body:{whatsapp:'+201555550001'}}));
  const saved=await ok(await request('/api/backend/admin/topup-settings',{cookie}));assert.equal(saved.policy.pointPricePiasters,'125');assert.equal(saved.welcomePoints.points,7);
  const conflict=await request('/api/backend/admin/pricing-policies',{cookie,method:'POST',body:{expectedVersion:settings.policy?.version??0,pointPricePiasters:'999',redemptionBps:8000}});assert.equal(conflict.status,409);
  // Native registration and verification discovery remain available, without creating browser cookies.
  const nativeRegistration=await request('/api/mobile/auth/register',{method:'POST',body:{displayName:'Synthetic native trainee',email:`native-${id}@example.test`,phone:'+2010'+String(BigInt('0x'+id.replaceAll('-','').slice(0,10))%100000000n).padStart(8,'0'),password}});
  const trainee=await ok(nativeRegistration,201);assert.equal(trainee.user.role,'TRAINEE');assert.equal(sessionCookie(nativeRegistration),undefined);
  assert.equal((await request('/api/mobile/auth/phone/status')).status,200);assert.equal((await request('/api/mobile/auth/whatsapp/status')).status,200);
  if(process.env.GYM_BROWSER_TEST==='1'){
   const {chromium}=await import('@playwright/test');const browser=await chromium.launch({headless:true});
   try{
    const anonymous=await browser.newPage({viewport:{width:393,height:851}});await anonymous.goto(origin);await anonymous.getByRole('button',{name:'دخول لوحة الإدارة',exact:true}).waitFor();
    assert.equal(await anonymous.getByText('إنشاء حساب',{exact:true}).count(),0);
    await anonymous.getByLabel('البريد الإلكتروني أو رقم الموبايل',{exact:true}).fill(actors.PLATFORM_ADMIN.email);await anonymous.getByLabel('كلمة المرور',{exact:true}).fill(password);await anonymous.getByRole('button',{name:'دخول لوحة الإدارة',exact:true}).click();await anonymous.getByRole('heading',{name:'يومك في المنصة',exact:true}).waitFor();await anonymous.close();
    for(const width of [1440,393,320]){
     const context=await browser.newContext({viewport:{width,height:900}});await context.addCookies([{name:'__Host-gym_session',value:cookie.split('=')[1],domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(origin+'/?section=settings');await page.getByRole('heading',{name:'إعدادات المنصة',exact:true}).waitFor();
     await page.evaluate(()=>document.fonts.ready);
     await mkdir(new URL('../build-verification/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL(`../build-verification/admin-settings-${width}.png`,import.meta.url)),fullPage:true});
     assert.equal(await page.locator('.admin-destination-grid .admin-destination').count(),6);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false);
     await page.getByRole('button',{name:/النقاط الترحيبية.*هدية التسجيل/}).click();await page.getByRole('button',{name:'حفظ النقاط الترحيبية',exact:true}).waitFor();
     assert.equal(await page.getByRole('button',{name:'حفظ التسعير',exact:true}).count(),0);
     await page.getByLabel('عدد النقاط الترحيبية',{exact:true}).fill('9');await page.getByRole('button',{name:'حفظ النقاط الترحيبية',exact:true}).click();await page.getByText('تم حفظ التغييرات بنجاح.',{exact:true}).waitFor();
     assert.equal((await ok(await request('/api/backend/admin/topup-settings',{cookie}))).welcomePoints.points,9);
     await page.getByRole('button',{name:'العودة إلى إعدادات المنصة',exact:true}).click();await page.getByRole('button',{name:/سياسة الحجز والحضور.*مهلة السماح/}).click();await page.getByRole('button',{name:'حفظ سياسة الحجز',exact:true}).waitFor();
     assert.equal(await page.getByRole('heading',{name:'حجوزات بانتظار القرار',exact:true}).count(),0);
     await page.getByLabel('مهلة السماح بعد موعد الزيارة — بالدقائق',{exact:true}).fill('75');await page.getByRole('button',{name:'حفظ سياسة الحجز',exact:true}).click();await page.getByText('تم حفظ سياسة الحجز للحجوزات الجديدة.',{exact:true}).waitFor();
     await page.goto(origin+'/?section=support-contact');await page.getByLabel('رقم واتساب الدولي',{exact:true}).fill('+201555550002');await page.getByRole('button',{name:'حفظ بيانات التواصل',exact:true}).click();await page.getByText('تم تحديث بيانات التواصل.',{exact:true}).waitFor();
     assert.equal((await ok(await request('/api/backend/support/contact',{cookie}))).whatsapp,'+201555550002');
     await page.goto(origin+'/?section=booking-reviews');await page.getByRole('heading',{name:'حجوزات بانتظار القرار',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'حفظ سياسة الحجز',exact:true}).count(),0);
     await page.goto(origin+'/?section=users');await page.getByRole('heading',{name:'المستخدمون والوصول للحسابات',exact:true}).waitFor();assert.equal(errors.length,0,errors.join('\n'));
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),false);
     await page.goto(origin+'/?section=settings');await page.getByRole('heading',{name:'إعدادات المنصة',exact:true}).waitFor();
     await mkdir(new URL('../build-verification/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL(`../build-verification/admin-settings-${width}.png`,import.meta.url)),fullPage:true});
     await context.close();
    }
   }finally{await browser.close();}
  }
  const logout=await request('/api/logout',{cookie,method:'POST'});assert.equal(logout.status,200);assert.equal((await request('/api/session',{cookie})).status,401);
 }finally{child.kill('SIGTERM');await db.$disconnect();}
});
