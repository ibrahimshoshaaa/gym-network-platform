import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {verifyBookingScheduler, bookingSchedulerAudience} from '../lib/booking-scheduler-auth';
const {privateKey,publicKey} = generateKeyPairSync('rsa',{modulusLength:2048});
const now = 1800000000;
const claims = {iss:'https://token.actions.githubusercontent.com',aud:bookingSchedulerAudience,repository:'ibrahimshoshaaa/gym-network-platform',repository_id:'1422702031',repository_owner_id:'306580103',ref:'refs/heads/main',workflow_ref:'ibrahimshoshaaa/gym-network-platform/.github/workflows/booking-expiry.yml@refs/heads/main',event_name:'schedule',exp:now+300,iat:now,nbf:now};
const keys = async () => [{...publicKey.export({format:'jwk'}),kid:'test',alg:'RS256',use:'sig'}];
function token(patch:Record<string,unknown>={}, header:Record<string,unknown>={}) {
  const encode = (x:unknown) => Buffer.from(JSON.stringify(x)).toString('base64url');
  const data = `${encode({alg:'RS256',kid:'test',typ:'JWT',...header})}.${encode({...claims,...patch})}`;
  return `Bearer ${data}.${sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url')}`;
}
test('only the signed production booking workflow identity is authorized',async () => {
  assert.equal(await verifyBookingScheduler(token(),keys,now),true);
  for (const patch of [{aud:'elsewhere'},{iss:'https://attacker.test'},{repository_id:'1'},{repository_owner_id:'1'},{repository:'fork/gym'},{ref:'refs/heads/develop'},{workflow_ref:claims.workflow_ref.replace('booking-expiry','other')},{event_name:'pull_request'},{exp:now},{nbf:now+90},{iat:now-900},{exp:now+3600}]) {
    assert.equal(await verifyBookingScheduler(token(patch),keys,now),false,JSON.stringify(patch));
  }
  for (const header of [{alg:'none'},{alg:'HS256'},{kid:'wrong'},{crit:['custom']}]) assert.equal(await verifyBookingScheduler(token({},header),keys,now),false);
  const forged = token().split('.'); forged[1] = Buffer.from(JSON.stringify({...claims,exp:now+301})).toString('base64url');
  assert.equal(await verifyBookingScheduler(forged.join('.'),keys,now),false);
  assert.equal(await verifyBookingScheduler(token(),async()=>{throw Error('unavailable');},now),false);
});
test('missing and malformed credentials fail without fetching keys',async () => {
  let requests=0; const loader = async()=>{requests++;return [];};
  for(const auth of [null,'Bearer undefined','Bearer a.b.c','Bearer '+ 'a'.repeat(17000),'Basic abc']) assert.equal(await verifyBookingScheduler(auth,loader,now),false);
  assert.equal(requests,0);
});
