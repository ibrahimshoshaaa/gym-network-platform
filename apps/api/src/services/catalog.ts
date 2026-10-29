import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { requireActor, requireAdmin } from '../auth/authorization.js';
import { parse } from '../gyms/validation.js';
import { DomainError } from '../domain/errors.js';
import { serializable } from '../ledger/service.js';
import { audit } from '../gyms/service.js';
export const presetId = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
const presetInput = z.object({ id: presetId, nameAr: z.string().trim().min(1).max(150), nameEn: z.string().trim().min(1).max(150), category: z.enum(['training','classes','spa','nutrition','facilities']), kind: z.enum(['SERVICE','FACILITY']), active: z.boolean(), expectedVersion: z.number().int().nonnegative().optional() }).strict();
export async function listPresets(db: PrismaClient, actor: string, admin = false) {
 return db.$transaction(async tx => { if(admin) await requireAdmin(tx,actor); else await requireActor(tx,actor); return {items:await tx.servicePreset.findMany({where:admin?{}:{active:true},orderBy:[{category:'asc'},{id:'asc'}]})}; });
}
export async function savePreset(db: PrismaClient, actor: string, body: unknown) {
 const {expectedVersion,...input}=parse(presetInput,body);
 return serializable(db,async tx=>{await requireAdmin(tx,actor);const old=await tx.servicePreset.findUnique({where:{id:input.id}});
 if(old){if(old.version!==expectedVersion)throw new DomainError('STALE_SETTINGS');if(old.kind!==input.kind)throw new DomainError('INVALID_INPUT');const changed=await tx.servicePreset.updateMany({where:{id:input.id,version:expectedVersion},data:{...input,version:{increment:1}}});if(changed.count!==1)throw new DomainError('STALE_SETTINGS');}
 else {if(expectedVersion!==undefined)throw new DomainError('STALE_SETTINGS');await tx.servicePreset.create({data:input});}
 await audit(tx,actor,'SERVICE_PRESET_SAVED',actor,'Updated bilingual catalog preset: '+input.id);return tx.servicePreset.findUniqueOrThrow({where:{id:input.id}});
 });
}
