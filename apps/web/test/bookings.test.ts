import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {bookingToken,bookingWindow,policySummary} from '../lib/bookings';
import {allowedPath} from '../lib/security';
test('booking QR cannot be mistaken for a personal walk-in QR or external URL',()=>{
 const token='a'.repeat(43);
 assert.equal(bookingToken('gymbooking:'+token),token);
 for(const raw of [token,'gymqr:'+token,'https://example.test/'+token,'gymbooking:short'])assert.equal(bookingToken(raw),null);
});
test('arrival controls follow booking state and the inclusive saved deadline',()=>{
 const b={status:'RESERVED',scheduledAt:'2026-11-01T12:00:00Z',deadlineAt:'2026-11-01T13:00:00Z'};
 assert.equal(bookingWindow(b,Date.parse(b.scheduledAt)-3600000),true);
 assert.equal(bookingWindow(b,Date.parse(b.scheduledAt)),true);
 assert.equal(bookingWindow(b,Date.parse(b.deadlineAt)),true);
 assert.equal(bookingWindow(b,Date.parse(b.deadlineAt)+1),false);
 assert.equal(bookingWindow({...b,status:'ATTENDED'},Date.parse(b.scheduledAt)),false);
});
test('saved policy explains manual review and automatic gym/platform distributions',()=>{
 assert.match(policySummary({mode:'MANUAL',graceMinutes:60}),/مراجعة الإدارة/);
 const text=policySummary({mode:'AUTOMATIC',graceMinutes:60,allocation:{traineeBps:0,gymBps:6000,platformBps:4000}});
 assert.match(text,/60% للجيم/);assert.match(text,/40% للمنصة/);assert.doesNotMatch(text,/للمتدرب/);
});
test('gateway exposes exact booking methods without broadening other paths',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 for(const [method,path] of [['GET','booking-policy'],['POST','trainee/bookings'],['GET','trainee/bookings'],['POST','trainee/bookings/'+id+'/qr'],['POST','trainee/bookings/'+id+'/cancel'],['GET','admin/bookings/review'],['POST','admin/bookings/'+id+'/decision'],['POST','operations/branches/'+id+'/bookings/scan']])assert.equal(allowedPath(method!,path!),true);
 assert.equal(allowedPath('DELETE','trainee/bookings/'+id),false);
 assert.equal(allowedPath('POST','operations/branches/not-a-uuid/bookings/scan'),false);
});
