// ───────────── NeverQ Mock Adapter & Helpers ─────────────

export const WAIT_THRESHOLDS = {
  good: 15,
  bad: 40,
};

export const DEMO_HOME = {
  id: 'demo',
  lat: 13.0450,
  lng: 80.2450,
  label: 'Chennai demo area',
  type: 'demo',
  isDemo: true,
};

export const DEFAULT_SAVED_HOME = {
  id: 'saved_home',
  lat: 13.0450,
  lng: 80.2450,
  label: 'Saved Home',
  type: 'saved',
  isSaved: true,
};

export const LOCATION_PRESETS = [
  DEMO_HOME,
  DEFAULT_SAVED_HOME,
  {
    id: 'lakeside',
    lat: 13.0368,
    lng: 80.2676,
    label: 'At Lakeside General',
    type: 'preset',
  },
  {
    id: 'adyar',
    lat: 13.0067,
    lng: 80.2570,
    label: 'At Adyar Riverside',
    type: 'preset',
  },
];

// Fictional hospitals (Chennai coordinates for realistic routing & layout)
export const MOCK_HOSPITALS = [
  {
    id: 'org-lakeside',
    name: 'Marina Lakeside Medical Centre',
    demo: true,
    address: 'Demo address · Mylapore, Chennai',
    area: 'Mylapore',
    hours: 'Open 24 hours',
    lat: 13.0368,
    lng: 80.2676,
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        countersOpen: 4,
        countersTotal: 6,
        waitingCount: 14,
        eta: { low: 20, mid: 25, high: 32 },
        confidence: 'High confidence · Steady flow',
      },
      {
        id: 'eye',
        name: 'Eye Clinic',
        countersOpen: 1,
        countersTotal: 2,
        waitingCount: 22,
        eta: { low: 42, mid: 48, high: 58 }, // Nearest to Home, but SLOWEST for Eye Clinic!
        confidence: 'Medium confidence · Single specialist on duty',
      },
      {
        id: 'cardio',
        name: 'Cardiology',
        countersOpen: 2,
        countersTotal: 3,
        waitingCount: 8,
        eta: { low: 35, mid: 42, high: 50 },
        confidence: 'High confidence · Active triage',
      },
      {
        id: 'pharm',
        name: 'Pharmacy',
        countersOpen: 3,
        countersTotal: 4,
        waitingCount: 5,
        eta: { low: 5, mid: 8, high: 12 },
        confidence: 'High confidence · Fast turnaround',
      },
    ],
  },
  {
    id: 'org-annanagar',
    name: 'Anna Nagar Care Institute',
    demo: true,
    address: 'Demo address · Anna Nagar, Chennai',
    area: 'Anna Nagar',
    hours: 'Open 07:00 – 22:00',
    lat: 13.0850,
    lng: 80.2101,
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        countersOpen: 5,
        countersTotal: 6,
        waitingCount: 6,
        eta: { low: 8, mid: 11, high: 14 },
        confidence: 'High confidence · Multiple counters active',
      },
      {
        id: 'eye',
        name: 'Eye Clinic',
        countersOpen: 3,
        countersTotal: 3,
        waitingCount: 3,
        eta: { low: 7, mid: 9, high: 13 }, // Farther from Home, but FASTEST for Eye Clinic!
        confidence: 'High confidence · 3 doctors available',
      },
      {
        id: 'ortho',
        name: 'Orthopaedics',
        countersOpen: 2,
        countersTotal: 3,
        waitingCount: 16,
        eta: { low: 28, mid: 34, high: 42 },
        confidence: 'Medium confidence · X-ray queue active',
      },
      {
        id: 'pharm',
        name: 'Pharmacy',
        countersOpen: 2,
        countersTotal: 3,
        waitingCount: 9,
        eta: { low: 10, mid: 14, high: 18 },
        confidence: 'High confidence · Normal volume',
      },
    ],
  },
  {
    id: 'org-adyar',
    name: 'Adyar Riverside Hospital',
    demo: true,
    address: 'Demo address · Adyar, Chennai',
    area: 'Adyar',
    hours: 'Open 24 hours',
    lat: 13.0067,
    lng: 80.2570,
    departments: [
      {
        id: 'gen',
        name: 'General OPD',
        countersOpen: 3,
        countersTotal: 5,
        waitingCount: 28,
        eta: { low: 40, mid: 48, high: 55 },
        confidence: 'Lower confidence · Shift handover in progress',
      },
      {
        id: 'cardio',
        name: 'Cardiology',
        countersOpen: 2,
        countersTotal: 2,
        waitingCount: 12,
        eta: { low: 25, mid: 30, high: 38 },
        confidence: 'High confidence · Dedicated emergency line',
      },
      {
        id: 'ortho',
        name: 'Orthopaedics',
        countersOpen: 2,
        countersTotal: 2,
        waitingCount: 7,
        eta: { low: 18, mid: 22, high: 28 },
        confidence: 'High confidence · On schedule',
      },
      {
        id: 'pharm',
        name: 'Pharmacy',
        countersOpen: 2,
        countersTotal: 4,
        waitingCount: 14,
        eta: { low: 12, mid: 16, high: 22 },
        confidence: 'Medium confidence · High demand',
      },
    ],
  },
];

// Union of all department names across hospitals
export const ALL_DEPARTMENTS = [
  'All',
  ...Array.from(
    new Set(
      MOCK_HOSPITALS.flatMap((h) => h.departments.map((d) => d.name))
    )
  ),
];

