import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSessionFits, sessionWindow, attendanceEnd } from '../src/bookings/hours.js';
import { createBookingSchema } from '../src/bookings/service.js';
const hours={openMinute:17*60,closeMinute:3*60};
test('actual early/late arrival starts the duration at arrival and caps it at the saved closing time',()=>{
 const close=new Date('2026-11-02T03:00:00+02:00');
 assert.equal(attendanceEnd(new Date('2026-11-01T17:00:00+02:00'),90,hours,close).toISOString(),'2026-11-01T16:30:00.000Z');
 assert.equal(attendanceEnd(new Date('2026-11-02T02:20:00+02:00'),90,hours,close).getTime(),close.getTime());
 assert.throws(()=>attendanceEnd(new Date('2026-11-02T17:00:00+02:00'),90,hours,close),/OUTSIDE_OPENING_HOURS/);
});
test('overnight Cairo session ends exactly at closing, rejects one minute later',()=>{
 const start=new Date('2026-11-02T01:30:00+02:00');
 assert.equal(requireSessionFits(start,90,hours).closesAt.toISOString(),'2026-11-02T01:00:00.000Z');
 assert.throws(()=>requireSessionFits(new Date('2026-11-02T01:31:00+02:00'),90,hours),/SESSION_ENDS_AFTER_CLOSING/);
 assert.throws(()=>sessionWindow(new Date('2026-11-02T03:00:00+02:00'),hours),/OUTSIDE_OPENING_HOURS/);
 assert.throws(()=>sessionWindow(new Date('2026-11-02T16:59:00+02:00'),hours),/OUTSIDE_OPENING_HOURS/);
});
test('daily hours use Cairo DST rather than server or phone timezone',()=>{
 const summer=sessionWindow(new Date('2026-07-01T18:00:00+03:00'),{openMinute:9*60,closeMinute:23*60});
 assert.equal(summer.closesAt.toISOString(),'2026-07-01T20:00:00.000Z');
 const winter=sessionWindow(new Date('2026-11-01T18:00:00+02:00'),{openMinute:9*60,closeMinute:23*60});
 assert.equal(winter.closesAt.toISOString(),'2026-11-01T21:00:00.000Z');
});
test('service selection rejects duplicates, unversioned terms, client totals, and ambiguous times',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const body={branchId:id,startNow:true,policyVersion:1,hoursVersion:1,services:[{id,version:1}]};
 assert.equal(createBookingSchema.safeParse(body).success,true);
 for(const invalid of [{...body,services:[...body.services,...body.services]},{...body,hoursVersion:undefined},{...body,points:1},{...body,scheduledAt:'2026-11-01T12:00:00Z'},{...body,startNow:undefined}])assert.equal(createBookingSchema.safeParse(invalid).success,false);
});

test('combined service windows use earliest closing for booking and attendance',()=>{
 const start=new Date('2026-11-01T10:00:00+02:00');
 const combined={openMinute:0,closeMinute:1380,additional:[{openMinute:540,closeMinute:660}]};
 const close=requireSessionFits(start,60,combined).closesAt;
 assert.equal(close.toISOString(),'2026-11-01T09:00:00.000Z');
 assert.throws(()=>requireSessionFits(start,61,combined),/SESSION_ENDS_AFTER_CLOSING/);
 assert.equal(attendanceEnd(new Date('2026-11-01T10:30:00+02:00'),60,combined,close).getTime(),close.getTime());
 assert.throws(()=>attendanceEnd(new Date('2026-11-01T12:00:00+02:00'),60,combined,close),/OUTSIDE_OPENING_HOURS/);
});
