import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPath,checkOrigin} from '../lib/security';
test('deletion routes expose only scoped self actions and explicit admin processing',()=>{
 const id='86d076a7-7827-4013-a6f9-a32f94e0131b';
 for(const path of ['me/account-deletion','admin/account-deletions',`admin/account-deletions/${id}`])assert.equal(allowedPath('GET',path),true);
 for(const path of ['me/account-deletion','me/account-deletion/cancel',`admin/account-deletions/${id}/process`])assert.equal(allowedPath('POST',path),true);
 for(const path of ['me/account-deletion/all','auth/account-deletion','admin/account-deletions/process',`admin/account-deletions/${id}/force`])assert.equal(allowedPath('POST',path),false);
 assert.equal(allowedPath('DELETE',`admin/users/${id}`),false);
 assert.throws(()=>checkOrigin(new Request('http://localhost/delete-account',{method:'POST',headers:{origin:'https://attacker.example'}})));
});
