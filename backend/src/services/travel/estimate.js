// backend/src/services/travel/estimate.js
// Authoritative NeverQ travel estimation model (BackendQ.md §5.3)
// Pure function, identical to frontend/src/lib/travelModel.js

import { RULES } from '../../config/rules.js';

export const TRAVEL_MODEL = RULES.TRAVEL_MODEL || {
  walk: { speedKmh: 4.5,  roadFactor: 1.20, overheadMin: 0, rushShare: 0   },
  bike: { speedKmh: 14.0, roadFactor: 1.25, overheadMin: 1, rushShare: 0.5 },
  car:  { speedKmh: 22.0, roadFactor: 1.35, overheadMin: 4, rushShare: 1.0 },
};

export const TRAVEL_SPEEDS = {
  walk: TRAVEL_MODEL.walk.speedKmh,
  bike: TRAVEL_MODEL.bike.speedKmh,
  car:  TRAVEL_MODEL.car.speedKmh,
};

/**
 * Great-circle distance between two coordinates in kilometers using Earth radius R = 6371 km.
 */
export function haversine(from, to) {
  if (!from || !to) return 0;
  const lat1 = Number(from.lat);
  const lon1 = Number(from.lng);
  const lat2 = Number(to.lat);
  const lon2 = Number(to.lng);

  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return 0;
  }

  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

/**
 * Estimate travel time and road distance according to BackendQ.md §5.3 formula.
 *
 * @param {{ lat: number, lng: number }} from
 * @param {{ lat: number, lng: number }} to
 * @param {'walk'|'bike'|'car'} mode
 * @param {number} [rushFactor=1.0] - Server rush factor multiplier (1.0–3.0)
 * @returns {{ minutes: number, km: number, source: 'estimate', label: 'approx.', mode: string }}
 */
export function estimateTravel(from, to, mode = 'car', rushFactor = 1.0) {
  const m = TRAVEL_MODEL[mode] || TRAVEL_MODEL.car;
  const straightKm = haversine(from, to);

  // Same point invariant (T-TR-3): 1 min, 0.0 km
  if (straightKm === 0 || (from.lat === to.lat && from.lng === to.lng)) {
    return {
      minutes: 1,
      km: 0.0,
      source: 'estimate',
      label: 'approx.',
      mode,
    };
  }

  const roadKm = straightKm * m.roadFactor;
  const rush = Number(rushFactor) || 1.0;
  const rushEff = 1 + (rush - 1) * m.rushShare;
  const movingMin = (roadKm / m.speedKmh) * 60 * rushEff;
  const minutes = Math.max(1, Math.ceil(movingMin + m.overheadMin));
  const km = Number(roadKm.toFixed(1));

  return {
    minutes,
    km,
    source: 'estimate',
    label: 'approx.',
    mode,
  };
}
