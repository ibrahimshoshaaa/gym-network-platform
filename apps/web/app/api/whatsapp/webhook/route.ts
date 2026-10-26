import {boundedBody, GatewayError} from '../../../../lib/security';
import {failure, upstream} from '../../../../lib/gateway';
export const runtime = 'nodejs';

// Meta calls this route directly. No browser origin or session is required;
// verification and raw-body signature checks belong to the backend.
export async function GET(r: Request) {
  try {
    const query = new URL(r.url).search;
    if (query.length > 2048) throw new GatewayError('INVALID_INPUT', 400);
    const result = await upstream('webhooks/whatsapp' + query);
    return new Response(await result.text(), {status: result.status, headers: {
      'Content-Type': result.headers.get('content-type') ?? 'text/plain', 'Cache-Control': 'no-store',
    }});
  } catch (e) { return failure(e); }
}
export async function POST(r: Request) {
  try {
    if (!r.headers.get('content-type')?.startsWith('application/json')) throw new GatewayError('INVALID_INPUT', 400);
    const body = await boundedBody(r, 65536);
    const result = await upstream('webhooks/whatsapp', {method: 'POST', headers: {
      'content-type': 'application/json', 'x-hub-signature-256': r.headers.get('x-hub-signature-256') ?? '',
    }, body: body as BodyInit});
    return new Response(await result.text(), {status: result.status, headers: {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    }});
  } catch (e) { return failure(e); }
}
