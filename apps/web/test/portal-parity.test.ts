import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PortalHeader} from '../components/portal-header';
import {StaffPortal} from '../components/staff-portal';
const user={id:'synthetic',displayName:'اختبار',email:'test@example.test',phone:'+201500000000',role:'CASHIER'};
test('personal portal header uses the approved native wordmark and one notification control',()=>{
 const html=renderToStaticMarkup(createElement(PortalHeader,{user,onNavigate:()=>{}}));
 assert.match(html,/gymbank-wordmark.png/);assert.equal((html.match(/<button/g)??[]).length,1);assert.doesNotMatch(html,/الملف الشخصي|الدعم والمساعدة/);
});
for(const role of ['CASHIER','BRANCH_MANAGER'])test(`${role} uses the native four-section branch workspace`,()=>{
 const html=renderToStaticMarkup(createElement(StaffPortal,{user:{...user,role},logout:async()=>{},loggingOut:false,onPassword:()=>{},error:''}));
 const nav=html.match(/<nav[\s\S]*?<\/nav>/)?.[0]??'';
 assert.equal((nav.match(/<button/g)??[]).length,4);
 for(const label of ['الرئيسية','الزيارات','التشغيل','حسابي'])assert.ok(nav.includes(label));
 assert.doesNotMatch(html,/sidebar|إدارة المنصة/);
});
