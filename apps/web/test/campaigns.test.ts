import assert from 'node:assert/strict';
import test from 'node:test';
import {allowedPath} from '../lib/security';
import {roleTabs,adminSectionFor} from '../lib/navigation';
test('campaign routes are explicit and management stays in the platform owner workspace',()=>{
 assert.ok(allowedPath('GET','campaigns'));assert.ok(allowedPath('GET','admin/campaigns'));assert.ok(allowedPath('POST','admin/campaign-assets'));
 const id='12345678-1234-4234-8234-123456789012';assert.ok(allowedPath('PUT',`admin/campaigns/${id}`));assert.equal(allowedPath('DELETE',`admin/campaigns/${id}`),false);assert.equal(allowedPath('PUT','admin/campaigns/not-an-id'),false);
 assert.ok(roleTabs.PLATFORM_ADMIN?.includes('campaigns'));for(const role of ['GYM_OWNER','BRANCH_MANAGER','CASHIER'])assert.ok(!Object.hasOwn(roleTabs,role));assert.equal(adminSectionFor('campaigns').id,'communication');
});
