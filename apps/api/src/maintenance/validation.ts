import {z} from 'zod';
export const statuses=['NEW','REVIEWING','AWAITING_APPROVAL','SCHEDULED','IN_PROGRESS','AWAITING_CONFIRMATION','COMPLETED','CANCELLED'] as const;
export const price=z.string().regex(/^\d{1,12}$/).transform(BigInt).refine(v=>v<=999999999999n);
export const phone=z.string().regex(/^\+[1-9]\d{7,14}$/);
const note=z.string().trim().min(3).max(1000);
const version={expectedVersion:z.number().int().positive()};
export const createBody=z.object({clientKey:z.string().uuid(),branchId:z.string().uuid(),equipment:z.string().trim().min(3).max(100),description:z.string().trim().min(10).max(3000),contactPhone:phone,imageIds:z.array(z.string().uuid()).max(6).refine(v=>new Set(v).size===v.length)}).strict();
export const filters=z.object({branchId:z.string().uuid().optional(),status:z.enum(statuses).optional(),cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(30).default(20)}).strict();
export const customerAction=z.discriminatedUnion('action',[
 z.object({...version,action:z.literal('APPROVE')}).strict(),
 z.object({...version,action:z.literal('CONFIRM')}).strict(),
 ...(['REJECT_QUOTE','REOPEN','CANCEL'] as const).map(action=>z.object({...version,action:z.literal(action),note}).strict()),
]);
export const adminAction=z.discriminatedUnion('action',[
 z.object({...version,action:z.literal('REVIEW'),note}).strict(),
 z.object({...version,action:z.literal('QUOTE'),note,estimatedPiasters:price,technicianName:z.string().trim().min(3).max(100),technicianPhone:phone,appointmentAt:z.iso.datetime({offset:true})}).strict(),
 z.object({...version,action:z.literal('START'),note}).strict(),
 z.object({...version,action:z.literal('FINISH'),note,finalPiasters:price,workSummary:z.string().trim().min(10).max(3000)}).strict(),
 z.object({...version,action:z.literal('CANCEL'),note}).strict(),
]);
