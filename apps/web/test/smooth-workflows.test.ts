import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Review,TopupCard} from "../components/reviews";
import type {Topup} from "../lib/client";
const row:Topup={id:"test",kind:"TRAINEE",requestorUserId:"trainee",requestor:{displayName:"متدرب",email:"test@example.test",phoneE164:"+201000000001"},points:50,chargePiasters:"12500",unitPricePiasters:"250",discountBps:0,status:"PENDING",paymentMethod:"INSTAPAY",paymentAccount:"synthetic",paymentAccountName:"اختبار",receiptId:"test-receipt",reviewReason:null,createdAt:"2026-10-18T10:00:00Z"};
test("review opens on approval with the expected amount and explicit receipt-and-funds confirmation",()=>{
 const html=renderToStaticMarkup(createElement(Review,{request:row,onClose:()=>{},onDone:()=>{}}));
 assert.match(html,/125/);
 assert.match(html,/name="reference"/);
 assert.match(html,/name="confirmed"/);
 assert.doesNotMatch(html,/review-decision|name="amount"|name="reason"/);
 assert.match(html,/disabled=""[^>]*>قبول وإضافة 50 نقطة/);
});
test("pending topup cards expose the review action without a horizontal table",()=>{
 const html=renderToStaticMarkup(createElement(TopupCard,{row,onOpen:()=>{}}));
 assert.match(html,/مراجعة وقبول الشحن/);
 assert.doesNotMatch(html,/<table/);
});
