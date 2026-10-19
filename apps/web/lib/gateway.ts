import { sessionExpiry } from "./session-policy";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiOrigin, apiHeaders, GatewayError } from "./security";
export const cookieName = () =>
  process.env.NODE_ENV === "production" ? "__Host-gym_session" : "gym_session";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
});
export const rememberCookieName = () => process.env.NODE_ENV === "production" ? "__Host-gym_remember" : "gym_remember";
export async function setWebSession(token: string, expiresAt: string, remember = true) {
  const jar = await cookies();
  const options = { ...cookieOptions(), ...sessionExpiry(expiresAt, remember) };
  jar.set(cookieName(), token, options);
  jar.set(rememberCookieName(), remember ? "1" : "0", options);
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}
export function failure(error: unknown) {
  return error instanceof GatewayError
    ? json({ code: error.code }, error.status)
    : json({ code: "SERVICE_UNAVAILABLE" }, 503);
}
export async function upstream(
  path: string,
  init: RequestInit = {},
  token?: string,
  remoteAddress?: string,
) {
  try {
    if (process.env.GYM_EMBEDDED_API === "true") {
      const { internalRequest } = await import("@gym/api");
      const headers = Object.fromEntries(apiHeaders(init.headers, token));
      const body = init.body == null ? undefined : typeof init.body === "string"
        ? init.body
        : init.body instanceof Uint8Array ? init.body
        : new Uint8Array(await new Response(init.body).arrayBuffer());
      return await internalRequest(path, { method: init.method, headers, body, remoteAddress });
    }
    return await fetch(`${apiOrigin()}/${path}`, {
      ...init,
      headers: apiHeaders(init.headers, token),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    if (e instanceof GatewayError) throw e;
    throw new GatewayError("SERVICE_UNAVAILABLE", 503);
  }
}
export async function sessionToken() {
  return (await cookies()).get(cookieName())?.value;
}
export async function currentUser() {
  const token = await sessionToken();
  if (!token) return null;
  const result = await upstream("me", {}, token);
  if (result.status === 401 || result.status === 403) return null;
  if (!result.ok) throw new GatewayError("SERVICE_UNAVAILABLE", 503);
  return (await result.json()) as {
    id: string;
    displayName: string;
    role: string;
    email: string;
    phone: string;
  };
}

