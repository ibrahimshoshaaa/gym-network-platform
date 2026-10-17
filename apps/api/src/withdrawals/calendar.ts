import { z } from "zod";
import { DomainError } from "../domain/errors.js";
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  });
export const calendarSchema = z
  .object({
    expectedVersion: z.number().int().min(0).max(2147483646),
    workdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((a) => new Set(a).size === a.length),
    holidays: z
      .array(dateKey)
      .max(500)
      .refine((a) => new Set(a).size === a.length),
    countAcceptanceDay: z.boolean(),
    deadlineHour: z.number().int().min(0).max(23),
    deadlineMinute: z.number().int().min(0).max(59),
  })
  .strict();
export type Calendar = Pick<
  z.infer<typeof calendarSchema>,
  | "workdays"
  | "holidays"
  | "countAcceptanceDay"
  | "deadlineHour"
  | "deadlineMinute"
>;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(d: Date) {
  const p = Object.fromEntries(
    formatter.formatToParts(d).map((x) => [x.type, x.value]),
  );
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}
// Find actual instants using the runtime's IANA zone data. Nonexistent local
// cutoffs fail closed; an ambiguous repeated time uses its later occurrence.
export function cairoInstant(day: string, hour: number, minute: number) {
  const nominal = Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute) * 60000;
  const offsets = new Set<number>();
  for (const delta of [-36, 0, 36]) {
    const at = new Date(nominal + delta * 3600000),
      p = parts(at);
    offsets.add(
      Date.parse(`${p.date}T00:00:00Z`) +
        (p.hour * 3600 + p.minute * 60 + p.second) * 1000 -
        at.getTime(),
    );
  }
  const valid = [...offsets]
    .map((offset) => new Date(nominal - offset))
    .filter((d) => {
      const p = parts(d);
      return p.date === day && p.hour === hour && p.minute === minute;
    });
  if (!valid.length) throw new DomainError("CALENDAR_CUTOFF_INVALID");
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}
export function withdrawalDeadline(acceptedAt: Date, calendar: Calendar) {
  if (!calendar.workdays.length)
    throw new DomainError("CALENDAR_NOT_CONFIGURED");
  const first = parts(acceptedAt).date;
  let cursor = new Date(`${first}T12:00:00Z`),
    count = 0;
  const holidays = new Set(calendar.holidays);
  // At most 500 holidays and at least one weekday makes this ample and bounded.
  for (let n = 0; n < 4000; n++) {
    const key = cursor.toISOString().slice(0, 10),
      weekday = cursor.getUTCDay() || 7;
    if (
      (n > 0 || calendar.countAcceptanceDay) &&
      calendar.workdays.includes(weekday) &&
      !holidays.has(key)
    ) {
      const cutoff = cairoInstant(
        key,
        calendar.deadlineHour,
        calendar.deadlineMinute,
      );
      if (cutoff > acceptedAt && ++count === 3) return cutoff;
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }
  throw new DomainError("CALENDAR_CUTOFF_INVALID");
}
