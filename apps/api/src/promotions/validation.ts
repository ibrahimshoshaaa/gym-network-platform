import {z} from 'zod';
import {directoryQuery} from '../directory/validation.js';
export const createBody=z.object({branchId:z.string().uuid(),clientKey:z.string().uuid(),title:z.string().trim().min(3).max(120),body:z.string().trim().min(10).max(1000),imageId:z.string().uuid().nullable()}).strict();
export const statuses=['PENDING','AWAITING_ACCEPTANCE','APPROVED','REJECTED','PAUSED','WITHDRAWN'] as const;
export const filters=z.object({status:z.enum(statuses).optional(),cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(30).default(20)}).strict();
const expectedVersion=z.number().int().positive();
const reason=z.string().trim().min(3).max(1000);
export const reviewBody=z.discriminatedUnion('action',[
 z.object({action:z.literal('QUOTE'),expectedVersion,reason,feePiasters:z.string().regex(/^\d{1,12}$/).transform(BigInt),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),radiusKm:z.number().int().min(1).max(100)}).strict(),
 z.object({action:z.enum(['REJECT','PAUSE']),expectedVersion,reason}).strict(),
]);
export const ownerBody=z.object({action:z.enum(['ACCEPT','WITHDRAW']),expectedVersion}).strict();
export const nearbyQuery=directoryQuery;
export function distanceKm(a:number,b:number,c:number,d:number){const r=Math.PI/180;const v=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,v))));}
