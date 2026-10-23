import test from 'node:test';
import assert from 'node:assert/strict';
import {phonePreviewEnabled} from '../src/auth/phone-preview.js';
test('fixed OTP preview is explicit and cannot be enabled on a production deployment',()=>{
 assert.equal(phonePreviewEnabled({}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'test'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',VERCEL_ENV:'preview'}),true);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production',VERCEL_ENV:'production'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'test',NODE_ENV:'production'}),false);
 assert.equal(phonePreviewEnabled({GYMBANK_OTP_MODE:'sms',VERCEL_ENV:'preview'}),false);
});
