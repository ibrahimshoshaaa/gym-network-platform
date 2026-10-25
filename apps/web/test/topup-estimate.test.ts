import assert from 'node:assert/strict';
import test from 'node:test';
import {topupEstimate} from '../lib/topup-estimate';
const policy={id:'test',version:1,pointPricePiasters:'100',redemptionBps:8000};
test('native topup estimates normalize Arabic input and apply discount only to gym stock',()=>{
 assert.deepEqual(topupEstimate(policy,true,'١٠٠',false),{points:100,chargePiasters:'10000'});
 assert.equal(topupEstimate(policy,false,'۱۰۰',false),null);
 assert.equal(topupEstimate(policy,false,'90',true),null);
});
test('amount selection floors complete points then rounds the payable piasters upward',()=>{
 const fraction={...policy,pointPricePiasters:'101',};
 assert.deepEqual(topupEstimate(fraction,true,'10.00',true),{points:9,chargePiasters:'909'});
 assert.deepEqual(topupEstimate(fraction,true,'1',false),{points:1,chargePiasters:'101'});
});
test('invalid, zero, fractional or overflowing points cannot advance to a quote',()=>{
 for(const value of ['','0','-1','1.5','2147483648','1e3','100junk'])assert.equal(topupEstimate(policy,true,value,false),null);
 assert.equal(topupEstimate(policy,true,'0.01',true),null);
 assert.equal(topupEstimate(null,true,'100',false),null);
 assert.equal(topupEstimate({...policy,},false,'100',false),null);
 assert.deepEqual(topupEstimate(policy,true,'2147483647',false),{points:2147483647,chargePiasters:'214748364700'});
});
