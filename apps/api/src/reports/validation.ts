import { z } from "zod";
import { cairoInstant } from "../withdrawals/calendar.js";
import { DomainError } from "../domain/errors.js";
export const reportKind = z.enum([
  "TOPUPS",
  "VISITS",
  "CANCELLATIONS",
  "WITHDRAWALS",
]);
export type Kind = z.infer<typeof reportKind>;
const day = z
  .string()
  .regex(/^(20\d{2})-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
export const filterSchema = z
  .object({
    from: day,
    to: day,
    gymId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => {
    const length = Date.parse(v.to) - Date.parse(v.from);
    return length >= 0 && length < 366 * 86400000;
  });
export const statuses: Record<Kind, readonly string[]> = {
  TOPUPS: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"],
  VISITS: ["ACTIVE", "EXPIRED", "CANCELLED"],
  CANCELLATIONS: ["CANCELLED"],
  WITHDRAWALS: [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
    "CANCELLED",
    "PAID",
    "DISPUTED",
  ],
};
export const rowsSchema = z
  .object({
    ...filterSchema.shape,
    kind: reportKind,
    status: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) =>
      Date.parse(v.to) >= Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) < 366 * 86400000,
  )
  .refine((v) => !v.status || statuses[v.kind].includes(v.status));
export type Filter = z.infer<typeof filterSchema>;
export function dayStart(day: string) {
  // Some Cairo dates start after a clock jump. Include the first real minute,
  // and the earlier occurrence if the midnight hour repeats.
  for (let minute = 0; minute <= 180; minute++) {
    try {
      return cairoInstant(
        day,
        Math.floor(minute / 60),
        minute % 60,
        "earliest",
      );
    } catch (error) {
      if (
        !(
          error instanceof DomainError &&
          error.code === "CALENDAR_CUTOFF_INVALID"
        )
      )
        throw error;
    }
  }
  throw new DomainError("INVALID_INPUT");
}
export function period(f: Filter) {
  const next = new Date(Date.parse(`${f.to}T12:00:00Z`) + 86400000)
    .toISOString()
    .slice(0, 10);
  return { start: dayStart(f.from), end: dayStart(next) };
}
export function csvCell(value: string | null) {
  let text = value ?? "";
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text))
    text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
