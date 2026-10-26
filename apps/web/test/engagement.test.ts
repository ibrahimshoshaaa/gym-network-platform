import assert from 'node:assert/strict';
import test from 'node:test';
import {allowedPath} from '../lib/security';
import {decimal} from '../lib/client';
import {roleTabs} from '../lib/navigation';
const id='00000000-0000-4000-8000-000000000001';
test('support and account routes are explicit and cannot turn into arbitrary admin or reset paths',()=>{for(const path of ['notifications','home-summary','support/tickets','support/contact','admin/users','admin/audit','admin/wallet-expiry'])assert.ok(allowedPath('GET',path));assert.ok(allowedPath('POST',`support/tickets/${id}/messages`));assert.ok(allowedPath('POST',`admin/users/${id}/recovery`));assert.ok(allowedPath('PATCH',`admin/users/${id}/access`));for(const path of ['auth/recovery/complete','admin/users/delete','support/tickets/not-a-uuid/messages','support/tickets/../../admin'])assert.equal(allowedPath('POST',path),false);});
test('negative recorded adjustments format correctly without malformed fractional signs',()=>{assert.equal(decimal('-50'),'-0.5');assert.equal(decimal('-1234'),'-12.34');assert.equal(decimal('1234'),'12.34');});
