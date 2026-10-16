import { cookies } from "next/headers";
import { boundedBody, checkOrigin, GatewayError } from "../../../lib/security";
import {
  cookieName,
  cookieOptions,
  currentUser,
  failure,
  json,
  upstream,
} from "../../../lib/gateway";
export const runtime = "nodejs";
export async function GET() {
  try {
    const user = await currentUser();
    return user ? json({ user }) : json({ code: "UNAUTHENTICATED" }, 401);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new GatewayError("INVALID_INPUT", 400);
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(
        new TextDecoder().decode(await boundedBody(request, 8192)),
      );
    } catch (e) {
      if (e instanceof GatewayError) throw e;
      throw new GatewayError("INVALID_INPUT", 400);
    }
    if (
      !input ||
      typeof input !== "object" ||
      !["admin", "staff", "invite"].includes(String(input.mode))
    )
      throw new GatewayError("INVALID_INPUT", 400);
    const route =
      input.mode === "invite"
        ? "auth/invitations/accept"
        : `auth/${input.mode}/login`;
    const body =
      input.mode === "invite"
        ? { token: input.token, password: input.password }
        : { identifier: input.identifier, password: input.password };
    const response = await upstream(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      return json(
        { code: result.code ?? "INVALID_CREDENTIALS" },
        response.status,
      );
    if (!result.accessToken || !result.user)
      throw new GatewayError("ACCESS_DENIED", 403);
    (await cookies()).set(cookieName(), result.accessToken, {
      ...cookieOptions(),
      expires: new Date(result.expiresAt),
    });
    return json({ user: result.user });
  } catch (e) {
    return failure(e);
  }
}
