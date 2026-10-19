import { GatewayError } from "./security";
export function rememberChoice(value: unknown): boolean {
  if (value === undefined) return true; // Existing integrations retain their session policy.
  if (typeof value !== "boolean") throw new GatewayError("INVALID_INPUT", 400);
  return value;
}
export function sessionExpiry(expiresAt: string, remember: boolean) {
  const expires = new Date(expiresAt);
  if (!Number.isFinite(expires.getTime())) throw new GatewayError("ACCESS_DENIED", 403);
  return remember ? { expires } : {};
}
