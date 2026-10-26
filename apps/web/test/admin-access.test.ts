import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {existsSync} from 'node:fs';
import {requirePlatformAdmin,allowedAdminPath} from '../lib/admin-access';
import {allowedPath,GatewayError} from '../lib/security';
import {Login} from '../components/login';
import {adminSections,adminSectionFor,isAdminDestination} from '../lib/navigation';
test('browser session authorization rejects every non-platform role including old cookies',()=>{
 assert.throws(()=>requirePlatformAdmin(null),(e)=>e instanceof GatewayError&&e.status===401);
 for(const role of ['TRAINEE','GYM_OWNER','BRANCH_MANAGER','CASHIER','UNKNOWN'])assert.throws(()=>requirePlatformAdmin({role}),(e)=>e instanceof GatewayError&&e.status===403);
 assert.equal(requirePlatformAdmin({role:'PLATFORM_ADMIN'}).role,'PLATFORM_ADMIN');
});
test('browser and native scopes are separate without breaking native workflows',()=>{
 const id='11111111-1111-4111-8111-111111111111';
 for(const [method,path] of [['GET','trainee/wallet'],['GET','gyms'],['POST','trainee/bookings'],['POST','topups'],['POST',`cashier/branches/${id}/visits`],['POST','me/account-deletion']]){
  assert.equal(allowedPath(method!,path!),true);assert.equal(allowedAdminPath(method!,path!),false);
 }
 for(const [method,path] of [['GET','admin/topup-settings'],['POST','admin/pricing-policies'],['PUT','admin/welcome-points'],['GET','admin/bookings/review'],['GET','support/contact'],['GET','reports/summary'],['POST',`support/tickets/${id}/messages`],['PATCH',`gyms/${id}/branches/${id}`]])assert.equal(allowedAdminPath(method!,path!),true,path);
 for(const path of ['admin/unknown','admin/users/delete','../admin/users','auth/signin','gyms/not-a-uuid/branches'])assert.equal(allowedAdminPath('POST',path),false,path);
});
test('platform login has one sign-in form and no registration, invitation or phone proof UI',()=>{
 const html=renderToStaticMarkup(createElement(Login,{onLogin:()=>{}}));
 assert.match(html,/صاحب المنصة/);assert.equal((html.match(/<form/g)??[]).length,1);
 assert.doesNotMatch(html,/حساب جديد|إنشاء حساب|قبول الدعوة|متدرب|صاحب جيم|SMS|واتساب/);
});
test('general settings have their own sections and no operational queues',()=>{
 assert.deepEqual(adminSections.find(s=>s.id==='settings')?.items,['pricing','welcome','payments','packages','booking-policy','support-contact']);
 assert.equal(adminSectionFor('booking-reviews').id,'requests');assert.equal(adminSectionFor('support').id,'communication');
 assert.equal(adminSectionFor('booking-policy').id,'settings');assert.equal(isAdminDestination('trainee'),false);
 assert.equal(isAdminDestination('cashier'),false);assert.equal(isAdminDestination('welcome'),true);
});
test('retired role frontends and cookie signup endpoints are physically absent',()=>{
 for(const path of ['components/trainee-portal.tsx','components/owner-portal.tsx','components/staff-portal.tsx','components/phone-auth-preview.tsx','components/operations.tsx','app/api/register/route.ts','app/api/phone-auth/[action]/route.ts','app/api/whatsapp/[action]/route.ts','app/delete-account/page.tsx'])assert.equal(existsSync(new URL('../'+path,import.meta.url)),false,path);
 for(const path of ['app/api/mobile/[...path]/route.ts','app/api/whatsapp/webhook/route.ts'])assert.equal(existsSync(new URL('../'+path,import.meta.url)),true,path);
});
