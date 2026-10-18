import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {WithdrawalBalanceCard,type WithdrawalBalances} from "../components/withdrawal-balances";
const b:WithdrawalBalances={visitCount:2,visitEarningsPiasters:"10000",otherAdjustmentsPiasters:"0",latestVisits:[],asOf:"2026-10-18T12:00:00Z",consistent:true,netEntitlementsPiasters:"10000",outstandingPiasters:"10000",availablePiasters:"7000",reservedPiasters:"3000",currentReservedPiasters:"1000",otherReservedPiasters:"2000",disputedPiasters:"0",paidPiasters:"0",availableAfterPaymentPiasters:"7000"};
test("pending withdrawal explains the existing reservation and unchanged available balance on payment",()=>{
 const html=renderToStaticMarkup(createElement(WithdrawalBalanceCard,{balances:b,amount:"1000",status:"REQUESTED"}));
 assert.match(html,/مبلغ الطلب محجوز بالفعل/);assert.match(html,/ولا يخصم المبلغ مرة أخرى/);
 assert.match(html,/محجوز لطلبات أخرى/);assert.match(html,/70/);assert.doesNotMatch(html,/60 ج/);
});
test("paid or disputed requests never claim the original request is still reserved",()=>{
 for(const status of ["PAID","DISPUTED"]){
 const html=renderToStaticMarkup(createElement(WithdrawalBalanceCard,{balances:{...b,currentReservedPiasters:"0",availableAfterPaymentPiasters:null},amount:"1000",status}));
 assert.match(html,/وليس محجوزًا حاليًا/);assert.doesNotMatch(html,/مبلغ الطلب محجوز بالفعل/);
 }
});
test("mismatched snapshots warn instead of asserting a covered withdrawal",()=>{
 const html=renderToStaticMarkup(createElement(WithdrawalBalanceCard,{balances:{...b,consistent:false,otherReservedPiasters:null,availableAfterPaymentPiasters:null},amount:"1000",status:"REQUESTED"}));
 assert.match(html,/لا تعتمد صرف الطلب/);assert.doesNotMatch(html,/مبلغ الطلب محجوز بالفعل/);
});
