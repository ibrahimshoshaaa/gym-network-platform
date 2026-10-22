import { DomainError } from '../domain/errors.js';

export const bookingTimeZone = 'Africa/Cairo';
export type DailyHours = { openMinute: number; closeMinute: number };
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: bookingTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function local(instant: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(instant).map(p => [p.type, p.value]));
  return { year: +parts.year!, month: +parts.month!, day: +parts.day!, hour: +parts.hour!, minute: +parts.minute!, second: +parts.second! };
}
function utcWall(year: number, month: number, day: number, minute: number) {
  return Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
}
function instantForWall(target: number) {
  let guess = target;
  for (let i = 0; i < 6; i++) {
    const p = local(new Date(guess));
    const rendered = utcWall(p.year, p.month, p.day, p.hour * 60 + p.minute) + p.second * 1000;
    if (rendered === target) return new Date(guess);
    guess += target - rendered;
  }
  // A nonexistent local boundary at a DST transition must never create an invalid window.
  throw new DomainError('INVALID_INPUT');
}
export function sessionWindow(start: Date, hours: DailyHours) {
  const { openMinute, closeMinute } = hours;
  if (![openMinute, closeMinute].every(v => Number.isInteger(v) && v >= 0 && v < 1440) || openMinute === closeMinute) throw new DomainError('INVALID_INPUT');
  const p = local(start), minute = p.hour * 60 + p.minute;
  const overnight = closeMinute < openMinute;
  if (overnight ? minute < openMinute && minute >= closeMinute : minute < openMinute || minute >= closeMinute) throw new DomainError('OUTSIDE_OPENING_HOURS');
  const day = p.day - (overnight && minute < closeMinute ? 1 : 0);
  return {
    opensAt: instantForWall(utcWall(p.year, p.month, day, openMinute)),
    closesAt: instantForWall(utcWall(p.year, p.month, day + (overnight ? 1 : 0), closeMinute)),
  };
}
export function requireSessionFits(start: Date, minutes: number, hours: DailyHours) {
  const window = sessionWindow(start, hours);
  if (start.getTime() + minutes * 60000 > window.closesAt.getTime()) throw new DomainError('SESSION_ENDS_AFTER_CLOSING');
  return window;
}
export function attendanceEnd(start: Date, minutes: number, hours: DailyHours, scheduledClosesAt: Date | null) {
  const window = sessionWindow(start, hours);
  if (!scheduledClosesAt || window.closesAt.getTime() !== scheduledClosesAt.getTime()) throw new DomainError('OUTSIDE_OPENING_HOURS');
  return new Date(Math.min(start.getTime() + minutes * 60000, window.closesAt.getTime()));
}
