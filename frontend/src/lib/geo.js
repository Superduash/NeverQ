// ───────────── Geo helpers & location presets ─────────────
import {
  TRAVEL_MODEL,
  TRAVEL_SPEEDS,
  haversine,
  estimateTravel,
} from './travelModel.js';

export {
  TRAVEL_MODEL,
  TRAVEL_SPEEDS,
  haversine,
  estimateTravel,
};

export const TRAVEL_MODES = [
  { value: 'walk', label: 'Walk' },
  { value: 'bike', label: 'Cycle' }, // D-1: bicycle
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
  // F-06: coords match seed data
  { id: 'harbour', type: 'preset', lat: 13.0338, lng: 80.2676, label: 'At Harbour Care Clinic' },
  { id: 'lakeside', type: 'preset', lat: 13.0850, lng: 80.2101, label: 'At Lakeside General' },
  { id: 'metro', type: 'preset', lat: 13.0067, lng: 80.2570, label: 'At Metro Mercy' },
];

export const isValidCoord = (loc) =>
  !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng);

export const isNearbyHospital = (from, hospital, thresholdKm = 0.30) => {
  if (!isValidCoord(from) || !isValidCoord(hospital)) return false;
  return haversine(from, hospital) <= thresholdKm;
};

export function directionsUrl(from, to, mode = 'car') {
  const travelmode = mode === 'walk' ? 'walking' : mode === 'bike' ? 'bicycling' : 'driving';
  const dest = `${to.lat},${to.lng}`;
  const origin = isValidCoord(from) ? `&origin=${from.lat},${from.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${origin}&travelmode=${travelmode}`;
}
