import {z} from 'zod';
export const governorates=['القاهرة','الجيزة','الإسكندرية','الدقهلية','البحر الأحمر','البحيرة','الفيوم','الغربية','الإسماعيلية','المنوفية','المنيا','القليوبية','الوادي الجديد','السويس','أسوان','أسيوط','بني سويف','بورسعيد','دمياط','الشرقية','جنوب سيناء','كفر الشيخ','مطروح','الأقصر','قنا','شمال سيناء','سوهاج'] as const;
export const categories=['EQUIPMENT','WEIGHTS','ACCESSORIES','CLOTHING'] as const;
const price=z.string().regex(/^\d{1,12}$/).transform(v=>BigInt(v)).refine(v=>v<=999999999999n);
export const listingBody=z.object({title:z.string().trim().min(3).max(100),description:z.string().trim().min(10).max(3000),category:z.enum(categories),condition:z.enum(['NEW','USED']),pricePiasters:price,governorate:z.enum(governorates),city:z.string().trim().min(2).max(80),contactPhone:z.string().regex(/^\+[1-9]\d{7,14}$/),imageIds:z.array(z.string().uuid()).min(1).max(6).refine(ids=>new Set(ids).size===ids.length)}).strict();
export const createBody=listingBody.extend({clientKey:z.string().uuid()});
export const updateBody=listingBody.extend({expectedVersion:z.number().int().positive()});
export const filters=z.object({q:z.string().trim().max(100).optional(),category:z.enum(categories).optional(),condition:z.enum(['NEW','USED']).optional(),governorate:z.enum(governorates).optional(),min:price.optional(),max:price.optional(),sort:z.enum(['LATEST','PRICE_ASC','PRICE_DESC']).default('LATEST'),cursor:z.string().uuid().optional(),limit:z.coerce.number().int().min(1).max(30).default(20),status:z.enum(['PENDING','APPROVED','REJECTED','HIDDEN','SOLD']).optional()}).strict().refine(v=>v.min===undefined||v.max===undefined||v.min<=v.max);
export const versionBody=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['HIDDEN','SOLD'])}).strict();
export const reviewBody=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['APPROVED','REJECTED','HIDDEN']),reason:z.string().trim().min(3).max(500)}).strict();
export const reportBody=z.object({reason:z.string().trim().min(5).max(1000)}).strict();
export function searchText(text:string){return text.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLowerCase().trim();}
