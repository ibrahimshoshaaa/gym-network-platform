import {accountUpload} from '../accounts/uploads.js';
import {recordCharge} from '../charges/service.js';
import {createHash,randomUUID} from 'node:crypto';
import type {Prisma,PrismaClient} from '@prisma/client';
import {requireActor,requireAdmin} from '../auth/authorization.js';
import {parse} from '../gyms/validation.js';
import {audit} from '../gyms/service.js';
import {serializable} from '../ledger/service.js';
import {DomainError} from '../domain/errors.js';
import {cleanReceipt} from '../topups/receipts.js';
import type {BusinessStorage} from '../media/service.js';
import {branchAccess,availableBranches} from './access.js';
import {createBody,filters,customerAction,adminAction} from './validation.js';
type Tx=Prisma.TransactionClient;
const include={branch:{select:{id:true,name:true,gymId:true,gym:{select:{name:true}}}},createdBy:{select:{displayName:true}},images:{select:{id:true,publicUrl:true},orderBy:{createdAt:'asc' as const}}};
export function view<T extends {estimatedPiasters:bigint|null;approvedPiasters:bigint|null;finalPiasters:bigint|null;requestHash:string;clientKey:string}>(row:T){const {requestHash,clientKey,...rest}=row;return {...rest,estimatedPiasters:row.estimatedPiasters?.toString()??null,approvedPiasters:row.approvedPiasters?.toString()??null,finalPiasters:row.finalPiasters?.toString()??null};}
async function event(tx:Tx,actor:string,id:string,status:string,note:string,data:Prisma.InputJsonObject={}){
 await tx.maintenanceEvent.create({data:{requestId:id,actorId:actor,status,note,data}});
 await audit(tx,actor,'MAINTENANCE_'+status,id,note);
}
export async function uploadImage(db:PrismaClient,storage:BusinessStorage,actor:string,branchId:string,bytes:Buffer){
 const access=await branchAccess(db,actor,branchId);if(access.admin)throw new DomainError('ACCESS_DENIED');
 const cleaned=await cleanReceipt(bytes);
 return accountUpload(db,storage,actor,cleaned,`gym-maintenance/${branchId}/${randomUUID()}`,'upload',async object=>{const a=await branchAccess(db,actor,branchId);if(a.admin)throw new DomainError('ACCESS_DENIED');return db.maintenanceImage.create({data:{...object,ownerId:actor,branchId},select:{id:true,publicUrl:true}});});
}
export function createRequest(db:PrismaClient,actor:string,input:unknown){
 const d=parse(createBody,input),hash=createHash('sha256').update(JSON.stringify(d)).digest('hex');
 return serializable(db,async tx=>{
  const a=await branchAccess(tx,actor,d.branchId);if(a.admin)throw new DomainError('ACCESS_DENIED');
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actor+':maintenance:'+d.clientKey},0))`;
  const old=await tx.maintenanceRequest.findUnique({where:{createdById_clientKey:{createdById:actor,clientKey:d.clientKey}},include});
  if(old){if(old.requestHash!==hash)throw new DomainError('IDEMPOTENCY_CONFLICT');return view(old);}
  const images=d.imageIds.length?await tx.$queryRaw<{id:string;ownerId:string;branchId:string;requestId:string|null}[]>`SELECT id,"ownerId","branchId","requestId" FROM "MaintenanceImage" WHERE id=ANY(${d.imageIds}::uuid[]) ORDER BY id FOR UPDATE`:[];
  if(images.length!==d.imageIds.length||images.some(i=>i.ownerId!==actor||i.branchId!==d.branchId||i.requestId))throw new DomainError('ACCESS_DENIED');
  const row=await tx.maintenanceRequest.create({data:{branchId:d.branchId,createdById:actor,equipment:d.equipment,description:d.description,contactPhone:d.contactPhone,clientKey:d.clientKey,requestHash:hash}});
  await tx.maintenanceImage.updateMany({where:{id:{in:d.imageIds}},data:{requestId:row.id}});
  await event(tx,actor,row.id,'NEW','تم إرسال طلب الصيانة');
  return view(await tx.maintenanceRequest.findUniqueOrThrow({where:{id:row.id},include}));
 });
}
export async function listRequests(db:PrismaClient,actor:string,input:unknown,admin=false){
 const f=parse(filters,input);await requireActor(db,actor);if(admin)await requireAdmin(db,actor);
 const ids=admin?undefined:(await availableBranches(db,actor)).map(b=>b.id);
 if(f.branchId&&!admin&&!ids!.includes(f.branchId))throw new DomainError('BRANCH_ACCESS_DENIED');
 const rows=await db.maintenanceRequest.findMany({where:{...(admin?{}:{branchId:{in:ids}}),...(f.branchId?{branchId:f.branchId}:{}),...(f.status?{status:f.status}:{})},include,orderBy:[{createdAt:'desc'},{id:'desc'}],take:f.limit+1,...(f.cursor?{cursor:{id:f.cursor},skip:1}:{})});
 return {items:rows.slice(0,f.limit).map(view),nextCursor:rows.length>f.limit?rows[f.limit-1]!.id:null};
}
export async function detail(db:PrismaClient,actor:string,id:string){
 const row=await db.maintenanceRequest.findUnique({where:{id},include:{...include,events:{include:{actor:{select:{displayName:true}}},orderBy:[{createdAt:'asc'},{id:'asc'}]}}});
 if(!row)throw new DomainError('NOT_FOUND');const a=await branchAccess(db,actor,row.branchId);
 return {...view(row),canApprove:a.canApprove,isAdmin:a.admin};
}
export function changeRequest(db:PrismaClient,actor:string,id:string,input:unknown,admin=false){
 const d=admin?parse(adminAction,input):parse(customerAction,input);
 return serializable(db,async tx=>{
  if(admin)await requireAdmin(tx,actor);
  await tx.$queryRaw`SELECT id FROM "MaintenanceRequest" WHERE id=${id}::uuid FOR UPDATE`;
  const row=await tx.maintenanceRequest.findUnique({where:{id}});if(!row)throw new DomainError('NOT_FOUND');
  const a=await branchAccess(tx,actor,row.branchId);
  if(!admin&&(a.admin||!a.canApprove))throw new DomainError('ACCESS_DENIED');
  if(row.version!==d.expectedVersion)throw new DomainError('STALE_SETTINGS');
  let status=row.status,note='note' in d?d.note:'',extra:Prisma.MaintenanceRequestUpdateInput={},data:Prisma.InputJsonObject={action:d.action};
  const must=(valid:boolean)=>{if(!valid)throw new DomainError('INVALID_STATE');};
  switch(d.action){
   case 'REVIEW':must(row.status==='NEW');status='REVIEWING';break;
   case 'QUOTE':{
    if(!('estimatedPiasters' in d))throw new DomainError('INVALID_INPUT');
    must(['NEW','REVIEWING','AWAITING_APPROVAL','SCHEDULED','IN_PROGRESS'].includes(row.status));
    const resume=row.status==='IN_PROGRESS'||row.resumeStatus==='IN_PROGRESS'?'IN_PROGRESS':'SCHEDULED';
    if(resume!=='IN_PROGRESS'&&new Date(d.appointmentAt)<=new Date())throw new DomainError('INVALID_INPUT');
    status='AWAITING_APPROVAL';extra={estimatedPiasters:d.estimatedPiasters,technicianName:d.technicianName,technicianPhone:d.technicianPhone,appointmentAt:new Date(d.appointmentAt),resumeStatus:resume,approvedPiasters:null,approvedById:null,approvedAt:null};
    data={...data,estimatedPiasters:d.estimatedPiasters.toString(),technicianName:d.technicianName,appointmentAt:d.appointmentAt};break;
   }
   case 'APPROVE':must(row.status==='AWAITING_APPROVAL'&&row.estimatedPiasters!==null);must(row.resumeStatus==='IN_PROGRESS'||Boolean(row.appointmentAt&&row.appointmentAt>new Date()));status=row.resumeStatus==='IN_PROGRESS'?'IN_PROGRESS':'SCHEDULED';extra={approvedPiasters:row.estimatedPiasters,approvedById:actor,approvedAt:new Date(),resumeStatus:null};note='تم اعتماد التكلفة والموعد';data={...data,approvedPiasters:row.estimatedPiasters!.toString()};break;
   case 'REJECT_QUOTE':must(row.status==='AWAITING_APPROVAL');status='REVIEWING';extra={resumeStatus:null};break;
   case 'START':must(row.status==='SCHEDULED'&&row.approvedPiasters!==null);status='IN_PROGRESS';break;
   case 'FINISH':{
    if(!('finalPiasters' in d))throw new DomainError('INVALID_INPUT');
    must(row.status==='IN_PROGRESS'&&row.approvedPiasters!==null);
    if(d.finalPiasters>row.approvedPiasters!)throw new DomainError('MAINTENANCE_REAPPROVAL_REQUIRED');
    status='AWAITING_CONFIRMATION';extra={finalPiasters:d.finalPiasters,workSummary:d.workSummary};data={...data,finalPiasters:d.finalPiasters.toString(),workSummary:d.workSummary};break;
   }
   case 'CONFIRM':must(row.status==='AWAITING_CONFIRMATION');status='COMPLETED';extra={confirmedById:actor,confirmedAt:new Date()};note='تم تأكيد استلام الصيانة';break;
   case 'REOPEN':must(row.status==='AWAITING_CONFIRMATION');status='IN_PROGRESS';extra={finalPiasters:null,workSummary:null};break;
   case 'CANCEL':must(!['COMPLETED','CANCELLED'].includes(row.status));if(!admin)must(['NEW','REVIEWING','AWAITING_APPROVAL','SCHEDULED'].includes(row.status));status='CANCELLED';break;
  }
  if(d.action==='CONFIRM'){if(row.finalPiasters===null)throw new DomainError('INVALID_STATE');await recordCharge(tx,{gymId:a.branch.gymId,branchId:row.branchId,kind:'MAINTENANCE',sourceId:row.id,amountPiasters:row.finalPiasters,description:'صيانة '+row.equipment});}
  await tx.maintenanceRequest.update({where:{id},data:{...extra,status,version:{increment:1}}});
  await event(tx,actor,id,status,note,data);
  return view(await tx.maintenanceRequest.findUniqueOrThrow({where:{id},include}));
 });
}
