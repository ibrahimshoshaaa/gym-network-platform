import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceInput} from '../src/services/validation.js';
import {requireSessionFits} from '../src/bookings/hours.js';
test('preset identifiers and explicit daily service hours are bounded',()=>{
 const base={name:'Cardio',presetId:'cardio',points:50,durationMinutes:20,reason:'New service'};
 assert.equal(serviceInput.safeParse({...base,openMinute:540,closeMinute:1200}).success,true);
 for(const patch of [{presetId:'../admin'},{openMinute:-1},{closeMinute:1440}])assert.equal(serviceInput.safeParse({...base,...patch}).success,false);
});
test('service hours reject sessions unavailable at the selected time or ending after service closes',()=>{
 const start=new Date('2026-11-01T09:00:00+02:00');
 assert.doesNotThrow(()=>requireSessionFits(start,20,{openMinute:480,closeMinute:600}));
 assert.throws(()=>requireSessionFits(start,20,{openMinute:600,closeMinute:700}));
 assert.throws(()=>requireSessionFits(start,90,{openMinute:480,closeMinute:600}));
});
