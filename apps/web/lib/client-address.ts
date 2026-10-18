import { isIP } from "node:net";

// Only Vercel's ingress-owned value is trusted. Local and external API
// deployments must not accept a client-supplied forwarding header.
// https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
export function trustedClientAddress(request: Request, vercel = process.env.VERCEL) {
  if (vercel !== "1") return undefined;
  const address = request.headers.get("x-vercel-forwarded-for")?.trim();
  return address && isIP(address) ? address : undefined;
}
