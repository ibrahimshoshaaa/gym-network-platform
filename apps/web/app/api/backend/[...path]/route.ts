import { cookies } from "next/headers";
import {
  allowedPath,
  boundedBody,
  checkOrigin,
  GatewayError,
} from "../../../../lib/security";
import {
  cookieName,
  cookieOptions,
  failure,
  json,
  sessionToken,
  upstream,
} from "../../../../lib/gateway";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  try {
    const path = (await context.params).path.join("/");
    if (!allowedPath(request.method, path))
      return json({ code: "NOT_FOUND" }, 404);
    if (request.method !== "GET") checkOrigin(request);
    const token = await sessionToken();
    if (!token) return json({ code: "UNAUTHENTICATED" }, 401);
    const upload = path === "receipts",
      headers: Record<string, string> = {};
    let body: Uint8Array | undefined;
    if (request.method !== "GET") {
      const type = request.headers.get("content-type") ?? "";
      if (
        upload
          ? !["image/jpeg", "image/png", "image/webp"].includes(type)
          : !type.startsWith("application/json")
      )
        throw new GatewayError("INVALID_INPUT", 400);
      headers["content-type"] = type;
      body = await boundedBody(request, upload ? 5242880 : 8192);
      if (
        path === "topups" ||
        path === "operation-reviews" ||
        /^operations\/branches\/[^/]+\/visits\/[^/]+\/cancel$/.test(path) ||
        /^cashier\/branches\/[^/]+\/(sales|visits)$/.test(path)
      )
        headers["idempotency-key"] =
          request.headers.get("idempotency-key") ?? "";
    }
    const query = new URL(request.url).search;
    if (query.length > 1024) throw new GatewayError("INVALID_INPUT", 400);
    const response = await upstream(
      path + query,
      {
        method: request.method,
        headers,
        ...(body ? { body: Buffer.from(body) } : {}),
      },
      token,
    );
    const result = await response.json();
    if (path === "auth/password/change" && response.ok) {
      (await cookies()).set(cookieName(), result.accessToken, {
        ...cookieOptions(),
        expires: new Date(result.expiresAt),
      });
      return json({ user: result.user });
    }
    const output = json(result, response.status);
    const retry = response.headers.get("retry-after");
    if (retry) output.headers.set("Retry-After", retry);
    return output;
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle,
  POST = handle,
  PUT = handle,
  PATCH = handle;
