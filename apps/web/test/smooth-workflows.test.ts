import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Review,TopupCard} from "../components/reviews";
import {BranchDirectory,DirectoryCard,type DirectoryBranch} from "../components/branch-directory";
import {roleTabs,roleQuickTabs} from "../lib/navigation";
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
test("directory offers explicit nearby lookup plus manual search",()=>{
 const html=renderToStaticMarkup(createElement(BranchDirectory,{}));
 assert.match(html,/الجيمات الأقرب لمكاني/);assert.match(html,/ابحث عن جيم أو منطقة/);
});
test("a nearby branch shows price, distance and directions immediately",()=>{
 const branch:DirectoryBranch={id:"test",name:"فرع",address:"شارع اختبار",governorate:"المنوفية",city:"شبين",contactPhone:null,openingHours:null,latitude:"30.5",longitude:"31",visitPricePoints:25,sessionMinutes:90,pricingVersion:1,distanceKm:0.4,gym:{id:"gym",name:"جيم",description:""}};
 const html=renderToStaticMarkup(createElement(DirectoryCard,{branch,onOpen:()=>{}}));
 assert.match(html,/400 متر/);assert.match(html,/الاتجاهات/);assert.match(html,/25/);
});
test("role navigation hides owner purchases and admin setup from staff while preserving their work",()=>{
 for(const role of ["CASHIER","BRANCH_MANAGER"]){assert.ok(roleTabs[role]!.includes("cashier"));assert.ok(!roleTabs[role]!.includes("purchases"));assert.ok(!roleTabs[role]!.includes("payments"));}
 for(const [role,quick] of Object.entries(roleQuickTabs))for(const destination of quick)assert.ok(roleTabs[role]!.includes(destination));
});

test('directory uses native control order and prefers the gym logo over a branch cover',()=>{
 const search=renderToStaticMarkup(createElement(BranchDirectory,{}));
 assert.ok(search.indexOf('directory-search-row')<search.indexOf('directory-location-row'));
 assert.ok(search.indexOf('directory-location-row')<search.indexOf('directory-filters'));
 assert.doesNotMatch(search,/اختار جيم تمرينتك|شوف سعر الزيارة والمكان/);
 const branch:DirectoryBranch={id:'logo-test',name:'فرع أول',address:'عنوان',governorate:'المنوفية',city:'أشمون',contactPhone:null,openingHours:null,latitude:'30.5',longitude:'31',visitPricePoints:20,sessionMinutes:180,pricingVersion:1,gym:{id:'gym',name:'شوشه جيم',description:''},images:[{id:'photo',url:'https://example.test/photo.jpg',purpose:'PHOTO'},{id:'logo',url:'https://example.test/logo.png',purpose:'LOGO'}]};
 const card=renderToStaticMarkup(createElement(DirectoryCard,{branch,onOpen:()=>{}}));
 assert.match(card,/src="https:\/\/example.test\/logo.png"/);assert.doesNotMatch(card,/photo.jpg|directory-cover|directory-address/);
 assert.match(card,/تفاصيل الجيم والاتجاهات/);assert.match(card,/180/);
});
