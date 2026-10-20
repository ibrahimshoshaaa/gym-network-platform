import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Login } from "../components/login";
import { TraineePortal } from "../components/trainee-portal";

test("public login has one sign-in path and offers trainee registration", () => {
  const html = renderToStaticMarkup(createElement(Login, { onLogin: () => {} }));
  assert.match(html, /إنشاء حساب/);
  assert.match(html, /name="identifier"/);
  assert.match(html, /name="password"/);
  assert.doesNotMatch(html, /login-mode|نوع الدخول|<select/);
});
test("trainee area has five personal destinations and no gym administration controls", () => {
  const html = renderToStaticMarkup(createElement(TraineePortal, {
    user: { id: "test", displayName: "متدرب اختبار", role: "TRAINEE", email: "test@example.test", phone: "+201500000000" },
    logout: async () => {}, loggingOut: false, onPassword: () => {}, error: "",
  }));
  const nav = html.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
  for (const label of ["الرئيسية", "الجيمات", "رمز الدخول", "زياراتي", "حسابي"]) assert.ok(nav.includes(label));
  assert.equal((nav.match(/<button/g) ?? []).length, 5);
  assert.doesNotMatch(html, /الكاشير والزيارات|شراء نقاط الفروع|إدارة المنصة/);
});


test('personal account groups profile, security, requests and help without operational controls',async()=>{
 const {PortalAccount}=await import('../components/portal-account');
 const html=renderToStaticMarkup(createElement(PortalAccount,{user:{id:'t',displayName:'متدرب',role:'TRAINEE',email:'test@example.test',phone:'+201500000000'},onPassword:()=>{},onPurchases:()=>{},onSupport:()=>{},logout:async()=>{},loggingOut:false}));
 assert.match(html,/بياناتك والأمان/);assert.match(html,/طلبات الشحن/);assert.match(html,/الدعم والمساعدة/);assert.doesNotMatch(html,/الفروع والموظفين/);
});
