import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath} from '../lib/security';
import {roleTabs,adminSectionFor} from '../lib/navigation';
test('maintenance has bounded branch/request routes and only the platform web dashboard destination',()=>{
 const id='86d076a7-7827-4013-a6f9-a32f94e0131b';
 for(const path of ['maintenance/branches','maintenance/requests',`maintenance/requests/${id}`,'admin/maintenance/requests'])assert.equal(allowedPath('GET',path),true,path);
 for(const path of ['maintenance/requests',`maintenance/requests/${id}/action`,`maintenance/branches/${id}/assets`,`admin/maintenance/requests/${id}/action`])assert.equal(allowedPath('POST',path),true,path);
 for(const path of ['maintenance/requests/all','maintenance/branches/not-an-id/assets',`maintenance/requests/${id}/complete`])assert.equal(allowedPath('POST',path),false);
 assert.equal(allowedPath('PATCH',`maintenance/requests/${id}`),false);
 assert.equal(roleTabs.PLATFORM_ADMIN?.includes('maintenance'),true);
 for(const role of ['GYM_OWNER','BRANCH_MANAGER','CASHIER','TRAINEE'])assert.equal(roleTabs[role]?.includes('maintenance'),false);
 assert.equal(adminSectionFor('maintenance').id,'requests');
});
