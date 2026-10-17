import assert from "node:assert/strict";
import test from "node:test";
import {
  csvCell,
  filterSchema,
  rowsSchema,
  period,
} from "../src/reports/validation.js";
import { reportCsv } from "../src/reports/service.js";
test("report filters require real Cairo dates, bounded periods, valid states and UUID scopes", () => {
  const f = { from: "2026-10-01", to: "2026-10-17" };
  assert.ok(filterSchema.safeParse(f).success);
  for (const extra of [
    { from: "2026-02-30" },
    { from: "2027-01-01" },
    { to: "2028-01-01" },
    { gymId: "' OR 1=1" },
    { limit: 10 },
  ])
    assert.equal(filterSchema.safeParse({ ...f, ...extra }).success, false);
  assert.equal(
    rowsSchema.safeParse({ ...f, kind: "SALES", status: "APPROVED" }).success,
    false,
  );
  assert.equal(
    rowsSchema.safeParse({
      ...f,
      kind: "VISITS",
      status: "EXPIRED",
      limit: 101,
    }).success,
    false,
  );
  assert.ok(
    rowsSchema.safeParse({ ...f, kind: "VISITS", status: "EXPIRED", limit: 1 })
      .success,
  );
});
test("inclusive date filters cover the whole Cairo day even across seasonal clock changes", () => {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const day of ["2026-01-15", "2026-04-24", "2026-10-29", "2026-10-30"]) {
    const p = period({ from: day, to: day });
    assert.equal(fmt.format(p.start), day);
    assert.equal(fmt.format(new Date(p.end.getTime() - 1)), day);
    assert.notEqual(fmt.format(new Date(p.start.getTime() - 1)), day);
    assert.ok(p.end.getTime() - p.start.getTime() >= 23 * 3600000);
    assert.ok(p.end.getTime() - p.start.getTime() <= 25 * 3600000);
  }
});
test("CSV quotes commas/newlines and neutralizes spreadsheet formula cells", () => {
  for (const value of [
    '=HYPERLINK("bad")',
    "+cmd",
    "-cmd",
    "@SUM(A1)",
    "  =cmd",
    "\t=cmd",
    "\r=cmd",
  ])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.equal(csvCell("جيم، فرع"), '"جيم، فرع"');
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csvCell(null), '""');
});
test("CSV preserves exact piasters and operation references with no private financial fields", () => {
  const csv = reportCsv([
    {
      id: "id",
      referenceId: "original-visit",
      eventAt: new Date("2026-10-17T00:00:00Z"),
      gymId: null,
      gymName: "=evil()",
      branchId: null,
      branchName: null,
      status: "CANCELLED",
      points: "30",
      amountPiasters: "9007199254740993",
      actorId: "actor",
    },
  ]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("9007199254740993"));
  assert.ok(csv.includes("original-visit"));
  assert.ok(csv.includes("'=evil()"));
  assert.equal(
    /proof|token|phone|email|destination|requestHash/.test(csv),
    false,
  );
});
