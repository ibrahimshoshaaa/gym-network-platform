import test from 'node:test';
import assert from 'node:assert/strict';
import {phonePreviewEnabled} from '../src/auth/phone-preview.js';
test('fixed OTP is disabled by default and production needs an additional explicit opt-in',()=>{
 assert.equal(phonePreviewEnabled({}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'test'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',VERCEL_ENV:'preview'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',VERCEL_ENV:'production'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',VERCEL_ENV:'production',GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION:'true'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION:'true'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',VERCEL_ENV:'production',GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION:'false'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'sms',VERCEL_ENV:'preview',GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION:'true'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_ALLOW_TEST_OTP_IN_PRODUCTION:'true',VERCEL_ENV:'production'}),false);
});
