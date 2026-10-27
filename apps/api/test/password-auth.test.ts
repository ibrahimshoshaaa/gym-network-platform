import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, verifyPassword } from '../src/auth/passwords.js';
import { loginSchema, registrationSchema, newPasswordSchema, normalizePhone } from '../src/auth/validation.js';

test('Egyptian phone formats and Arabic digits normalize to a single E.164 identity', () => {
  for (const phone of ['01012345678', '٠١٠١٢٣٤٥٦٧٨', '+20 10 1234 5678', '00201012345678']) assert.equal(normalizePhone(phone), '+201012345678');
  assert.equal(loginSchema.parse({ identifier: ' Person@Example.Test ', password: 'unchanged ' }).identifier, 'person@example.test');
});

test('registration rejects role/verification injection and validates contact/password formats', () => {
  const input = { displayName: 'Test Trainee', email: 'Person@Example.Test', phone: '01012345678', password: 'a sufficiently long passphrase' };
  const parsed = registrationSchema.parse(input);
  assert.equal(parsed.email, 'person@example.test');
  assert.equal(parsed.phone, '+201012345678');
  for (const extra of [{ role: 'PLATFORM_ADMIN' }, { emailVerifiedAt: new Date() }, { isActive: true }]) assert.equal(registrationSchema.safeParse({ ...input, ...extra }).success, false);
  for (const phone of ['abc', '010123', '+2001012345678', '+201912345678']) assert.equal(registrationSchema.safeParse({ ...input, phone }).success, false);
  assert.equal(registrationSchema.safeParse({ ...input, email: 'invalid-email' }).success, false);
  assert.equal(newPasswordSchema.safeParse('short').success, false);
  assert.equal(newPasswordSchema.safeParse('1234567').success, false);
  for(const password of ['12345678','abcdefgh','١٢٣٤٥٦٧٨','😀'.repeat(8)]){
    assert.equal(newPasswordSchema.parse(password),password);
    assert.equal(registrationSchema.safeParse({...input,password}).success,true);
  }
  assert.equal(newPasswordSchema.safeParse('a'.repeat(129)).success, false);
});

test('scrypt uses random salts and preserves Unicode, spaces and exact password equality', async () => {
  const password = '  كلمة مرور طويلة للتجربة 123  ';
  const first = await hashPassword(password), second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(first.includes(password), false);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password.trim(), first), false);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword(password, null), false);
  assert.equal(await verifyPassword(password, 'malformed stored value'), false);
});
