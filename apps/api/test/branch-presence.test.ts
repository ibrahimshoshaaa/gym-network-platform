import assert from 'node:assert/strict';
import test from 'node:test';
import {validatePresence} from '../src/bookings/presence.js';
import {checkInSchema} from '../src/bookings/service.js';
const now=new Date('2026-11-01T12:00:00Z'),branch={latitude:30.6,longitude:31.0};
const location={...branch,accuracy:10,capturedAt:now.toISOString(),isMocked:false as const};
test('presence requires fresh, accurate coordinates within 150 meters of the actual branch',()=>{
 assert.equal(validatePresence(location,branch,now),0);
 assert.throws(()=>validatePresence({...location,latitude:30.61},branch,now),/GO_TO_BRANCH/);
 assert.throws(()=>validatePresence({...location,capturedAt:'2026-11-01T11:58:59Z'},branch,now),/LOCATION_STALE/);
 assert.throws(()=>validatePresence({...location,capturedAt:'2026-11-01T12:01:00Z'},branch,now),/LOCATION_STALE/);
 assert.throws(()=>validatePresence({...location,accuracy:51},branch,now),/LOCATION_INACCURATE/);
 assert.throws(()=>validatePresence({...location,latitude:NaN},branch,now),/INVALID_INPUT/);
});
test('check-in rejects location spoof flag, malformed QR tokens and client-selected attendance identity',()=>{
 const body={...location,branchId:'00000000-0000-4000-8000-000000000001',token:'A'.repeat(43)};
 assert.equal(checkInSchema.safeParse(body).success,true);
 for(const input of [{...body,isMocked:true},{...body,traineeId:body.branchId},{...body,points:1},{...body,token:'bad'},{...body,longitude:181}])assert.equal(checkInSchema.safeParse(input).success,false);
});
