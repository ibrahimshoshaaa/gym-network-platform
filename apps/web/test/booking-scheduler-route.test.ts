import test from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../app/api/internal/bookings/process-due/route';
test('scheduler rejects cookies, ordinary bearer tokens and query secrets before opening the database',async()=>{
  const cases: Record<string,string>[] = [{},{cookie:'gym_session=synthetic'},{authorization:'Bearer '+ 'a'.repeat(43)}];
  for(const headers of cases){
    const response=await POST(new Request('https://example.test/api/internal/bookings/process-due?actorId=admin&token=synthetic',{method:'POST',headers}));
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
