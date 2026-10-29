import { z } from 'zod';

// Bound prices/durations before the subsequent multi-service sum is computed.
export const serviceInput = z.object({
  name: z.string().trim().min(1).max(150),
  presetId: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).optional(),
  openMinute: z.number().int().min(0).max(1439).nullable().optional(),
  closeMinute: z.number().int().min(0).max(1439).nullable().optional(),
  description: z.string().trim().max(2000).default(''),
  points: z.number().int().positive().max(1000000),
  durationMinutes: z.number().int().positive().max(1440),
  reason: z.string().trim().min(5).max(1000),
}).strict();
export const serviceChangeInput = serviceInput.extend({ expectedVersion: z.number().int().nonnegative() });
export const serviceStatusInput = z.object({ active: z.boolean(), expectedVersion: z.number().int().nonnegative() }).strict();
export const serviceReviewInput = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(5).max(1000),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
