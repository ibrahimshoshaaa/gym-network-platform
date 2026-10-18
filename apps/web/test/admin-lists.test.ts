import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {filterRecords,normalizeSearch} from "../lib/list-filter";
import {AdminHome} from "../components/admin-home";
const rows=[{name:"إبراهيم شُوشه",phone:"01025269977",status:"PENDING"},{name:"احمد",phone:"01000000000",status:"ACTIVE"}];
test("Arabic search accepts accents, alef variants and Arabic digits",()=>{
 assert.equal(normalizeSearch("إِبـراهيم ٠١٠"),"ابراهيم 010");
 assert.deepEqual(filterRecords(rows,"ابراهيم ٠١٠٢","",r=>r.name+" "+r.phone,r=>r.status),[rows[0]]);
 assert.deepEqual(filterRecords(rows,"احمد","PENDING",r=>r.name,r=>r.status),[]);
 assert.deepEqual(filterRecords(rows,"","ACTIVE",r=>r.name,r=>r.status),[rows[1]]);
 assert.equal(rows.length,2);
});
test("admin home exposes every work area without waiting for API data",()=>{
 const html=renderToStaticMarkup(createElement(AdminHome,{onNavigate:()=>{}}));
 for(const label of ["راجع طلبات الشحن","الجيمات والفروع","التقارير والمتابعة","اعتماد أسعار الزيارات","طلبات سحب الجيمات","طلبات الإلغاء والتصحيح","أرصدة الفروع","تسعير النقاط والنسب","حسابات استقبال التحويل","باقات الشحن"])assert.ok(html.includes(label),label);
 assert.doesNotMatch(html,/0 طلب|لا توجد طلبات/);
});
