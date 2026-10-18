const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
export function invitationToken(hash: string) {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("invite");
  return token && tokenPattern.test(token) ? token : null;
}
export function invitationLink(origin: string, token: string) {
  const base = new URL(origin);
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || !tokenPattern.test(token)) throw new Error("Invalid invitation link");
  return `${base.origin}/#invite=${token}`;
}