// Travel speed constants (km/h)
export const TRAVEL_SPEEDS = {
  walk: 4.5,
  bike: 14.0,
  car: 22.0,
};

// Great-circle distance between two points in km
export function haversine(from, to) {
  if (!from || !to) return 0;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

// Estimate travel minutes and road distance
export function estimateTravel(from, to, mode = 'car', rushFactor = 1.0) {
  const straightKm = haversine(from, to);
  const detourFactor = 1.35;
  const roadKm = straightKm * detourFactor;
  const speed = TRAVEL_SPEEDS[mode] || TRAVEL_SPEEDS.car;
  const rawHours = roadKm / speed;
  const minutes = Math.max(1, Math.round(rawHours * 60 * rushFactor));
  return {
    minutes,
    km: Number(roadKm.toFixed(1)),
    source: 'estimate',
  };
}

export function waitStatus(midMinutes) {
  if (midMinutes < WAIT_THRESHOLDS.good) return 'good';
  if (midMinutes > WAIT_THRESHOLDS.bad) return 'bad';
  return 'mid';
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Deep clone mock data to simulate independent live state
let liveHospitals = JSON.parse(JSON.stringify(MOCK_HOSPITALS));

// Mock API facade
export const mockApi = {
  async listOrgs({ lat, lng, dept } = {}) {
    await delay(150 + Math.random() * 200);
    const origin = lat && lng ? { lat, lng } : DEMO_HOME;

    return liveHospitals.map((h) => {
      // Find matching department or default to first/general
      const targetDept =
        dept && dept !== 'All'
          ? h.departments.find((d) => d.name === dept)
          : h.departments.find((d) => d.name === 'General OPD') || h.departments[0];

      return {
        ...h,
        selectedDepartment: targetDept || h.departments[0],
      };
    });
  },

  async getOrg(id) {
    await delay(150 + Math.random() * 150);
    const org = liveHospitals.find((h) => h.id === id);
    if (!org) {
      throw { status: 404, message: 'Hospital not found' };
    }
    return JSON.parse(JSON.stringify(org));
  },

  // Simulate jittering wait times every few seconds for live subscription
  subscribe(cb) {
    const interval = setInterval(() => {
      liveHospitals = liveHospitals.map((h) => ({
        ...h,
        departments: h.departments.map((d) => {
          // Subtle realistic jitter of +/- 1-2 min
          const jitter = Math.floor(Math.random() * 3) - 1;
          const newMid = Math.max(3, d.eta.mid + jitter);
          const delta = d.eta.high - d.eta.low;
          return {
            ...d,
            eta: {
              low: Math.max(2, newMid - Math.floor(delta / 2)),
              mid: newMid,
              high: newMid + Math.ceil(delta / 2),
            },
          };
        }),
      }));
      cb({ hospitals: JSON.parse(JSON.stringify(liveHospitals)), timestamp: Date.now() });
    }, 4500);

    return () => clearInterval(interval);
  },
};

// ───────────── Local Storage Helpers ─────────────
export const storage = {
  getDeviceId() {
    try {
      let id = localStorage.getItem('nq-device-id');
      if (!id) {
        id = 'dev-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
        localStorage.setItem('nq-device-id', id);
      }
      return id;
    } catch {
      return 'dev-ephemeral';
    }
  },

  getActiveTicket() {
    try {
      const raw = localStorage.getItem('nq-ticket');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setActiveTicket(ticket) {
    try {
      if (ticket) {
        localStorage.setItem('nq-ticket', JSON.stringify(ticket));
      } else {
        localStorage.removeItem('nq-ticket');
      }
    } catch {}
  },

  getSavedOrgs() {
    try {
      const raw = localStorage.getItem('nq-saved-orgs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  toggleSavedOrg(orgId) {
    try {
      const saved = storage.getSavedOrgs();
      const next = saved.includes(orgId)
        ? saved.filter((id) => id !== orgId)
        : [...saved, orgId];
      localStorage.setItem('nq-saved-orgs', JSON.stringify(next));
      return next;
    } catch {
      return [];
    }
  },

  getRecentOrgs() {
    try {
      const raw = localStorage.getItem('nq-recent-orgs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  addRecentOrg(orgId) {
    try {
      const recent = storage.getRecentOrgs().filter((id) => id !== orgId);
      const next = [orgId, ...recent].slice(0, 5);
      localStorage.setItem('nq-recent-orgs', JSON.stringify(next));
      return next;
    } catch {
      return [];
    }
  },

  getLastLocationPreset() {
    try {
      return sessionStorage.getItem('nq-loc-preset') || 'demo';
    } catch {
      return 'demo';
    }
  },

  setLastLocationPreset(presetId) {
    try {
      sessionStorage.setItem('nq-loc-preset', presetId);
    } catch {}
  },

  getSavedHome() {
    try {
      const raw = localStorage.getItem('nq-saved-home');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setSavedHome(home) {
    try {
      if (home) {
        localStorage.setItem('nq-saved-home', JSON.stringify(home));
      } else {
        localStorage.removeItem('nq-saved-home');
      }
    } catch {}
  },

  getTheme() {
    try {
      const t = localStorage.getItem('nq-theme');
      return t === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  },

  setTheme(theme) {
    try {
      localStorage.setItem('nq-theme', theme === 'dark' ? 'dark' : 'light');
    } catch {}
  },
};
