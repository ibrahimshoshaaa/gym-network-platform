import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';
export const bookingSchedulerAudience = 'https://gym-network-platform.vercel.app/api/internal/bookings/process-due';
const issuer = 'https://token.actions.githubusercontent.com';
const repository = 'ibrahimshoshaaa/gym-network-platform';
type SigningKey = JsonWebKey & {kid?: string; alg?: string; use?: string};
let cached: {keys: SigningKey[]; at: number} | undefined;
let inflight: Promise<SigningKey[]> | undefined;
async function githubKeys(): Promise<SigningKey[]> {
  if (cached && Date.now() - cached.at < 60000) return cached.keys;
  if (!inflight) inflight = (async () => {
    const response = await fetch(`${issuer}/.well-known/jwks`, {cache:'no-store', redirect:'error', signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('OIDC key provider unavailable');
    const data = await response.json() as {keys?: SigningKey[]};
    if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error('Invalid OIDC keys');
    cached = {keys:data.keys, at:Date.now()};
    return data.keys;
  })().finally(() => {inflight = undefined;});
  return inflight;
}
/** Only this production workflow may invoke the no-show worker. Never trust a caller's user/session. */
export async function verifyBookingScheduler(authorization: string | null, loadKeys = githubKeys, now = Date.now() / 1000): Promise<boolean> {
  try {
    if (!authorization?.startsWith('Bearer ')) return false;
    const token = authorization.slice(7);
    if (token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
    const [headerPart, payloadPart, signaturePart] = token.split('.') as [string,string,string];
    const header = JSON.parse(Buffer.from(headerPart,'base64url').toString()) as Record<string,unknown>;
    const claims = JSON.parse(Buffer.from(payloadPart,'base64url').toString()) as Record<string,unknown>;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200 || header.crit !== undefined || (header.typ !== undefined && header.typ !== 'JWT')) return false;
    if (claims.iss !== issuer || claims.aud !== bookingSchedulerAudience || claims.repository !== repository || claims.repository_id !== '1422702031' || claims.repository_owner_id !== '306580103' || claims.ref !== 'refs/heads/main' || claims.workflow_ref !== `${repository}/.github/workflows/booking-expiry.yml@refs/heads/main` || !['schedule','workflow_dispatch','push'].includes(String(claims.event_name))) return false;
    if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp <= now || typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat > now + 30 || claims.iat < now - 600 || claims.exp - claims.iat > 600 || typeof claims.nbf !== 'number' || !Number.isFinite(claims.nbf) || claims.nbf > now + 30) return false;
    const key = (await loadKeys()).find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256') && (!k.use || k.use === 'sig'));
    if (!key) return false;
    return verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({key,format:'jwk'}), Buffer.from(signaturePart,'base64url'));
  } catch {return false;}
}
