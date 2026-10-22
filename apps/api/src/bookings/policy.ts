import { z } from 'zod';
import { DomainError } from '../domain/errors.js';
import { parse } from '../gyms/validation.js';

export const allocationSchema = z.object({
  traineeBps: z.number().int().min(0).max(10000),
  gymBps: z.number().int().min(0).max(10000),
  platformBps: z.number().int().min(0).max(10000),
}).strict().refine(v => v.traineeBps + v.gymBps + v.platformBps === 10000);

export const bookingPolicySchema = z.discriminatedUnion('mode', [
  z.object({ graceMinutes: z.number().int().min(0).max(10080), mode: z.literal('MANUAL') }).strict(),
  z.object({ graceMinutes: z.number().int().min(0).max(10080), mode: z.literal('AUTOMATIC'), allocation: allocationSchema }).strict(),
]);
export const publishBookingPolicySchema = z.object({
  expectedVersion: z.number().int().min(0).max(2147483646),
  policy: bookingPolicySchema,
}).strict();
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

// Snapshot values are copied, so later configuration edits cannot change a booking.
export function snapshotPolicy(input: unknown): BookingPolicy {
  return parse(bookingPolicySchema, input);
}
export function cancellationDeadline(scheduledAt: Date, input: unknown): Date {
  const policy = snapshotPolicy(input);
  const time = scheduledAt.getTime() + policy.graceMinutes * 60000;
  if (!Number.isFinite(time) || !Number.isFinite(new Date(time).getTime())) throw new DomainError('INVALID_INPUT');
  return new Date(time);
}
// Cancellation must occur strictly before the grace deadline.
export function isWithinGrace(scheduledAt: Date, now: Date, policy: unknown): boolean {
  if (!Number.isFinite(now.getTime())) throw new DomainError('INVALID_INPUT');
  return now.getTime() < cancellationDeadline(scheduledAt, policy).getTime();
}
export function allocatePoints(points: number, input: unknown) {
  if (!Number.isSafeInteger(points) || points <= 0 || points > 2147483647) throw new DomainError('INVALID_INPUT');
  const allocation = parse(allocationSchema, input);
  const shares = [allocation.traineeBps, allocation.gymBps, allocation.platformBps].map(bps => BigInt(points) * BigInt(bps));
  const values = shares.map(value => Number(value / 10000n));
  // Largest remainder allocation preserves every whole point; ties favor trainee, gym, platform.
  const order = [0, 1, 2].sort((a, b) => Number(shares[b]! % 10000n - shares[a]! % 10000n) || a - b);
  const remainder = points - values.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remainder; i++) values[order[i]!] = values[order[i]!]! + 1;
  return { traineePoints: values[0]!, gymPoints: values[1]!, platformPoints: values[2]! };
}
export function noShowDecision(points: number, input: unknown) {
  const policy = snapshotPolicy(input);
  return policy.mode === 'MANUAL'
    ? { status: 'PENDING_REVIEW' as const }
    : { status: 'ALLOCATED' as const, ...allocatePoints(points, policy.allocation) };
}
