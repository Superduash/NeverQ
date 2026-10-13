// ───────────── Config ─────────────
export const WAIT_THRESHOLDS = { good: 15, bad: 40 }; // minutes: <15 good, >40 bad, otherwise mid

// Demo map area. NOT the user's real location.
export const DEMO_CENTER = { lat: 13.05, lng: 80.235, label: 'Chennai demo area' };

export const DEPARTMENTS = ['General', 'Cardiology', 'Pediatrics', 'Orthopedics', 'Laboratory'];

// Rough average door-to-door speeds (km/h) used for ESTIMATES only.
export const TRAVEL_MODES = [
  { id: 'walk', label: 'Walk', kmh: 5 },
  { id: 'bike', label: 'Bike', kmh: 14 },
  { id: 'drive', label: 'Drive', kmh: 24 },
  { id: 'transit', label: 'Transit', kmh: 17 },
];
const DETOUR_FACTOR = 1.3; // straight line → rough road distance

// ───────────── Mock data (FICTIONAL DEMO DATA) ─────────────
// Hospitals, waits and counters are invented. Coordinates are real Chennai neighbourhoods.
export const HOSPITALS = [
  {
    id: 'marina',
    name: 'Marina Lakeside Medical Centre',
    area: 'Mylapore',
    address: 'Demo address · Mylapore, Chennai',
    hours: 'Open 24 hours',
    lat: 13.0368,
    lng: 80.2676,
    depts: {
      General: { min: 22, max: 32, open: 4, total: 6 },
      Cardiology: { min: 40, max: 55, open: 2, total: 3 },
      Pediatrics: { min: 10, max: 18, open: 2, total: 3 },
      Laboratory: { min: 5, max: 10, open: 3, total: 4 },
    },
  },
  {
    id: 'annanagar',
    name: 'Anna Nagar Care Institute',
    area: 'Anna Nagar',
    address: 'Demo address · Anna Nagar, Chennai',
    hours: 'Open 7:00 – 22:00',
    lat: 13.085,
    lng: 80.2101,
    depts: {
      General: { min: 8, max: 14, open: 5, total: 6 },
      Pediatrics: { min: 12, max: 20, open: 2, total: 2 },
      Orthopedics: { min: 30, max: 45, open: 1, total: 2 },
      Laboratory: { min: 15, max: 25, open: 2, total: 3 },
    },
  },
  {
    id: 'adyar',
    name: 'Adyar Riverside Hospital',
    area: 'Adyar',
    address: 'Demo address · Adyar, Chennai',
    hours: 'Open 24 hours',
    lat: 13.0067,
    lng: 80.257,
    depts: {
      General: { min: 45, max: 60, open: 2, total: 5 },
      Cardiology: { min: 30, max: 40, open: 2, total: 2 },
      Pediatrics: { min: 35, max: 50, open: 1, total: 2 },
      Orthopedics: { min: 20, max: 30, open: 2, total: 3 },
      Laboratory: { min: 10, max: 15, open: 2, total: 3 },
    },
  },
];

// ───────────── Helpers ─────────────
export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function travelMinutes(km, modeId) {
  const mode = TRAVEL_MODES.find((m) => m.id === modeId) || TRAVEL_MODES[2];
  return Math.max(1, Math.round(((km * DETOUR_FACTOR) / mode.kmh) * 60));
}

export function waitStatus(avgMinutes) {
  if (avgMinutes < WAIT_THRESHOLDS.good) return 'good';
  if (avgMinutes > WAIT_THRESHOLDS.bad) return 'bad';
  return 'mid';
}

export const formatKm = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

// Wait + counters for a department; "All" shows General OPD waits with counters summed.
export function waitFor(hospital, dept) {
  if (dept === 'All') {
    const all = Object.values(hospital.depts);
    const g = hospital.depts.General;
    return {
      min: g.min,
      max: g.max,
      open: all.reduce((s, d) => s + d.open, 0),
      total: all.reduce((s, d) => s + d.total, 0),
      label: 'General OPD',
    };
  }
  return { ...hospital.depts[dept], label: dept };
}

// Search + department filter + sort, enriched with distance, travel and wait info.
export function getResults({ query, dept, sort, mode, origin }) {
  const q = query.trim().toLowerCase();
  return HOSPITALS.filter(
    (h) =>
      (dept === 'All' || h.depts[dept]) &&
      (!q || [h.name, h.area, ...Object.keys(h.depts)].join(' ').toLowerCase().includes(q))
  )
    .map((h) => {
      const km = haversineKm(origin, h);
      const travel = travelMinutes(km, mode);
      const wait = waitFor(h, dept);
      const avg = (wait.min + wait.max) / 2;
      return {
        ...h,
        km,
        travel,
        wait,
        status: waitStatus(avg),
        waitText: `${wait.min}–${wait.max} min`,
        waitShort: `${wait.min}–${wait.max}m`,
        total: travel + avg, // "Fastest" = estimated travel + wait
      };
    })
    .sort((a, b) => (sort === 'fastest' ? a.total - b.total : a.km - b.km));
}
