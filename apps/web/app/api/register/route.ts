import { trustedClientAddress } from "../../../lib/client-address";
import { cookies } from "next/headers";
import { boundedBody, checkOrigin, GatewayError } from "../../../lib/security";
import { cookieName, cookieOptions, failure, json, upstream } from "../../../lib/gateway";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new GatewayError("INVALID_INPUT", 400);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8192))); }
    catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError("INVALID_INPUT", 400);
    }
    const fields = ["displayName", "phone", "email", "password"];
    if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).some(key => !fields.includes(key)) ||
      fields.some(key => typeof (input as Record<string, unknown>)[key] !== "string"))
      throw new GatewayError("INVALID_INPUT", 400);
    const response = await upstream("auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, undefined, trustedClientAddress(request));
    const result = await response.json();
    if (!response.ok) return json({ code: result.code ?? "INVALID_INPUT" }, response.status);
    if (!result.accessToken || !result.user || result.user.role !== "TRAINEE")
      throw new GatewayError("ACCESS_DENIED", 403);
    (await cookies()).set(cookieName(), result.accessToken, {
      ...cookieOptions(), expires: new Date(result.expiresAt),
    });
    return json({ user: result.user }, 201);
  } catch (error) { return failure(error); }
}
