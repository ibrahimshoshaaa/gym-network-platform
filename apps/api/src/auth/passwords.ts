import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.js';

// OWASP scrypt profile: N=2^15, r=8, p=3 (32 MiB per operation).
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = 'scrypt-v1';
let active = 0;
async function derive(password: string, salt: Buffer): Promise<Buffer> {
  // Bound simultaneous KDF work even when requests arrive from many IPs.
  if (active >= 4) throw new DomainError('AUTH_BUSY');
  active++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, 64, options, (error, hash) => error ? reject(error) : resolve(hash));
    });
  } finally { active--; }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `${prefix}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Unknown, disabled and passwordless identities still perform one KDF. This
// fixed dummy value is never an accepted credential and is not a login bypass.
const dummyHash = `${prefix}$${'00'.repeat(16)}$${'00'.repeat(64)}`;
export async function verifyPassword(password: string, stored?: string | null) {
  const candidate = stored ?? dummyHash;
  const match = /^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(candidate);
  const validEncoding = Boolean(match);
  const parts = match ?? /^scrypt-v1\$([0-9a-f]{32})\$([0-9a-f]{128})$/.exec(dummyHash)!;
  const actual = await derive(password, Buffer.from(parts[1]!, 'hex'));
  return timingSafeEqual(actual, Buffer.from(parts[2]!, 'hex')) && validEncoding && Boolean(stored);
}
