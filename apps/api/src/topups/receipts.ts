import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { Prisma, type PrismaClient } from '@prisma/client';
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
      const stream = cloudinary.uploader.upload_stream({ ...credentials, resource_type: 'image', type: 'authenticated', public_id: publicId, overwrite: false }, (error, result) => {
        if (error || !result || result.public_id !== publicId || result.type !== 'authenticated') return reject(new DomainError('STORAGE_UNAVAILABLE'));
        resolve({ objectKey: result.public_id, assetId: result.asset_id });
      });
      stream.end(data);
    });
  }
  readUrl(objectKey: string) {
    return cloudinary.utils.private_download_url(objectKey, 'jpg', { ...this.credentials(), resource_type: 'image', type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 60, attachment: false });
  }
  async remove(objectKey: string) { await cloudinary.uploader.destroy(objectKey, { ...this.credentials(), resource_type: 'image', type: 'authenticated', invalidate: true }); }
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
  const object = await storage.upload(cleaned, `gym-receipts/${randomUUID()}`);
  try {
    return view(await db.receiptEvidence.create({ data: { ownerUserId: actorId, ...object, contentHash, mimeType: 'image/jpeg', bytes: cleaned.length } }));
  } catch (error) {
    await storage.remove(object.objectKey).catch(() => undefined);
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
  if (receipt.ownerUserId !== actorId && user.role !== 'PLATFORM_ADMIN' && !await db.withdrawalRequest.findFirst({
    where: { proofReceiptId: id, status: { in: ['PAID', 'DISPUTED'] }, gym: { ownerId: actorId, ownerAcceptedAt: { not: null } } }, select: { id: true }
  })) throw new DomainError('RECEIPT_ACCESS_DENIED');
  return { url: storage.readUrl(receipt.objectKey), expiresInSeconds: 60 };
}
