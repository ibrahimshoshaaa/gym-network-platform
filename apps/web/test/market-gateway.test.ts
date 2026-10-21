import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath} from '../lib/security';
test('market gateway admits only explicit UUID routes and image uploads',()=>{
 const id='86d076a7-7827-4013-a6f9-a32f94e0131b';
 for(const path of ['market/options','market/listings','market/mine',`market/listings/${id}`,'admin/market/listings','admin/market/reports'])assert.equal(allowedPath('GET',path),true,path);
 for(const path of ['market/listings','market/assets',`market/listings/${id}/status`,`market/listings/${id}/report`,`market/assets/${id}/remove`,`admin/market/listings/${id}/review`,`admin/market/reports/${id}/resolve`])assert.equal(allowedPath('POST',path),true,path);
 assert.equal(allowedPath('PATCH',`market/listings/${id}`),true);
 for(const path of ['market/listings/not-an-id','market/assets/all','market/listings/../users'])assert.equal(allowedPath('GET',path),false);
 assert.equal(allowedPath('DELETE',`market/listings/${id}`),false);
});
