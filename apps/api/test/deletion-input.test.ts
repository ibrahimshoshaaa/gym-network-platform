import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deletionInput,publicDeletionInput} from '../src/accounts/deletion.js';

test('authenticated deletion normalizes phone confirmation and still requires literal DELETE',()=>{
 const body={phone:'٠١٠٥٥٥٥٠١٢٣',confirmation:'DELETE',requestKey:randomUUID()};
 const result=deletionInput.parse(body);assert.ok('phone' in result);assert.equal(result.phone,'+201055550123');
 for(const invalid of [{...body,confirmation:'delete'},{...body,confirmation:undefined},{...body,phone:'wrong'},{...body,userId:randomUUID()}])assert.equal(deletionInput.safeParse(invalid).success,false);
});
test('public deletion cannot substitute phone confirmation for a password',()=>{
 assert.equal(publicDeletionInput.safeParse({identifier:'01055550123',phone:'01055550123',confirmation:'DELETE',requestKey:randomUUID()}).success,false);
});
test('previous mobile clients keep their password confirmation contract',()=>{
 assert.equal(deletionInput.safeParse({currentPassword:'old client password',confirmation:'DELETE',requestKey:randomUUID()}).success,true);
 assert.equal(deletionInput.safeParse({phone:'01055550123',currentPassword:'ambiguous',confirmation:'DELETE',requestKey:randomUUID()}).success,false);
});
