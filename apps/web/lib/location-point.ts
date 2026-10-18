export type LocationPoint = { latitude: number; longitude: number };
export function locationPoint(latitude: unknown, longitude: unknown): LocationPoint | null {
  if (![latitude, longitude].every(value => (typeof value === "string" && value.trim() !== "") || typeof value === "number")) return null;
  const lat = Number(latitude), lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: Number(lat.toFixed(7)), longitude: Number(lng.toFixed(7)) };
}
export function requiredLocation(latitude: unknown, longitude: unknown) {
  const point = locationPoint(latitude, longitude);
  if (!point) throw new Error("حدد مكان الفرع من الخريطة أو استخدم موقعك الحالي أولًا.");
  return point;
}
