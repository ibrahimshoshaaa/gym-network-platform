export function branchMap(latitude: string, longitude: string) {
  const lat = Number(latitude),
    lng = Number(longitude);
  if (
    !latitude.trim() ||
    !longitude.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}
export const branchPhone = (phone: string | null) =>
  phone && /^\+[1-9]\d{7,14}$/.test(phone) ? `tel:${phone}` : null;

export function branchDirections(latitude: string, longitude: string) {
  if (!branchMap(latitude, longitude)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(latitude)},${Number(longitude)}`;
}
