import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WhatsappVerification, type WhatsappPhase} from '../components/whatsapp-verification';

test('WhatsApp states explain sending, expiry and SMS fallback without claiming a proof', () => {
 for (const phase of ['unavailable','ready','waiting','expired','verified','error'] as WhatsappPhase[]) {
  const html = renderToStaticMarkup(createElement(WhatsappVerification,{phase,phone:'+201055550123',onSms:()=>{}}));
  assert.match(html,/\+201055550123/);
  assert.equal(html.includes('تم تأكيد رقمك'),phase==='verified');
  if (phase !== 'verified') assert.match(html,/التحقق برسالة SMS/);
  assert.doesNotMatch(html,/href=|123456|accessToken/);
 }
 const waiting = renderToStaticMarkup(createElement(WhatsappVerification,{phase:'waiting',phone:'01055550123'}));
 assert.match(waiting,/فتح المحادثة لوحده مش بيأكد الرقم/);
 assert.match(waiting,/disabled/);
});
