import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {GET, POST} from '../app/api/whatsapp/webhook/route';

test('Meta callback forwards exact bytes/signature without a browser session and bounds its body', async () => {
 const previous = {...process.env};
 const received: {url?:string; signature?:string|string[]; body:Buffer}[] = [];
 const server = createServer(async (req,res) => {
  const parts:Buffer[]=[];for await(const part of req) parts.push(Buffer.from(part));
  received.push({url:req.url,signature:req.headers['x-hub-signature-256'],body:Buffer.concat(parts)});
  res.writeHead(req.method==='GET'?200:503,{'content-type':req.method==='GET'?'text/plain':'application/json'});
  res.end(req.method==='GET'?'123456':'{"code":"WHATSAPP_UNAVAILABLE"}');
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 process.env.API_INTERNAL_URL=`http://127.0.0.1:${address.port}`;
 process.env.GYM_EMBEDDED_API='false';
 try {
  const q='?hub.mode=subscribe&hub.verify_token=test&hub.challenge=123456';
  const challenge=await GET(new Request('http://localhost/api/whatsapp/webhook'+q));
  assert.equal(await challenge.text(),'123456');assert.equal(challenge.status,200);
  assert.equal(received[0]?.url,'/webhooks/whatsapp'+q);
  const body='{ "text": "تأكيد" }\n';
  const result=await POST(new Request('http://localhost/api/whatsapp/webhook',{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':'sha256=signature'},body}));
  assert.equal(result.status,503);assert.equal((await result.json()).code,'WHATSAPP_UNAVAILABLE');
  assert.deepEqual(received[1]?.body,Buffer.from(body));assert.equal(received[1]?.signature,'sha256=signature');
  assert.equal(result.headers.get('cache-control'),'no-store');
  const oversized=await POST(new Request('http://localhost/api/whatsapp/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(65537)}));
  assert.equal(oversized.status,413);assert.equal(received.length,2);
 } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));process.env=previous; }
});
