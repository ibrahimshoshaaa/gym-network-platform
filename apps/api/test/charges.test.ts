import test from 'node:test';
import assert from 'node:assert/strict';
import {chargeOutstanding} from '../src/charges/service.js';
test('service debt preserves exact piasters, partial collections and zero remainder',()=>{
 assert.equal(chargeOutstanding(125050n,50000n),75050n);
 assert.equal(chargeOutstanding(125050n,125050n),0n);
 assert.equal(chargeOutstanding(9007199254740993n,1n),9007199254740992n);
 assert.throws(()=>chargeOutstanding(100n,101n),/INVALID_STATE/);
 assert.throws(()=>chargeOutstanding(-1n,0n),/INVALID_STATE/);
});
