// Anchor server deadlines to a monotonic client clock. Starting the anchor
// before the request conservatively subtracts request time and avoids a wrong
// device wall clock making a session/wallet appear valid for longer.
export function deadlineAt(
  expiresAt: string | null,
  serverTime: string,
  started: number,
) {
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt),
    server = Date.parse(serverTime);
  return Number.isFinite(end) &&
    Number.isFinite(server) &&
    Number.isFinite(started)
    ? started + Math.max(0, end - server)
    : null;
}
export const secondsLeft = (deadline: number | null, now: number) =>
  deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
export function duration(seconds: number) {
  const n = Math.max(0, Math.floor(seconds)),
    h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = n % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}
