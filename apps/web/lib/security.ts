export class GatewayError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export function apiOrigin() {
  const value =
    process.env.API_INTERNAL_URL ??
    (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:4000");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayError("SERVICE_NOT_CONFIGURED", 503);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (process.env.NODE_ENV === "production" &&
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
  )
    throw new GatewayError("SERVICE_NOT_CONFIGURED", 503);
  return url.origin;
}
export function checkOrigin(request: Request) {
  const configured = process.env.WEB_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production")
    throw new GatewayError("SERVICE_NOT_CONFIGURED", 503);
  let expected: URL;
  try {
    expected = new URL(configured ?? request.url);
  } catch {
    throw new GatewayError("SERVICE_NOT_CONFIGURED", 503);
  }
  if (
    configured &&
    (expected.pathname !== "/" ||
      expected.search ||
      expected.hash ||
      expected.username ||
      expected.password ||
      !["http:", "https:"].includes(expected.protocol))
  )
    throw new GatewayError("SERVICE_NOT_CONFIGURED", 503);
  if (
    request.headers.get("origin") !== expected.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new GatewayError("ORIGIN_REJECTED", 403);
}
const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const rules: Record<string, RegExp[]> = {
  GET: [
    /^me\/access$/,
    /^admin\/topup-settings$/,
    /^admin\/topups$/,
    /^topup-options$/,
    /^topups$/,
    new RegExp(`^gyms/${uuid}/branches$`),
    new RegExp(`^receipts/${uuid}/access$`),
  ],
  POST: [
    /^admin\/pricing-policies$/,
    /^admin\/topup-packages$/,
    new RegExp(`^admin/topups/${uuid}/review$`),
    /^topup-quotes$/,
    /^topups$/,
    /^receipts$/,
    /^auth\/password\/change$/,
  ],
  PUT: [
    /^admin\/payment-methods\/(INSTAPAY|WALLET)$/,
    new RegExp(`^admin/topup-packages/${uuid}$`),
  ],
};
export function allowedPath(method: string, path: string) {
  return Boolean(rules[method]?.some((rule) => rule.test(path)));
}
export async function boundedBody(request: Request, max: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > max))
    throw new GatewayError("BODY_TOO_LARGE", 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(),
    parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > max) {
        await reader.cancel();
        throw new GatewayError("BODY_TOO_LARGE", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
