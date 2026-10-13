/* ──────────────────────────────────────────────────────────────────────────
   NeverQ — MOCK adapter + helpers.
   Everything exported here that returns data is MOCK (tagged `mock: true`).
   Shapes follow the planned API contract:
   Org  { id, name, address, lat, lng, demo, mock, updatedAt,
          departments: [{ id, name, openCounters, waitingCount,
                          eta:{low,mid,high}, confidence:{level,label} }] }
   ────────────────────────────────────────────────────────────────────────── */

export const WAIT_THRESHOLDS = { good: 15, bad: 40 };

/** "good" (< good) | "mid" (good..bad) | "bad" (> bad) */
export function waitTone(minutes, thresholds = WAIT_THRESHOLDS) {
  if (minutes < thresholds.good) return "good";
  if (minutes > thresholds.bad) return "bad";
  return "mid";
}

export const DEMO_HOME = { lat: 13.0418, lng: 80.2341, label: "Home" }; // MOCK — Chennai area

export const CONFIDENCE = {
  high: "Based on live queue data",
  medium: "Based on recent averages",
  low: "Rough estimate — limited data",
};

const TRAVEL_SPEEDS_KMH = { walk: 4.5, bike: 14, car: 22 };
const DETOUR = 1.35;

export function haversine(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Approximate travel: straight-line × 1.35 ÷ speed. `rushFactor` scales time (default 1). */
export function estimateTravel(from, to, mode = "car", rushFactor = 1) {
  const km = haversine(from, to) * DETOUR;
  const speed = TRAVEL_SPEEDS_KMH[mode] || TRAVEL_SPEEDS_KMH.car;
  const minutes = Math.max(1, Math.round((km / speed) * 60 * rushFactor));
  return { minutes, km: Math.round(km * 10) / 10, source: "estimate" };
}

/* ───────────────────────── Seed data (MOCK) ───────────────────────── */

function dept(id, name, mid, openCounters, waitingCount, level) {
  return {
    id,
    name,
    openCounters,
    waitingCount,
    eta: etaFromMid(mid),
    confidence: { level, label: CONFIDENCE[level] },
  };
}
function etaFromMid(mid) {
  return { low: Math.max(2, Math.round(mid * 0.7)), mid, high: Math.round(mid * 1.35) + 1 };
}

const SEED = [
  {
    id: "lakeside-general",
    name: "Lakeside General",
    address: "14 Lake View Road, Nungambakkam, Chennai",
    lat: 13.0618,
    lng: 80.2491,
    departments: [
      dept("lg-opd", "General OPD", 22, 4, 18, "high"),
      dept("lg-eye", "Eye Clinic", 48, 1, 21, "medium"),
      dept("lg-card", "Cardiology", 35, 2, 12, "high"),
      dept("lg-pharm", "Pharmacy", 8, 3, 6, "high"),
    ],
  },
  {
    id: "riverbend-medical",
    name: "Riverbend Medical Centre",
    address: "62 Riverside Avenue, Adyar, Chennai",
    lat: 13.0068,
    lng: 80.2691,
    departments: [
      dept("rb-opd", "General OPD", 28, 3, 15, "high"),
      dept("rb-eye", "Eye Clinic", 24, 2, 9, "medium"),
      dept("rb-ortho", "Orthopaedics", 40, 2, 11, "medium"),
      dept("rb-pharm", "Pharmacy", 12, 2, 7, "high"),
      dept("rb-card", "Cardiology", 55, 1, 19, "low"),
    ],
  },
  {
    id: "coral-heights",
    name: "Coral Heights Hospital",
    address: "3 Coral Ridge Street, Anna Nagar, Chennai",
    lat: 13.0868,
    lng: 80.1841,
    departments: [
      dept("ch-eye", "Eye Clinic", 9, 3, 3, "high"),
      dept("ch-opd", "General OPD", 14, 5, 8, "high"),
      dept("ch-ortho", "Orthopaedics", 31, 2, 10, "medium"),
      dept("ch-card", "Cardiology", 18, 2, 5, "medium"),
    ],
  },
].map((o) => ({ ...o, demo: true, mock: true, updatedAt: Date.now() }));

export const DEMO_HOME_PRESET = { id: "home", label: "Home (~6 km away)", lat: DEMO_HOME.lat, lng: DEMO_HOME.lng, shortLabel: "Home" };

let state = clone(SEED);

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
function delay(min = 150, max = 400) {
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}
function notFound(what) {
  const e = new Error(`${what} not found`);
  e.status = 404;
  return e;
}

/* ───────────────────────── Storage helpers (all try/catch) ───────────────────────── */

const K = {
  device: "nq-device-id",
  ticket: "nq-active-ticket",
  saved: "nq-saved-orgs",
  recent: "nq-recent-orgs",
  searches: "nq-recent-searches",
  loc: "nq-last-location",
  theme: "nq-theme",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
function uuid() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const storage = {
  read,
  write,
  getDeviceId() {
    let id = read(K.device, null);
    if (!id || typeof id !== "string") {
      id = uuid();
      write(K.device, id);
    }
    return id;
  },
  /** { token, orgId, label, name } */
  getActiveTicket() {
    const t = read(K.ticket, null);
    return t && typeof t.token === "string" ? t : null;
  },
  setActiveTicket({ token, orgId, label, name }) {
    return write(K.ticket, { token, orgId, label, name });
  },
  clearActiveTicket() {
    remove(K.ticket);
  },
  getSaved() {
    const v = read(K.saved, []);
    return Array.isArray(v) ? v : [];
  },
  toggleSaved(orgId) {
    const cur = storage.getSaved();
    const next = cur.includes(orgId) ? cur.filter((x) => x !== orgId) : [orgId, ...cur];
    write(K.saved, next);
    return next;
  },
  getRecent() {
    const v = read(K.recent, []);
    return Array.isArray(v) ? v.slice(0, 5) : [];
  },
  pushRecent(orgId) {
    const next = [orgId, ...storage.getRecent().filter((x) => x !== orgId)].slice(0, 5);
    write(K.recent, next);
    return next;
  },
  getRecentSearches() {
    const v = read(K.searches, []);
    return Array.isArray(v) ? v.slice(0, 5) : [];
  },
  pushRecentSearch(item) {
    const next = [item, ...storage.getRecentSearches().filter((x) => !(x.type === item.type && x.label === item.label))].slice(0, 5);
    write(K.searches, next);
    return next;
  },
  clearRecentSearches() {
    remove(K.searches);
  },
  /** Never stores coordinates — only a preset id or the flag "map". */
  getLastLocation() {
    const v = read(K.loc, null);
    return typeof v === "string" ? v : null;
  },
  setLastLocation(flag) {
    if (flag == null) remove(K.loc);
    else write(K.loc, String(flag));
  },
  /** Raw string (not JSON) so the blocking script in index.html can read it directly. */
  getTheme() {
    try {
      const v = localStorage.getItem(K.theme);
      return v === "light" || v === "dark" ? v : "system";
    } catch {
      return "system";
    }
  },
  setTheme(v) {
    try {
      localStorage.setItem(K.theme, v);
    } catch {
      /* ignore */
    }
  },
};

/* ───────────────────────── Mock API ───────────────────────── */

const listeners = new Set();
let timer = null;

function jitterTick() {
  state = state.map((org) => ({
    ...org,
    updatedAt: Date.now(),
    departments: org.departments.map((d) => {
      if (Math.random() < 0.45) return d;
      const step = Math.round((Math.random() * 2 - 1) * 4) || 1;
      const mid = Math.min(75, Math.max(3, d.eta.mid + step));
      const waiting = Math.max(0, d.waitingCount + (step > 0 ? 1 : -1));
      return { ...d, waitingCount: waiting, eta: etaFromMid(mid) };
    }),
  }));
  const snapshot = clone(state);
  listeners.forEach((cb) => {
    try {
      cb(snapshot);
    } catch {
      /* listener errors never break the loop */
    }
  });
}

export const mockApi = {
  async listOrgs({ lat, lng, dept: deptName } = {}) {
    await delay();
    let orgs = clone(state);
    if (deptName && deptName !== "All") {
      orgs = orgs.filter((o) => o.departments.some((d) => d.name === deptName));
    }
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      orgs = orgs
        .map((o) => ({ ...o, distanceKm: Math.round(haversine({ lat, lng }, o) * 10) / 10 }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return orgs;
  },
  async getOrg(id) {
    await delay();
    const org = state.find((o) => o.id === id);
    if (!org) throw notFound("Hospital");
    return clone(org);
  },
  async getTicket(token) {
    await delay();
    const t = storage.getActiveTicket();
    if (!t || t.token !== token || t.endedAt) throw notFound("Ticket");
    return { ...t, status: "waiting", mock: true };
  },
  /** Simulated live updates (MOCK). Returns an unsubscribe function. */
  subscribe(cb) {
    listeners.add(cb);
    if (!timer) timer = setInterval(jitterTick, 4000);
    return () => {
      listeners.delete(cb);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  },
};
