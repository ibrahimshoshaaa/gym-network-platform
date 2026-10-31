import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ReviewNote,DecisionButtons,decisionReason} from '../components/review-decision';
import {adminQueues,queueCounts} from '../lib/admin-queues';
import {isAdminDestination} from '../lib/navigation';
import {allowedAdminPath} from '../lib/admin-access';
test('review reasons require no typing and retain an explicit audit description',()=>{
 const preset='تمت مراجعة الإعلان والموافقة على نشره.';
 const html=renderToStaticMarkup(createElement(ReviewNote,{preset,maxLength:500}));
 assert.match(html,/<input type="hidden" name="reason"/);assert.ok(html.includes(preset));
 assert.match(html,/إضافة ملاحظة \(اختياري\)/);assert.doesNotMatch(html,/<textarea[^>]*required/);
 assert.equal(decisionReason(preset,'  '),preset);assert.equal(decisionReason(preset,' تعديل الصورة '),preset+' — تعديل الصورة');
 const bound=Number(html.match(/maxLength="(\d+)"/)![1]);assert.ok(decisionReason(preset,'x'.repeat(bound)).length<=500);
});
test('rejection presets and clear action buttons preserve accessible selection',()=>{
 const html=renderToStaticMarkup(createElement(ReviewNote,{preset:'بيانات الإعلان غير مكتملة.',choices:['الإعلان مكرر.']}));
 assert.match(html,/aria-pressed="true"/);assert.match(html,/الإعلان مكرر/);
 const actions=renderToStaticMarkup(createElement(DecisionButtons,{value:'APPROVED',onChange:()=>{}}));
 assert.equal((actions.match(/type="button"/g)??[]).length,2);assert.doesNotMatch(actions,/<select/);
});
test('the inbox includes all review queues and missing counts are not fabricated',()=>{
 for(const q of adminQueues)assert.ok(isAdminDestination(q.destination));
 for(const destination of ['promotion-requests','market','service-prices','booking-reviews','account-deletions','maintenance'])assert.ok(adminQueues.some(q=>q.destination===destination));
 assert.equal(adminQueues.find(q=>q.label==='بلاغات ماركت مفتوحة')!.view,'REPORTS');
 assert.deepEqual(queueCounts(null),{});
 const counts=queueCounts({asOf:'2026-10-31T00:00:00Z',cards:[{label:'إعلانات ماركت تنتظر المراجعة',value:'2',destination:'market'},{label:'بلاغات ماركت مفتوحة',value:'3',destination:'market'},{label:'شحن ينتظر المراجعة',value:'bad',destination:'reviews'}]});
 assert.deepEqual(counts,{market:5});
});
test('branch inspection is restricted to one explicit authenticated admin GET path',()=>{
 const id='11111111-1111-4111-8111-111111111111',path=`admin/gyms/${id}/branches/${id}/services`;
 assert.equal(allowedAdminPath('GET',path),true);assert.equal(allowedAdminPath('PATCH',path),false);assert.equal(allowedAdminPath('GET',path.replace(id,'invalid')),false);
});
