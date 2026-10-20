export const roles=[{id:'TRAINEE',title:'المتدرب',detail:'الرصيد والجيمات ورمز الدخول والزيارات والشحن'},{id:'GYM_OWNER',title:'صاحب الجيم',detail:'الفروع والتشغيل والمخزون والمستحقات'},{id:'CASHIER',title:'الكاشير',detail:'بيع النقاط ومتابعة زيارات الفرع'},{id:'BRANCH_MANAGER',title:'مدير الفرع',detail:'متابعة التشغيل وصلاحيات الفرع'},{id:'PLATFORM_ADMIN',title:'صاحب المنصة',detail:'الطلبات والجيمات والمالية والإعدادات'}];
let role='TRAINEE';export function setDemoRole(r:string){role=r}
const now=()=>new Date().toISOString(),empty=()=>({items:[],nextCursor:null,asOf:now()});
const gym={id:'11111111-1111-4111-8111-111111111111',name:'شوشة جيم',status:'ACTIVE',ownerAcceptedAt:'2026-10-01',owner:{isActive:true},description:'فروع متكاملة للتمرين',canFinance:true};
const branches=[1,2].map(i=>({id:`22222222-2222-4222-8222-22222222222${i}`,gymId:gym.id,gymName:gym.name,name:`جولدن جيم ${i}`,status:'ACTIVE',address:'شما · طريق المحطة',city:'أشمون',governorate:'المنوفية',contactPhone:null,openingHours:'يوميًا من ٨ صباحًا إلى ١٢ مساءً',visitPricePoints:i===1?20:30,sessionMinutes:180,priceApprovedAt:'2026-10-01',pricingVersion:1,pointAccounts:[{balance:500}],canSell:true,canCancel:true,permissions:[],latitude:'30.4',longitude:'31.0',distanceKm:i*1.2,gym}));
const options={policy:{id:'policy',version:1,pointPricePiasters:'100',gymDiscountBps:1000,redemptionBps:8000},paymentMethods:[{type:'WALLET',account:'01000000000',accountName:'تجريبي — لا تحوّل أموالًا',enabled:true,version:1},{type:'INSTAPAY',account:'demo@example.test',accountName:'تجريبي — لا تحوّل أموالًا',enabled:true,version:1}],packages:[100,200,500].map(p=>({id:`p${p}`,label:`${p} نقطة`,points:p,kind:'TRAINEE',enabled:true,version:1}))};
let receiptUrl='';
let balance=500,central=1200,stocks=[500,300],topups:any[]=[],withdrawals:any[]=[],sales:any[]=[],moves:any[]=[],visits:any[]=[];
export function resetDemo(){balance=500;central=1200;stocks=[500,300];topups=[];withdrawals=[];sales=[];moves=[];visits=[{id:'demo-visit',pointsCharged:20,settlementPiasters:'1600',status:'COMPLETED',startedAt:new Date(Date.now()-86400000).toISOString(),expiresAt:new Date(Date.now()-80000000).toISOString(),serverTime:now(),branch:branches[0]}]}
const accounts=()=>['GYM_AVAILABLE','GYM_RESERVED','GYM_DISPUTED','GYM_PAID'].map(type=>({type,balancePiasters:type==='GYM_AVAILABLE'?'124000':'0'}));
const user=()=>({id:'demo-user',displayName:role==='TRAINEE'?'أحمد محمد':role==='PLATFORM_ADMIN'?'إبراهيم شوشة':role==='GYM_OWNER'?'أحمد صاحب الجيم':'محمد موظف الفرع',role,email:'demo@example.test',phone:'+201000000000'});
const metric=(count:number,points:number,amount:number)=>({count:String(count),points:String(points),amountPiasters:String(amount)});
function dispatch(p:string,m:string,b:any,u:URL):any{
 if(u.pathname==='/api/session')return {user:user()};
 if(u.pathname==='/api/logout')return {};
 if(p==='me/gym-application')return {application:null};
 if(p==='notifications')return {...empty(),unread:0};
 if(p==='home-summary')return {asOf:now(),cards:[['جيمات نشطة',1,'gyms'],['فروع نشطة',2,'gyms'],['متدربون نشطون',128,'users'],['شحن ينتظر المراجعة',topups.filter(t=>t.status==='REQUESTED').length,'reviews'],['طلبات انضمام الجيمات',0,'gym-applications'],['سحب ينتظر المراجعة',withdrawals.length,'withdrawals'],['تحويلات تنتظر التنفيذ',0,'withdrawals'],['طلبات أسعار',0,'branch-prices'],['طلبات تصحيح',0,'operation-reviews'],['جيمات تنتظر التفعيل',0,'gyms'],['طلبات دعم مفتوحة',0,'support']].map(([label,value,destination])=>({label,value:String(value),destination}))};
 if(p==='gyms')return {...empty(),items:['GYM_OWNER','PLATFORM_ADMIN'].includes(role)?[gym]:[]};
 if(p===`gyms/${gym.id}/branches`||p==='operations/branches')return {...empty(),items:branches};
 if(p.includes('/point-wallet'))return {available:String(central),central:String(central),branchesTotal:String(stocks[0]+stocks[1]),total:String(central+stocks[0]+stocks[1])};
 if(p.endsWith('/inventory'))return {central:String(central),branchesTotal:String(stocks[0]+stocks[1]),total:String(central+stocks[0]+stocks[1]),status:'ACTIVE',branches:branches.map((v,i)=>({...v,stock:stocks[i]}))};
 if(p==='reports/summary')return {period:{from:'2026-10-01',to:now().slice(0,10)},asOf:now(),scope:{finance:true},topups:metric(topups.length,1000,100000),sales:metric(sales.length,250,25000),visits:metric(visits.length,240,19200),cancellations:metric(0,0,0),netVisitPoints:'240',netVisitReceivablesPiasters:'19200',currentStockPoints:'2000',currentBalances:accounts(),paidWithdrawals:metric(2,0,40000),alerts:{topups:{count:String(topups.length),oldestAt:null},reviews:{count:'0',oldestAt:null},withdrawals:{requested:String(withdrawals.length),approved:'0',overdue:'0',disputed:'0'}},reconciliation:null,platformFinance:{projection:{points:'2500',amount:'200000',policyVersion:1},points:{trainees:String(balance),gyms:'2000',circulating:String(balance+2000),spendable:String(balance),expired:'0',undated:'0',issued:'5000',redeemed:'2500',retired:'0'},liabilities:{available:'124000',reserved:'0',disputed:'0',total:'124000',paid:'40000'},collections:{total:'350000',trainees:'170000',gyms:'180000',afterPayouts:'310000',afterLiabilities:'186000'}}};
 if(p==='reports/rows')return {...empty(),kind:u.searchParams.get('kind')};
 if(p.endsWith('/receivables'))return {accounts:accounts()};
 if(p.endsWith('/summary'))return {stock:stocks[p.includes(branches[1].id)?1:0],visitPricePoints:20,sessionMinutes:180};
 if(p==='trainee/wallet')return {balance,spendablePoints:balance,unavailablePoints:0,expiresAt:new Date(Date.now()+86400000*90).toISOString(),status:'VALID',serverTime:now()};
 if(p==='trainee/visits')return {...empty(),items:visits};
 if(p==='trainee/movements')return {...empty(),items:moves};
 if(p==='trainee/qr')return {token:'GYMBANK-DEMO-NOT-A-REAL-ENTRY-TOKEN',expiresAt:new Date(Date.now()+60000).toISOString(),serverTime:now()};
 if(p==='topup-options'||p==='admin/topup-settings')return options;
 if(p==='topup-quotes'){const points=b.points??(b.amountPiasters?Math.floor(Number(b.amountPiasters)/(role==='TRAINEE'?100:90)):Number(b.packageId?.replace('p','')??100));if(!Number.isSafeInteger(points)||points<1)throw Error('quantity');return {points,chargePiasters:String(points*(role==='TRAINEE'?100:90)),pricingVersion:1,unallocatedPiasters:'0'}}
 if(p==='receipts'&&m==='POST')return {id:'demo-receipt'};
 if(p==='receipts/demo-receipt/access')return {url:receiptUrl};
 if(p==='topups'&&m==='POST'){const t={id:crypto.randomUUID(),...b,kind:role==='TRAINEE'?'TRAINEE':'BRANCH_STOCK',points:b.points??Number(b.packageId?.replace('p','')??100),chargePiasters:b.chargePiasters??String((b.points??Number(b.packageId?.replace('p','')??100))*(role==='TRAINEE'?100:90)),status:'REQUESTED',createdAt:now(),requestor:{displayName:'أحمد محمد',email:'demo@example.test',phoneE164:'+201000000000'},requestorUserId:'demo-user',paymentAccount:'01000000000',paymentAccountName:'حساب العرض',receiptId:'demo-receipt',reviewReason:null};topups.unshift(t);return t}
 if(['topups','me/topups','admin/topups'].includes(p))return {...empty(),items:topups};
 if((p.startsWith('topups/')||p.startsWith('admin/topups/'))&&m==='POST'){const t=topups.find(t=>p.includes(t.id));if(t&&t.status==='REQUESTED'){t.status=b.decision==='REJECTED'?'REJECTED':'APPROVED';if(t.status==='APPROVED'){if(t.kind==='TRAINEE')balance+=t.points;else central+=t.points}}return t??{id:'demo'}}
 if(p.endsWith('/withdrawals')&&m==='POST'){const t={id:crypto.randomUUID(),...b,status:'REQUESTED',requestedAt:now(),overdue:false};withdrawals.unshift(t);return t}
 if(p.includes('withdrawals')&&m==='GET')return {...empty(),items:withdrawals};
 if(p.endsWith('/stock-transfers')&&m==='POST'){const n=Number(b.points),from=branches.findIndex(v=>v.id===b.fromBranchId),to=branches.findIndex(v=>v.id===b.toBranchId);if(from<0)central-=n;else stocks[from]-=n;if(to<0)central+=n;else stocks[to]+=n;return {id:crypto.randomUUID()}}
 if(p.endsWith('/trainee-lookup')||p.endsWith('/lookup'))return {id:'demo-user',label:'أحمد محمد',phoneLast4:'0000',role:'TRAINEE',gyms:[]};
 if(p.endsWith('/sale-quotes'))return {points:Number(b.points),chargePiasters:String(Number(b.points)*100),pricingVersion:1,stock:stocks[0],traineeLabel:'أحمد محمد',phoneLast4:'0000'};
 if(p.endsWith('/sales')&&m==='POST'){const n=Number(b.points);if(!Number.isSafeInteger(n)||n<1||n>stocks[0])throw Error('stock');balance+=n;stocks[0]-=n;const s={id:crypto.randomUUID(),points:n,chargePiasters:String(n*100),traineeLabel:'أحمد محمد',phoneLast4:'0000',createdAt:now()};sales.unshift(s);return s}
 if(p.endsWith('/sales'))return {...empty(),items:sales};
 if(p.endsWith('/visits'))return {...empty(),items:visits};
 if(p==='support/contact')return {whatsapp:null};
 if(p==='directory/branches'){const q=u.searchParams.get('q')||'',min=Number(u.searchParams.get('minPrice')||0),max=Number(u.searchParams.get('maxPrice')||9999);return {...empty(),items:branches.filter(v=>(v.name+v.gymName+v.city+v.governorate).includes(q)&&v.visitPricePoints>=min&&v.visitPricePoints<=max)}}
 if(p.startsWith('directory/branches/'))return {branch:branches.find(v=>p.includes(v.id))??branches[0],asOf:now()};
 if(m==='GET')return empty();
 throw Error('المسار غير متاح في نسخة العرض');
}
export function installDemo(){resetDemo();window.fetch=async(input,init={})=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(!u.pathname.startsWith('/api/'))throw Error('العرض مستقل');if(u.pathname==='/api/backend/receipts'&&init.body instanceof Blob){if(receiptUrl)URL.revokeObjectURL(receiptUrl);receiptUrl=URL.createObjectURL(init.body)}let b:any={};try{b=typeof init.body==='string'?JSON.parse(init.body):{}}catch{}try{return new Response(JSON.stringify(dispatch(u.pathname.replace('/api/backend/',''),init.method||'GET',b,u)),{status:200,headers:{'content-type':'application/json'}})}catch{return new Response(JSON.stringify({code:'INVALID_STATE'}),{status:400,headers:{'content-type':'application/json'}})}}}
