import { cookies } from "next/headers";
import { checkOrigin } from "../../../lib/security";
import {
  cookieName,
  cookieOptions,
  failure,
  json,
  sessionToken,
  upstream,
} from "../../../lib/gateway";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const token = await sessionToken();
    if (token) {
      const response = await upstream("auth/logout", { method: "POST" }, token);
      if (!response.ok && response.status !== 401)
        return json({ code: "SERVICE_UNAVAILABLE" }, 503);
    }
    (await cookies()).set(cookieName(), "", { ...cookieOptions(), maxAge: 0 });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
