import assert from 'node:assert/strict';
import test from 'node:test';
import {pagePath} from '../lib/page-path';
test('explicit branch page size is sent once, avoiding API validation rejection',()=>{
 const url=pagePath('gyms/test/branches?limit=100');
 assert.equal(url,'gyms/test/branches?limit=100');
 assert.deepEqual(new URLSearchParams(url.split('?')[1]).getAll('limit'),['100']);
});
test('default pagination preserves filters and replaces the cursor safely',()=>{
 assert.equal(pagePath('gyms'),'gyms?limit=25');
 const p=new URLSearchParams(pagePath('records?status=ACTIVE&limit=50&cursor=old','new+cursor').split('?')[1]);
 assert.equal(p.get('status'),'ACTIVE');
 assert.deepEqual(p.getAll('limit'),['50']);
 assert.deepEqual(p.getAll('cursor'),['new+cursor']);
 assert.equal(pagePath('gyms?'),'gyms?limit=25');
});
