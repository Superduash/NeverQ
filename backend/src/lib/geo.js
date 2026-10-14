// backend/src/lib/geo.js
// Mirror of frontend geo / haversine calculations

const EARTH_RADIUS_KM = 6371;

/**
 * Calculates straight line distance in kilometres between two coordinates.
 */
export function haversine(coord1, coord2) {
  if (!coord1 || !coord2) return 0;
  const lat1 = Number(coord1.lat);
  const lon1 = Number(coord1.lng);
  const lat2 = Number(coord2.lat);
  const lon2 = Number(coord2.lng);

  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return 0;
  }

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Check if origin is within hospital arrival radius:
 * distanceM <= 300 + min(accuracy ?? 0, 100)
 */
export function isWithinArrivalRadius(origin, hospital, accuracyM = 0, baseRadiusM = 300, capM = 100) {
  const distKm = haversine(origin, hospital);
  const distM = distKm * 1000;
  const allowedM = baseRadiusM + Math.min(Math.max(0, Number(accuracyM) || 0), capM);
  return {
    within: distM <= allowedM,
    distanceM: Math.round(distM),
    allowedM,
  };
}
