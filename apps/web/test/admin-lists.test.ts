import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {filterRecords,normalizeSearch} from "../lib/list-filter";
import {adminQueues} from '../lib/admin-queues';
import {AdminHome} from "../components/admin-home";
const rows=[{name:"إبراهيم شُوشه",phone:"01025269977",status:"PENDING"},{name:"احمد",phone:"01000000000",status:"ACTIVE"}];
test("Arabic search accepts accents, alef variants and Arabic digits",()=>{
 assert.equal(normalizeSearch("إِبـراهيم ٠١٠"),"ابراهيم 010");
 assert.deepEqual(filterRecords(rows,"ابراهيم ٠١٠٢","",r=>r.name+" "+r.phone,r=>r.status),[rows[0]]);
 assert.deepEqual(filterRecords(rows,"احمد","PENDING",r=>r.name,r=>r.status),[]);
 assert.deepEqual(filterRecords(rows,"","ACTIVE",r=>r.name,r=>r.status),[rows[1]]);
 assert.equal(rows.length,2);
});

import {AdminOverview,type AdminSummary} from "../components/admin-home";
import {adminSections,adminSectionFor,roleTabs,roleQuickTabs} from "../lib/navigation";
const labels=adminQueues.map(q=>q.label);
const summary=(values:Record<string,string>={}):AdminSummary=>({asOf:"2026-10-19T12:00:00Z",cards:labels.map(label=>({label,value:values[label]??"0",destination:"reviews"}))});
test("admin home starts with the decision queue, not a financial report or section directory",()=>{
 const html=renderToStaticMarkup(createElement(AdminHome,{onNavigate:()=>{}}));
 assert.match(html,/محتاج تدخلك/);
 assert.match(html,/راجع طلبات الشحن/);
 assert.doesNotMatch(html,/الصورة المالية|باقي مهام الإدارة|حسابات استقبال التحويل|0 طلب|مفيش طلبات منتظرة/);
});
test("every admin destination belongs to exactly one task-oriented section and mobile tabs remain authorized",()=>{
 assert.equal(adminSections.length,8);
 const destinations=adminSections.flatMap(section=>[section.id,...section.items]);
 assert.equal(new Set(destinations).size,destinations.length);
 assert.deepEqual([...destinations].sort(),[...roleTabs.PLATFORM_ADMIN!].sort());
 assert.equal(adminSectionFor("withdrawals").id,"finance");
 assert.equal(adminSectionFor("pricing").id,"settings");
 assert.equal(adminSectionFor("direct-topup").id,"finance");
 for(const id of roleQuickTabs.PLATFORM_ADMIN!) assert.ok(roleTabs.PLATFORM_ADMIN!.includes(id));
 assert.deepEqual(Object.keys(roleTabs),["PLATFORM_ADMIN"]);
});
test("approved payouts remain actionable even when no new withdrawal needs review",()=>{
 const html=renderToStaticMarkup(createElement(AdminOverview,{data:summary({"تحويلات تنتظر التنفيذ":"3","تحويلات متأخرة":"1"}),onNavigate:()=>{}}));
 assert.match(html,/تحويلات جاهزة للتنفيذ/);
 assert.doesNotMatch(html,/مفيش طلبات منتظرة/);
});
test("missing or stale counts never claim the queue is clear",()=>{
 for(const data of [{asOf:"2026-10-19T12:00:00Z",cards:[]},summary()]){
  const html=renderToStaticMarkup(createElement(AdminOverview,{data,stale:true,onNavigate:()=>{}}));
  assert.doesNotMatch(html,/مفيش طلبات منتظرة/);
  assert.match(html,/آخر تحميل ناجح/);
 }
 const empty=renderToStaticMarkup(createElement(AdminOverview,{data:summary(),onNavigate:()=>{}}));
 assert.match(empty,/مفيش طلبات منتظرة/);
});
