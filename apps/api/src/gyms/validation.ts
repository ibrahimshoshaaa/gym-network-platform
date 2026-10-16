import { z } from 'zod';
import { emailSchema, phoneSchema } from '../auth/validation.js';
import { DomainError } from '../domain/errors.js';

const text = (max: number) => z.string().trim().min(1).max(max);
export const contactSchema = z.object({ displayName: text(100), email: emailSchema, phone: phoneSchema }).strict();
export const gymCreateSchema = z.object({ name: text(150), description: z.string().trim().max(2000).optional(), contactPhone: phoneSchema.optional(),
  owner: contactSchema.optional(), ownerId: z.string().uuid().optional(),
}).strict().refine(v => Boolean(v.owner) !== Boolean(v.ownerId));
export const gymUpdateSchema = z.object({ name: text(150).optional(), description: z.string().trim().max(2000).optional(), contactPhone: phoneSchema.optional() }).strict().refine(v => Object.keys(v).length > 0);
const positiveInt = z.number().int().positive().max(2147483647);
export const priceSchema = z.object({ visitPricePoints: positiveInt, sessionMinutes: positiveInt, reason: text(1000) }).strict();
const metadata = {
  name: text(150), address: text(500), governorate: text(100), city: text(100),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  contactPhone: phoneSchema.optional(), openingHours: z.string().trim().max(1000).optional(),
};
export const branchCreateSchema = z.object({ ...metadata, visitPricePoints: positiveInt, sessionMinutes: positiveInt }).strict();
export const branchUpdateSchema = z.object(metadata).partial().strict()
  .refine(v => Object.keys(v).length > 0)
  .refine(v => (v.latitude === undefined) === (v.longitude === undefined));
export const staffInviteSchema = z.object({ branchId: z.string().uuid(), role: z.enum(['CASHIER', 'BRANCH_MANAGER']), contact: contactSchema }).strict();
export const staffActiveSchema = z.object({ active: z.boolean() }).strict();
export const gymStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'REJECTED']), reason: text(1000) }).strict();
export const branchStatusSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: text(1000) }).strict();
export const reviewSchema = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: text(1000) }).strict();
export const reasonSchema = z.object({ reason: text(1000) }).strict();

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('INVALID_INPUT');
  return result.data;
}
