import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarSchema,
  cairoInstant,
  withdrawalDeadline,
} from "../src/withdrawals/calendar.js";
const base = {
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  countAcceptanceDay: false,
  deadlineHour: 17,
  deadlineMinute: 30,
};
test("withdrawal calendar counts three configured working days, holidays and optional acceptance day", () => {
  const accepted = cairoInstant("2026-10-19", 10, 0);
  assert.deepEqual(
    withdrawalDeadline(accepted, base),
    cairoInstant("2026-10-22", 17, 30),
  );
  assert.deepEqual(
    withdrawalDeadline(accepted, { ...base, holidays: ["2026-10-20"] }),
    cairoInstant("2026-10-23", 17, 30),
  );
  assert.deepEqual(
    withdrawalDeadline(accepted, { ...base, countAcceptanceDay: true }),
    cairoInstant("2026-10-21", 17, 30),
  );
  assert.deepEqual(
    withdrawalDeadline(cairoInstant("2026-10-19", 18, 0), {
      ...base,
      countAcceptanceDay: true,
    }),
    cairoInstant("2026-10-22", 17, 30),
  );
});
test("Cairo cutoffs preserve local date and hour across seasonal zone changes", () => {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const day of [
    "2026-01-15",
    "2026-04-23",
    "2026-04-24",
    "2026-07-15",
    "2026-10-29",
    "2026-10-30",
    "2026-12-15",
  ]) {
    const p = Object.fromEntries(
      format
        .formatToParts(cairoInstant(day, 17, 30))
        .map((x) => [x.type, x.value]),
    );
    assert.equal(`${p.year}-${p.month}-${p.day}`, day);
    assert.equal(p.hour, "17");
    assert.equal(p.minute, "30");
  }
});
test("calendar requires explicit bounded settings and rejects duplicate or impossible dates", () => {
  const data = { ...base, expectedVersion: 0 };
  assert.ok(calendarSchema.safeParse(data).success);
  for (const extra of [
    { workdays: [] },
    { workdays: [1, 1] },
    { holidays: ["2026-02-30"] },
    { holidays: ["2026-10-20", "2026-10-20"] },
    { deadlineHour: 24 },
    { timezone: "UTC" },
  ])
    assert.equal(
      calendarSchema.safeParse({ ...data, ...extra }).success,
      false,
    );
});
