import assert from 'node:assert/strict';
import test from 'node:test';
import {chromium} from '@playwright/test';
const origin=process.env.PARITY_ORIGIN??'http://127.0.0.1:3110';
const gym={id:'11111111-1111-4111-8111-111111111111',name:'شوشه جيم',status:'ACTIVE',ownerAcceptedAt:'2026-10-01',owner:{isActive:true},description:'جيم للاختبار'};
const branches=[1,2].map((i)=>({id:`22222222-2222-4222-8222-22222222222${i}`,gymId:gym.id,gymName:gym.name,name:`جولدن جيم ${i}`,status:'ACTIVE',address:'شما أشمون المنوفية',city:'أشمون',governorate:'المنوفية',visitPricePoints:i===1?20:30,sessionMinutes:i===1?180:120,priceApprovedAt:'2026-10-01',pricingVersion:1,pointAccounts:[{balance:100}],canSell:true,canCancel:true,permissions:[],latitude:'30.4',longitude:'31.0',gym}));
const empty={items:[],nextCursor:null},now=new Date().toISOString();
const booking={id:'33333333-3333-4333-8333-333333333333',branchId:branches[0].id,traineeId:'synthetic',scheduledAt:new Date(Date.now()-60000).toISOString(),deadlineAt:new Date(Date.now()+3600000).toISOString(),points:20,status:'RESERVED',policySnapshot:{mode:'MANUAL',graceMinutes:60},absenceReason:null,decisionReason:null,traineePoints:null,gymPoints:null,platformPoints:null,branch:branches[0]};
const balances=['GYM_AVAILABLE','GYM_RESERVED','GYM_DISPUTED','GYM_PAID'].map(type=>({type,balancePiasters:type==='GYM_AVAILABLE'?'1600':'0'}));
const options={policy:{id:'policy',version:1,pointPricePiasters:'100',gymDiscountBps:1000,redemptionBps:8000},paymentMethods:[{type:'WALLET',account:'01000000000',accountName:'حساب اختبار',version:1},{type:'INSTAPAY',account:'test@instapay',accountName:'حساب اختبار آخر',version:1}],packages:[{id:'p100',label:'100 نقطة',points:100,version:1},{id:'p200',label:'200 نقطة',points:200,version:1}]};
async function fixture(browser,role,width=390){
 const ctx=await browser.newContext({viewport:{width,height:844}}),page=await ctx.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/api/backend/',''),body=req.headers()['content-type']?.includes('application/json')?req.postDataJSON():null;calls.push({path,method:req.method(),body,headers:req.headers()});let data=empty;
 if(url.pathname==='/api/session')data={user:{id:'synthetic',displayName:'إبراهيم اختبار',role,email:'test@example.test',phone:'+201500000000'}};
 else if(path==='me/gym-application')data={application:null};
 else if(path==='notifications')data={items:[],unread:0,asOf:now};
 else if(path==='gyms')data={items:role==='GYM_OWNER'?[gym]:[],nextCursor:null};
 else if(path===`gyms/${gym.id}/branches`||path==='operations/branches')data={items:branches,nextCursor:null};
 else if(path.includes('/point-wallet'))data={available:'400',central:'400',branchesTotal:'200',total:'600'};
 else if(path===`gyms/${gym.id}/inventory`)data={central:'400',branchesTotal:'200',total:'600',status:'ACTIVE',branches:branches.map(b=>({...b,stock:100}))};
 else if(path==='reports/summary')data={currentBalances:balances,visits:{count:2},sales:{points:50,amountPiasters:'5000'}};
 else if(path.endsWith('/receivables'))data={accounts:balances};
 else if(path.endsWith('/summary'))data={stock:100,visitPricePoints:20,sessionMinutes:180};
 else if(path==='trainee/wallet')data={balance:150,spendablePoints:150,unavailablePoints:0,expiresAt:new Date(Date.now()+86400000*60).toISOString(),status:'VALID',serverTime:now};
 else if(path==='trainee/bookings')data=req.method()==='POST'?booking:{items:[booking],serverTime:new Date().toISOString()};
 else if(/^trainee\/bookings\/.+\/qr$/.test(path))data={token:'A'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString(),serverTime:new Date().toISOString()};
 else if(path==='booking-policy')data={policy:{id:'booking-policy',version:1,policy:{mode:'MANUAL',graceMinutes:60}}};
 else if(path==='trainee/qr')data={token:'A'.repeat(43),expiresAt:new Date(Date.now()+60000).toISOString(),serverTime:new Date().toISOString()};
 else if(path==='topup-options')data=options;
 else if(path==='topup-quotes')data={points:body.points??(body.packageId==='p200'?200:100),chargePiasters:role==='TRAINEE'?'10000':'9000',pricingVersion:1,unallocatedPiasters:'0'};
 else if(path==='receipts')data={id:'receipt-test'};
 else if(path==='topups'&&req.method()==='POST')data={id:'topup-test',points:100,chargePiasters:'10000',status:'REQUESTED'};
 else if(path.endsWith('/withdrawals')&&req.method()==='POST')data={id:'withdraw-test',...body,status:'REQUESTED'};
 else if(path.endsWith('/stock-transfers')&&req.method()==='POST')data={id:'transfer-test'};
 else if(path.endsWith('/trainee-lookup')||path.endsWith('/lookup'))data={id:'trainee-id',label:'أحمد اختبار',phoneLast4:'1234',role:'TRAINEE',gyms:[]};
 else if(path.endsWith('/sale-quotes'))data={points:50,chargePiasters:'5000',pricingVersion:1,stock:100,traineeLabel:'أحمد اختبار',phoneLast4:'1234'};
 else if(path.endsWith('/sales')&&req.method()==='POST')data={id:'sale-test',points:50,chargePiasters:'5000',traineeLabel:'أحمد اختبار'};
 else if(path==='support/contact')data={whatsapp:null};
 else if(path==='directory/branches')data={items:branches,nextCursor:null,asOf:now};
 else if(path.startsWith('directory/branches/'))data={branch:branches[0],asOf:now};
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(origin);await page.locator('.trainee-navigation').waitFor();
 return {ctx,page,calls,errors};
}
async function nav(page,label){await page.locator('nav.trainee-navigation').getByRole('button',{name:label,exact:true}).click();}
async function screenshot(page,name){if(process.env.PARITY_SCREENSHOTS)await page.screenshot({path:`${process.env.PARITY_SCREENSHOTS}/${name}.png`,fullPage:true});}
async function noOverflow(page){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow');}
test('native web portals mirror trainee, owner and cashier flows without premature financial writes',{timeout:180000},async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [390,1280]){
   const f=await fixture(browser,'TRAINEE',width),{page}=f;
   await page.getByText('150',{exact:false}).first().waitFor();await screenshot(page,`trainee-home-${width}`);await noOverflow(page);
   await nav(page,'رمز الدخول');await page.getByText('رمزك الشخصي').waitFor();await page.locator('.native-qr-image svg').waitFor();assert.ok(f.calls.some(c=>c.path==='trainee/qr'));await page.getByRole('button',{name:'حجوزاتي · اعرض QR الحجز',exact:true}).click();await page.getByText('حجز مؤكد · نقاط محجوزة').waitFor();await page.getByRole('button',{name:'اعرض QR الحجز',exact:true}).click();await page.locator('.native-qr-image svg').waitFor();assert.ok(f.calls.some(c=>c.path===`trainee/bookings/${booking.id}/qr`));await screenshot(page,`booking-qr-${width}`);await page.getByRole('button',{name:'إغلاق',exact:true}).click();
   await nav(page,'زياراتي');assert.equal(await page.getByText('حركات نقاطك').count(),0);
   await nav(page,'الرئيسية');await page.getByRole('button',{name:'اشحن رصيدك',exact:true}).click();await page.getByRole('heading',{name:'اختار رصيدك'}).waitFor();
   await page.getByRole('button',{name:'100 نقطة',exact:false}).first().click();await page.getByRole('button',{name:'متابعة لبيانات التحويل'}).click();await page.getByRole('heading',{name:'حوّل وارفع الإيصال'}).waitFor();assert.equal(await page.getByRole('heading',{name:'اختار رصيدك'}).count(),0);assert.ok(!f.calls.some(c=>c.path==='topups'&&c.method==='POST'));
   await screenshot(page,`trainee-topup-transfer-${width}`);
   await page.getByLabel('صورة إيصال التحويل').setInputFiles({name:'proof.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2bS8AAAAASUVORK5CYII=','base64')});
   await page.getByRole('button',{name:'مراجعة طلب الشحن',exact:true}).click();await page.getByRole('heading',{name:'راجع طلب الشحن'}).waitFor();assert.ok(!f.calls.some(c=>c.path==='topups'&&c.method==='POST'));
   await page.getByRole('checkbox').check();await page.getByRole('button',{name:'إرسال طلب الشحن',exact:true}).click();await page.getByText('طلب الشحن وصل',{exact:true}).waitFor();assert.equal(f.calls.filter(c=>c.path==='topups'&&c.method==='POST').length,1);await noOverflow(page);assert.deepEqual(f.errors,[]);await f.ctx.close();
  }
  const owner=await fixture(browser,'GYM_OWNER'),{page}=owner;
  await nav(page,'الفروع');await page.getByRole('heading',{name:'فروع شوشه جيم'}).waitFor();assert.equal(await page.locator('.native-branch-card').count(),2);assert.equal(await page.locator('table').count(),0);await screenshot(page,'owner-branches');await noOverflow(page);
  await page.getByText('إدارة الفرع',{exact:true}).first().click();await page.getByRole('button',{name:'الموظفين',exact:true}).first().click();await page.getByRole('heading',{name:'موظفين جولدن جيم 1'}).waitFor();await page.getByRole('button',{name:'رجوع',exact:true}).click();
  await nav(page,'التشغيل');assert.equal(await page.locator('.native-operation-branch').count(),2);await screenshot(page,'owner-operations');await page.locator('.native-operation-branch').first().getByRole('button',{name:'فتح الفرع'}).click();await page.getByText('رصيد الفرع لبيع النقاط').waitFor();await page.getByRole('button',{name:'رجوع',exact:true}).click();
  await nav(page,'مستحقاتي');await page.getByRole('heading',{name:'مستحقاتك واضحة'}).waitFor();await page.getByRole('button',{name:'طلب سحب مستحقات',exact:true}).click();await page.getByLabel('المبلغ بالجنيه',{exact:true}).fill('10');await page.getByLabel('اسم صاحب الحساب',{exact:true}).fill('إبراهيم اختبار');await page.getByLabel('حساب إنستا باي أو رقم المحفظة').fill('test@instapay');await page.getByRole('button',{name:'مراجعة الطلب',exact:true}).click();assert.ok(!owner.calls.some(c=>c.path.endsWith('/withdrawals')&&c.method==='POST'));await page.getByRole('checkbox').check();await page.getByRole('button',{name:'تأكيد طلب السحب',exact:true}).click();await page.getByText('تم إرسال طلب السحب',{exact:true}).waitFor();await page.getByRole('button',{name:'تم',exact:true}).click();await screenshot(page,'owner-money');assert.deepEqual(owner.errors,[]);await owner.ctx.close();
  const staff=await fixture(browser,'CASHIER'),p=staff.page;await p.getByText('رصيد الفرع لبيع النقاط').waitFor();await screenshot(p,'cashier-home');await p.getByRole('button',{name:'بيع نقاط لمتدرب',exact:true}).click();await p.getByLabel('رقم موبايل المتدرب').fill('01000001234');await p.getByRole('button',{name:'بحث عن المتدرب',exact:true}).click();await p.getByLabel('عدد النقاط').fill('50');await p.getByRole('button',{name:'مراجعة قيمة الشحن',exact:true}).click();assert.ok(!staff.calls.some(c=>c.path.endsWith('/sales')&&c.method==='POST'));await p.getByRole('checkbox').check();await p.getByRole('button',{name:'تأكيد التحصيل وشحن المتدرب'}).click();await p.getByText('تم شحن المتدرب',{exact:true}).waitFor();await noOverflow(p);assert.deepEqual(staff.errors,[]);await staff.ctx.close();
 }finally{await browser.close();}
});
