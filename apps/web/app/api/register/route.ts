import { trustedClientAddress } from "../../../lib/client-address";
import { boundedBody, checkOrigin, GatewayError } from "../../../lib/security";
import { setWebSession, failure, json, upstream } from "../../../lib/gateway";

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
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new GatewayError("INVALID_INPUT", 400);
    const data = input as Record<string, unknown>;
    const owner = data.accountType === "owner";
    if (data.accountType !== undefined && !owner) throw new GatewayError("INVALID_INPUT", 400);
    const fields = ["displayName", "phone", "email", "password", ...(owner ? ["gymName", "description", "governorate", "city", "address"] : [])];
    if (Object.keys(data).some(key => key !== "accountType" && !fields.includes(key)) ||
      fields.some(key => typeof data[key] !== "string")) throw new GatewayError("INVALID_INPUT", 400);
    const response = await upstream(owner ? "auth/owners/register" : "auth/register", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fields.map(key => [key, data[key]]))),
    }, undefined, trustedClientAddress(request));
    const result = await response.json();
    if (!response.ok) return json({ code: result.code ?? "INVALID_INPUT" }, response.status);
    if (!result.accessToken || !result.user || result.user.role !== (owner ? "GYM_OWNER" : "TRAINEE"))
      throw new GatewayError("ACCESS_DENIED", 403);
    await setWebSession(result.accessToken, result.expiresAt);
    return json({ user: result.user }, 201);
  } catch (error) { return failure(error); }
}

