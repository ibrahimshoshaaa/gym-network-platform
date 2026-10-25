import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PhoneAuthPreview} from '../components/phone-auth-preview';
test('phone registration does not advertise or expose a fixed OTP before a server challenge',()=>{
 const html=renderToStaticMarkup(createElement(PhoneAuthPreview,{}));
 assert.match(html,/طلب كود التحقق/);assert.match(html,/SMS/);
 assert.doesNotMatch(html,/123456|طلب كود التجربة|تجربة بدون إرسال/);
});
