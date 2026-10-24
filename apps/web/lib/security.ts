export class GatewayError extends Error {
  constructor(
    public code: string,
    public status: number,
  ) {
    super(code);
  }
}
export function apiHeaders(initial?: HeadersInit, token?: string) {
  const headers = new Headers(initial);
  if (token) headers.set('authorization', `Bearer ${token}`);
  // Transport credential is read only on the server. Never forward a caller's
  // claimed origin credential when this deployment has not configured one.
  headers.delete('x-gym-origin-secret');
  if (process.env.API_ORIGIN_SECRET) headers.set('x-gym-origin-secret', process.env.API_ORIGIN_SECRET);
  return headers;
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
    /^me\/account-deletion$/, /^admin\/account-deletions$/, new RegExp(`^admin/account-deletions/${uuid}$`),
    /^admin\/service-price-requests$/,
    new RegExp(`^directory/branches/${uuid}/services$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/services$`),
    new RegExp(`^promotions/branches/${uuid}/services$`),
    /^promotions\/(branches|requests)$/, new RegExp(`^promotions/requests/${uuid}$`), /^admin\/promotions\/requests$/, /^trainee\/nearby-promotions$/,
    /^maintenance\/(branches|requests)$/, new RegExp(`^maintenance/requests/${uuid}$`), /^admin\/maintenance\/requests$/,
    /^market\/(options|listings|mine)$/, new RegExp(`^market/listings/${uuid}$`), /^admin\/market\/(listings|reports)$/ ,
    new RegExp(`^branches/${uuid}/manage$`),
    /^booking-policy$/, /^admin\/booking-policy$/, /^trainee\/bookings$/, /^admin\/bookings\/review$/,
    /^campaigns$/, /^admin\/campaigns$/,
    new RegExp(`^gyms/${uuid}/delegations$`),
    new RegExp(`^operations/branches/${uuid}/entitlements$`),
    /^admin\/gym-applications$/,
    /^me\/gym-application$/,
    /^admin\/point-transfers$/,
    new RegExp(`^gyms/${uuid}/(?:point-wallet|point-transfers|inventory|stock-transfers)$`),
    /^disputes$/,
    new RegExp(`^gyms/${uuid}/images$`),
    /^notifications$/,
    /^home-summary$/,
    /^support\/(tickets|contact)$/,
    new RegExp(`^support/tickets/${uuid}$`),
    /^admin\/(users|wallet-expiry|audit)$/,
    /^trainee\/(?:wallet\/movements|active-visits)$/,
    /^directory\/branches$/,
    new RegExp(`^directory/branches/${uuid}$`),
    new RegExp(`^inventory/branches/${uuid}(?:/movements)?$`),
    /^reports\/(gyms|summary|rows|export)$/,
    /^reports\/platform-balances$/,
    new RegExp(`^reports/gyms/${uuid}/branches$`),
    /^admin\/withdrawal-calendar$/,
    /^admin\/withdrawals$/,
    new RegExp(`^(?:admin/)?gyms/${uuid}/service-charges$`),
    new RegExp(`^gyms/${uuid}/withdrawals$`),
    new RegExp(`^withdrawals/${uuid}$`),
    /^operations\/branches$/,
    /^(admin\/)?operation-reviews$/,
    new RegExp(`^admin/operation-reviews/${uuid}$`),
    /^trainee\/(wallet|visits)$/,
    new RegExp(`^operations/branches/${uuid}/(summary|sales|visits)$`),
    new RegExp(`^(admin/)?gyms/${uuid}/receivables$`),
    /^me\/access$/,
    /^gyms$/,
    /^admin\/gyms$/,
    /^admin\/price-change-requests$/,
    new RegExp(`^admin/gyms/${uuid}$`),
    new RegExp(`^admin/gyms/${uuid}/(branches|invitations)$`),
    new RegExp(`^gyms/${uuid}$`),
    new RegExp(`^gyms/${uuid}/(staff|invitations)$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/pricing-history$`),
    /^admin\/topup-settings$/,
    /^admin\/topups$/,
    /^topup-options$/,
    /^topups$/,
    new RegExp(`^gyms/${uuid}/branches$`),
    new RegExp(`^receipts/${uuid}/access$`),
  ],
  POST: [
    /^me\/account-deletion(?:\/cancel)?$/, new RegExp(`^admin/account-deletions/${uuid}/process$`),
    new RegExp(`^admin/service-price-requests/${uuid}/review$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/services$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/services/${uuid}/price-requests$`),
    /^promotions\/requests$/, new RegExp(`^promotions/requests/${uuid}/action$`), new RegExp(`^promotions/branches/${uuid}/assets$`), new RegExp(`^admin/promotions/requests/${uuid}/review$`), new RegExp(`^trainee/visits/${uuid}/rating$`),
    /^maintenance\/requests$/, new RegExp(`^maintenance/branches/${uuid}/assets$`), new RegExp(`^maintenance/requests/${uuid}/action$`), new RegExp(`^admin/maintenance/requests/${uuid}/action$`),
    /^market\/(listings|assets)$/, new RegExp(`^market/listings/${uuid}/(status|report)$`), new RegExp(`^market/assets/${uuid}/remove$`), new RegExp(`^admin/market/listings/${uuid}/review$`), new RegExp(`^admin/market/reports/${uuid}/resolve$`),
    /^trainee\/bookings$/, /^admin\/booking-policy$/, /^admin\/bookings\/process-due$/,
    new RegExp(`^trainee/bookings/${uuid}/(?:cancel|qr|check-in)$`),
    new RegExp(`^admin/bookings/${uuid}/decision$`),
    new RegExp(`^operations/branches/${uuid}/bookings/scan$`),
    new RegExp(`^operations/branches/${uuid}/entry-qr(?:/rotate)?$`),
    /^admin\/(campaigns|campaign-assets)$/,
    new RegExp(`^admin/gym-applications/${uuid}/review$`),
    /^me\/gym-application\/resubmit$/,
    /^admin\/point-transfers(?:\/(?:lookup|quotes))?$/,
    new RegExp(`^gyms/${uuid}/point-transfers(?:/(?:lookup|quotes))?$`),
    new RegExp(`^admin/gyms/${uuid}/branches/${uuid}/approve-setup$`),
    /^admin\/disputes$/,
    new RegExp(`^admin/disputes/${uuid}/release$`),
    new RegExp(`^gyms/${uuid}/images(?:/${uuid}/remove)?$`),
    /^notifications\/read$/,
    /^support\/tickets$/,
    new RegExp(`^support/tickets/${uuid}/(messages|status)$`),
    new RegExp(`^admin/users/${uuid}/recovery$`),
    new RegExp(`^gyms/${uuid}/stock-transfers$`),
    /^admin\/withdrawal-calendar$/,
    new RegExp(`^gyms/${uuid}/withdrawals$`),
    new RegExp(`^admin/withdrawals/${uuid}/(review|payment)$`),
    new RegExp(`^withdrawals/${uuid}/(cancel|feedback)$`),
    /^trainee\/qr$/,
    /^operation-reviews$/,
    new RegExp(`^admin/operation-reviews/${uuid}/review$`),
    new RegExp(`^operations/branches/${uuid}/visits/${uuid}/cancel$`),
    new RegExp(
      `^cashier/branches/${uuid}/(trainee-lookup|sale-quotes|sales|visit-previews|visits)$`,
    ),
    /^admin\/pricing-policies$/,
    /^admin\/gyms$/,
    new RegExp(`^admin/gyms/${uuid}/owner-invitations$`),
    new RegExp(`^admin/price-change-requests/${uuid}/review$`),
    new RegExp(`^gyms/${uuid}/branches$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/price-change-requests$`),
    new RegExp(`^gyms/${uuid}/staff-invitations$`),
    new RegExp(`^invitations/${uuid}/revoke$`),
    /^admin\/topup-packages$/,
    new RegExp(`^admin/topups/${uuid}/review$`),
    /^topup-quotes$/,
    /^topups$/,
    /^receipts$/,
    /^auth\/password\/change$/,
  ],
  PATCH: [
    new RegExp(`^gyms/${uuid}/branches/${uuid}/services/${uuid}/availability$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}/services/booking-hours$`),
    new RegExp(`^market/listings/${uuid}$`),
    /^me\/profile$/,
    new RegExp(`^admin/users/${uuid}/access$`),
    new RegExp(`^admin/gyms/${uuid}/status$`),
    new RegExp(`^admin/branches/${uuid}/status$`),
    new RegExp(`^gyms/${uuid}$`),
    new RegExp(`^gyms/${uuid}/branches/${uuid}$`),
    new RegExp(`^gyms/${uuid}/staff/${uuid}$`),
  ],
  PUT: [
    new RegExp(`^admin/campaigns/${uuid}$`),
    new RegExp(`^gyms/${uuid}/delegations$`),
    /^admin\/support-contact$/,
    /^admin\/payment-methods\/(INSTAPAY|WALLET)$/,
    new RegExp(`^admin/topup-packages/${uuid}$`),
  ],
};
export function allowedPath(method: string, path: string) {
  return Boolean(rules[method]?.some((rule) => rule.test(path)));
}
export async function boundedBody(
  request: Pick<Request, "headers" | "body">,
  max: number,
) {
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


