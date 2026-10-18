import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {WorkHome} from "../components/work-home";
import {AdminHome} from "../components/admin-home";
import {invitationLink,invitationToken} from "../lib/invitation-link";
import {roleTabs,roleQuickTabs} from "../lib/navigation";
test("invitations carry the one-time token only in the fragment, not the server URL",()=>{
 const token="A".repeat(43),link=invitationLink("https://example.test",token),url=new URL(link);
 assert.equal(url.search,"");assert.equal(url.pathname,"/");assert.equal(invitationToken(url.hash),token);
 for(const hash of ["#invite=wrong","#other="+token,"#invite="+token+"x"])assert.equal(invitationToken(hash),null);
 assert.throws(()=>invitationLink("javascript:alert(1)",token));
});
test("cashiers get direct visit and sale actions without gym ownership settings",()=>{
 const html=renderToStaticMarkup(createElement(WorkHome,{role:"CASHIER",name:"اختبار",onNavigate:()=>{}}));
 assert.match(html,/دخّل متدرب/);assert.match(html,/بيع نقاط لمتدرب/);
 assert.doesNotMatch(html,/اشحن نقاط الفرع|مستحقاتي والسحب/);
});
test("owners get their core tasks and every staff role has a one-tap home",()=>{
 const html=renderToStaticMarkup(createElement(WorkHome,{role:"GYM_OWNER",name:"اختبار",onNavigate:()=>{}}));
 assert.match(html,/الجيم والفروع/);assert.match(html,/اشحن نقاط الفرع/);assert.match(html,/مستحقاتي والسحب/);
 for(const role of ["GYM_OWNER","BRANCH_MANAGER","CASHIER"]){assert.ok(roleTabs[role]!.includes("home"));assert.ok(roleQuickTabs[role]!.includes("home"));assert.equal(roleQuickTabs[role]!.length,3);}
});
test("admin daily tasks are available immediately before setup data finishes loading",()=>{
 const html=renderToStaticMarkup(createElement(AdminHome,{onNavigate:()=>{}}));
 assert.match(html,/راجع طلبات الشحن/);assert.match(html,/الجيمات والفروع/);
});
