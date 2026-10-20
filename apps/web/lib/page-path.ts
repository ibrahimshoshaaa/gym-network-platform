/** Preserve caller filters and page size; pagination parameters must be singular. */
export function pagePath(path: string, cursor?: string) {
  const split = path.indexOf("?");
  const pathname = split < 0 ? path : path.slice(0, split);
  const params = new URLSearchParams(split < 0 ? "" : path.slice(split + 1));
  params.set("limit", params.get("limit") ?? "25");
  if (cursor) params.set("cursor", cursor);
  return `${pathname}?${params}`;
}
