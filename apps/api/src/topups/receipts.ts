import {accountUpload} from '../accounts/uploads.js';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { Prisma, type PrismaClient } from '@prisma/client';
import {requirePermission} from '../auth/delegation.js';
import {requireGymOwner} from '../auth/authorization.js';
import { requireActor } from '../auth/authorization.js';
import { DomainError } from '../domain/errors.js';

export interface ReceiptStorage {
  upload(data: Buffer, publicId: string): Promise<{ objectKey: string; assetId: string }>;
  readUrl(objectKey: string): string;
  remove(objectKey: string): Promise<void>;
}
export class CloudinaryReceiptStorage implements ReceiptStorage {
  private credentials() {
    const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key, CLOUDINARY_API_SECRET: api_secret } = process.env;
    if (!cloud_name || !api_key || !api_secret) throw new DomainError('STORAGE_NOT_CONFIGURED');
    return { cloud_name, api_key, api_secret };
  }
  async upload(data: Buffer, publicId: string) {
    const credentials = this.credentials();
    return new Promise<{ objectKey: string; assetId: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ ...credentials, resource_type: 'image', type: 'authenticated', timeout:120000, public_id: publicId, overwrite: false }, (error, result) => {
        if (error || !result || result.public_id !== publicId || result.type !== 'authenticated') return reject(new DomainError('STORAGE_UNAVAILABLE'));
        resolve({ objectKey: result.public_id, assetId: result.asset_id });
      });
      stream.end(data);
    });
  }
  readUrl(objectKey: string) {
    return cloudinary.utils.private_download_url(objectKey, 'jpg', { ...this.credentials(), resource_type: 'image', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60, attachment: false });
  }
  async remove(objectKey: string) { const r=await cloudinary.uploader.destroy(objectKey, { ...this.credentials(), resource_type: 'image', type: 'authenticated', invalidate: true });if(!['ok','not found'].includes(r.result))throw new DomainError('STORAGE_UNAVAILABLE'); }
}
export const receiptLimit = 5 * 1024 * 1024;
export async function cleanReceipt(data: Buffer) {
  if (!data.length || data.length > receiptLimit) throw new DomainError('INVALID_RECEIPT');
  try {
    const image = sharp(data, { limitInputPixels: 20000000, animated: false });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) throw new Error('Invalid image');
    const cleaned = await image.rotate().jpeg({ quality: 90 }).toBuffer();
    if (cleaned.length > receiptLimit) throw new Error('Too large');
    return cleaned;
  } catch { throw new DomainError('INVALID_RECEIPT'); }
}
export async function uploadReceipt(db: PrismaClient, storage: ReceiptStorage, actorId: string, data: Buffer) {
  await requireActor(db, actorId);
  const cleaned = await cleanReceipt(data);
  const contentHash = createHash('sha256').update(cleaned).digest('hex');
  const view = (r: { id: string; ownerUserId: string }) => {
    if (r.ownerUserId !== actorId) throw new DomainError('RECEIPT_ALREADY_USED');
    return { id: r.id };
  };
  const existing = await db.receiptEvidence.findUnique({ where: { contentHash } });
  if (existing) return view(existing);
  try {
    return await accountUpload(db,storage,actorId,cleaned,`gym-receipts/${randomUUID()}`,'authenticated',async object=>view(await db.receiptEvidence.create({ data: { ownerUserId: actorId, ...object, contentHash, mimeType: 'image/jpeg', bytes: cleaned.length } })));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const raced = await db.receiptEvidence.findUnique({ where: { contentHash } });
      if (raced) return view(raced);
    }
    throw error;
  }
}
export async function accessReceipt(db: PrismaClient, storage: ReceiptStorage, actorId: string, id: string) {
  const user = await requireActor(db, actorId);
  const receipt = await db.receiptEvidence.findUnique({ where: { id } });
  if (!receipt) throw new DomainError('RECEIPT_ACCESS_DENIED');
  if(receipt.ownerUserId!==actorId&&user.role!=='PLATFORM_ADMIN'){
    const payout=await db.withdrawalRequest.findFirst({where:{proofReceiptId:id,status:{in:['PAID','DISPUTED']}}});
    let allowed=false;
    if(payout){try{if(payout.branchId)await requirePermission(db,actorId,payout.gymId,'REQUEST_WITHDRAWAL',payout.branchId);else await requireGymOwner(db,actorId,payout.gymId,false);allowed=true;}catch{}}
    if(!allowed&&!await db.supportMessage.findFirst({where:{receiptId:id,ticket:{userId:actorId}},select:{id:true}}))throw new DomainError('RECEIPT_ACCESS_DENIED');
  }
  return { url: storage.readUrl(receipt.objectKey), expiresInSeconds: 60 };
}
