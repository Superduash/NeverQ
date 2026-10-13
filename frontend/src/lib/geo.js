// ───────────── Geo helpers & location presets ─────────────

export const TRAVEL_SPEEDS = {
  walk: 4.5,
  bike: 14.0,
  car: 22.0,
};

export const TRAVEL_MODES = [
  { value: 'walk', label: 'Walk' },
  { value: 'bike', label: 'Bike' },
  { value: 'car', label: 'Car' },
];

// Fallback origin used before the user picks or shares a location.
// It is a demo coordinate: never present a distance from it as "real".
export const DEMO_HOME = {
  id: 'demo',
  type: 'demo',
  lat: 13.045,
  lng: 80.245,
  label: 'Chennai demo area',
  isDemo: true,
};

export const LOCATION_PRESETS = [
  DEMO_HOME,
  { id: 'lakeside', type: 'preset', lat: 13.0368, lng: 80.2676, label: 'At Lakeside General' },
  { id: 'adyar', type: 'preset', lat: 13.0067, lng: 80.257, label: 'At Adyar Riverside' },
];

export const isValidCoord = (loc) =>
  !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);

// Great-circle distance between two points in km
export function haversine(from, to) {
  if (!isValidCoord(from) || !isValidCoord(to)) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

// Estimate travel minutes and road distance (approximate)
export function estimateTravel(from, to, mode = 'car', rushFactor = 1.0) {
  const straightKm = haversine(from, to);
  const roadKm = straightKm * 1.35;
  const speed = TRAVEL_SPEEDS[mode] || TRAVEL_SPEEDS.car;
  const minutes = Math.max(1, Math.round((roadKm / speed) * 60 * rushFactor));
  return { minutes, km: Number(roadKm.toFixed(1)), source: 'estimate' };
}

export function directionsUrl(from, to, mode = 'car') {
  const travelmode = mode === 'walk' ? 'walking' : mode === 'bike' ? 'bicycling' : 'driving';
  const dest = `${to.lat},${to.lng}`;
  const origin = isValidCoord(from) && !from.isDemo ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin}&travelmode=${travelmode}`;
}
