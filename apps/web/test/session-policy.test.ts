import test from "node:test";
import assert from "node:assert/strict";
import { rememberChoice, sessionExpiry } from "../lib/session-policy";
test("remember me produces session cookies unless chosen; malformed choices are rejected",()=>{
 const expiry="2030-01-01T00:00:00.000Z";
 assert.deepEqual(sessionExpiry(expiry,rememberChoice(false)),{});
 assert.equal(sessionExpiry(expiry,rememberChoice(true)).expires?.toISOString(),expiry);
 assert.equal(rememberChoice(undefined),true);
 for(const input of ["false",0,null,{}])assert.throws(()=>rememberChoice(input));
 assert.throws(()=>sessionExpiry("not-a-date",true));
});
