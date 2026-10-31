import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';

/** Synthetic browser fixtures exercise the UI without moving real money. */
export async function verifyAdminWorkspace(page,origin,width){
 const id='11111111-1111-4111-8111-111111111111',branchId='22222222-2222-4222-8222-222222222222';
 const labels=['شحن ينتظر المراجعة','طلبات انضمام الجيمات','سحب ينتظر المراجعة','تحويلات تنتظر التنفيذ','طلبات أسعار','أسعار خدمات تنتظر المراجعة','إعلانات فروع تنتظر المراجعة','إعلانات ماركت تنتظر المراجعة','بلاغات ماركت مفتوحة','حجوزات تنتظر القرار','طلبات تصحيح','صيانة تحتاج متابعة','طلبات حذف تحتاج مراجعة','جيمات تنتظر التفعيل','طلبات دعم مفتوحة'];
 const calls=[];let approvedTopup=false;
 const listing={id,title:'إعلان اختبار للمنصة',description:'وصف منتج تجريبي لمراجعة واجهة المنصة',category:'WEIGHTS',condition:'USED',pricePiasters:'5000',governorate:'القاهرة',city:'مدينة نصر',contactPhone:'+201555550000',sellerId:id,seller:{displayName:'بائع تجريبي',role:'TRAINEE'},images:[],version:2,status:'PENDING'};
 const promotion={id,title:'عرض فرع تجريبي',body:'عرض تجريبي لمراجعة الإعلان والظهور',status:'PENDING',version:1,feePiasters:null,startsAt:null,endsAt:null,radiusKm:20,reviewReason:null,image:null,requestedBy:{displayName:'صاحب جيم تجريبي'},branch:{name:'الفرع التجريبي',gym:{name:'الجيم التجريبي'}},acceptedAt:null,serviceName:'كارديو'};
 const service={id,name:'خدمة تجريبية',description:'خدمة كارديو تجريبية',points:30,durationMinutes:20,baseVersion:0,reason:'خدمة جديدة',openMinute:480,closeMinute:1320,service:{points:null,durationMinutes:null,version:0,branch:{name:'الفرع التجريبي',gymId:id}}};
 const topup={id,kind:'TRAINEE',requestorUserId:id,requestor:{displayName:'متدرب تجريبي',email:'synthetic@example.test',phoneE164:'+201555550000'},points:50,chargePiasters:'12500',unitPricePiasters:'250',discountBps:0,status:'PENDING',paymentMethod:'WALLET',paymentAccount:'synthetic',paymentAccountName:'حساب تجريبي',receiptId:id,reviewReason:null,createdAt:new Date().toISOString()};
 const handler=async route=>{const request=route.request(),u=new URL(request.url()),p=u.pathname.replace('/api/backend/','');let body;
  if(p==='home-summary')body={asOf:new Date().toISOString(),cards:labels.map(label=>({label,value:label==='شحن ينتظر المراجعة'?(approvedTopup?'0':'1'):['أسعار خدمات تنتظر المراجعة','إعلانات فروع تنتظر المراجعة','بلاغات ماركت مفتوحة'].includes(label)?'1':'0',destination:'reviews'}))};
  else if(p==='admin/market/listings'||p==='market/mine')body={items:[listing],nextCursor:null};
  else if(p==='admin/market/reports')body={items:[{id,reason:'بلاغ تجريبي لمراجعة الإعلان',listing,reporter:{displayName:'مبلّغ تجريبي'}}],nextCursor:null};
  else if(p==='market/listings/'+id)body=listing;
  else if(p==='admin/promotions/requests')body={items:[promotion],nextCursor:null};
  else if(p==='admin/service-price-requests')body={items:[service],nextCursor:null};
  else if(p==='admin/topups')body={items:approvedTopup?[]:[topup],nextCursor:null};
  else if(p==='receipts/'+id+'/access')body={url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#eef8f2"/><text x="160" y="90" text-anchor="middle" font-size="22">SYNTHETIC RECEIPT</text></svg>')};
  else if(request.method()==='POST'&&p.endsWith('/review')){const data=request.postDataJSON();calls.push({p,data});if(p.startsWith('admin/topups/'))approvedTopup=true;body={status:'APPROVED'};}
  else return route.continue();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 };
 await page.route('**/api/backend/**',handler);
 try{
  await page.goto(origin+'/?section=home');await page.getByRole('heading',{name:'يومك في المنصة',exact:true}).waitFor();
  await page.locator('.admin-queue-list').getByRole('button',{name:/إعلانات الفروع/}).waitFor();
  await page.locator('.admin-queue-list').getByRole('button',{name:/أسعار الخدمات/}).waitFor();
  await page.getByRole('button',{name:/مركز المتابعة/}).click();await page.getByRole('region',{name:'مركز متابعة المنصة'}).waitFor();
  await page.getByRole('button',{name:/بلاغات الماركت.*راجع الإعلانات/}).click();await page.getByRole('button',{name:'تمت مراجعة البلاغ',exact:true}).waitFor();assert.match(page.url(),/view=REPORTS/);
  await page.getByLabel('ابحث عن صفحة أو مهمة',{exact:true}).fill('أسعار الخدمات');await page.getByRole('region',{name:'نتائج البحث في الإدارة'}).getByRole('button',{name:/أسعار الخدمات/}).click();
  await page.getByRole('button',{name:'اعتماد الخدمة والسعر',exact:true}).last().waitFor();
  assert.equal(await page.locator('textarea:visible').count(),0);await page.getByRole('button',{name:'اعتماد الخدمة والسعر',exact:true}).last().click();await page.waitForFunction(()=>document.querySelector('.notice.success')||!document.querySelector('.busy'));
  await page.goto(origin+'/?section=market');await page.getByRole('button',{name:'التفاصيل والمراجعة',exact:true}).click();await page.getByRole('button',{name:'نشر الإعلان',exact:true}).click();assert.equal(await page.locator('dialog[open]').last().locator('textarea:visible').count(),0);await page.getByRole('button',{name:'تأكيد القرار',exact:true}).click();await page.getByText('تم تحديث الماركت.',{exact:true}).waitFor();
  await page.goto(origin+'/?section=promotion-requests');await page.getByRole('button',{name:'تحديد التكلفة والظهور',exact:true}).click();await page.getByLabel('تكلفة الإعلان بالجنيه',{exact:true}).fill('10');await page.getByRole('button',{name:'3 أيام',exact:true}).click();assert.equal(await page.locator('dialog[open] textarea:visible').count(),0);
  await mkdir(new URL('../build-verification/',import.meta.url),{recursive:true});await page.screenshot({path:fileURLToPath(new URL(`../build-verification/admin-promotion-review-${width}.png`,import.meta.url)),fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'إرسال العرض لاعتماد الجيم',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  await page.goto(origin+'/?section=reviews');await page.getByRole('button',{name:'مراجعة وقبول الشحن',exact:true}).click();await page.getByLabel('راجعت الإيصال وتأكدت من وصول 125 ج.م لحساب الاستلام',{exact:true}).waitFor();await page.getByLabel('مرجع التحويل الوارد',{exact:true}).fill('SYNTHETIC-BANK-REFERENCE');await page.getByLabel('راجعت الإيصال وتأكدت من وصول 125 ج.م لحساب الاستلام',{exact:true}).check();assert.equal(await page.locator('dialog[open] textarea:visible').count(),0);await page.getByRole('button',{name:'قبول وإضافة 50 نقطة',exact:true}).click();await page.getByText('تم قبول الشحن وإضافة النقاط.',{exact:true}).waitFor();
  await page.goto(origin+'/?section=requests');await page.getByRole('region',{name:'مركز متابعة المنصة'}).waitFor();await page.getByRole('button',{name:/أسعار الخدمات.*اعتمد الخدمة/}).waitFor();
  await page.screenshot({path:fileURLToPath(new URL(`../build-verification/admin-request-center-${width}.png`,import.meta.url)),fullPage:true,animations:'disabled'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  const market=calls.find(c=>c.p.startsWith('admin/market/listings/'));assert.equal(market?.data.status,'APPROVED');assert.equal(market?.data.expectedVersion,2);assert.ok(market?.data.reason.includes('الموافقة'));
  const quote=calls.find(c=>c.p.startsWith('admin/promotions/'));assert.equal(quote?.data.action,'QUOTE');assert.equal(quote?.data.feePiasters,'1000');assert.equal(Math.round((Date.parse(quote.data.endsAt)-Date.parse(quote.data.startsAt))/86400000),3);assert.ok(quote?.data.reason.length>3);
  const approved=calls.find(c=>c.p.startsWith('admin/topups/'));assert.equal(approved?.data.fundsReceived,true);assert.equal(approved?.data.receiptReviewed,true);assert.equal(approved?.data.paymentReference,'SYNTHETIC-BANK-REFERENCE');assert.equal(approved?.data.receivedAmountPiasters,'12500');assert.ok(approved?.data.reason.length>0);
  const reviewedService=calls.find(c=>c.p.startsWith('admin/service-price-requests/'));assert.equal(reviewedService?.data.expectedVersion,0);assert.equal(reviewedService?.data.decision,'APPROVED');
 }finally{await page.unroute('**/api/backend/**',handler);}
}
