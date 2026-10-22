import { DomainError } from '../domain/errors.js';

// Location is an additional presence check, not proof against a compromised device.
export const checkInRadiusMeters = 150;
export const maxLocationAgeMs = 60000;
export const maxLocationAccuracyMeters = 50;
export type Presence = { latitude: number; longitude: number; accuracy: number; capturedAt: string; isMocked: false };
export function validatePresence(location: Presence, branch: { latitude: number; longitude: number }, now: Date) {
  const age = now.getTime() - new Date(location.capturedAt).getTime();
  if (!Number.isFinite(age) || age < -10000 || age > maxLocationAgeMs) throw new DomainError('LOCATION_STALE');
  if (location.isMocked !== false || !Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > maxLocationAccuracyMeters) throw new DomainError('LOCATION_INACCURATE');
  if (![location.latitude, location.longitude, branch.latitude, branch.longitude].every(Number.isFinite) || Math.abs(location.latitude) > 90 || Math.abs(branch.latitude) > 90 || Math.abs(location.longitude) > 180 || Math.abs(branch.longitude) > 180) throw new DomainError('INVALID_INPUT');
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(location.latitude - branch.latitude), dLon = radians(location.longitude - branch.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(branch.latitude)) * Math.cos(radians(location.latitude)) * Math.sin(dLon / 2) ** 2;
  const distance = 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
  if (distance > checkInRadiusMeters) throw new DomainError('GO_TO_BRANCH');
  return Math.round(distance);
}
