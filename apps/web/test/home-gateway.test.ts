import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath} from '../lib/security';
import {roleTabs,adminSectionFor} from '../lib/navigation';
test('promotion review and verified-visit ratings use explicit scoped routes',()=>{
 const id='86d076a7-7827-4013-a6f9-a32f94e0131b';
 for(const p of ['promotions/branches','promotions/requests',`promotions/requests/${id}`,'admin/promotions/requests','trainee/nearby-promotions'])assert.equal(allowedPath('GET',p),true,p);
 for(const p of ['promotions/requests',`promotions/requests/${id}/action`,`promotions/branches/${id}/assets`,`admin/promotions/requests/${id}/review`,`trainee/visits/${id}/rating`])assert.equal(allowedPath('POST',p),true,p);
 for(const p of ['trainee/visits/all/rating',`trainee/branches/${id}/rating`,`promotions/requests/${id}/publish`])assert.equal(allowedPath('POST',p),false,p);
 assert.equal(roleTabs.PLATFORM_ADMIN?.includes('promotion-requests'),true);assert.equal(adminSectionFor('promotion-requests').id,'services');
});
