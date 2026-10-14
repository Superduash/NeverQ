// ───────────── On-device storage (no accounts) ─────────────

const read = (store, key, fallback = null) => {
  try {
    const raw = store.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const write = (store, key, value) => {
  try {
    if (value === null || value === undefined) store.removeItem(key);
    else store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};

const DEFAULT_SETTINGS = {
  textSize: 'normal', // 'normal' | 'large'
  assistantEnabled: true,
  vibration: true,
  voiceAlerts: true,
};

export const storage = {
  // Anonymous device id
  getDeviceId() {
    try {
      let id = localStorage.getItem('nq-device-id');
      if (!id) {
        id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `dev-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
        localStorage.setItem('nq-device-id', id);
      }
      return id;
    } catch {
      return 'dev-ephemeral';
    }
  },

  // Active ticket
  getActiveTicket: () => read(localStorage, 'nq-ticket'),
  setActiveTicket: (ticket) => {
    write(localStorage, 'nq-ticket', ticket);
    window.dispatchEvent(new Event('nq-ticket-changed'));
  },

  // Saved + recent hospitals
  getSavedOrgs: () => read(localStorage, 'nq-saved-orgs', []),
  toggleSavedOrg(orgId) {
    const saved = storage.getSavedOrgs();
    const next = saved.includes(orgId) ? saved.filter((id) => id !== orgId) : [...saved, orgId];
    write(localStorage, 'nq-saved-orgs', next);
    return next;
  },
  getRecentOrgs: () => read(localStorage, 'nq-recent-orgs', []),
  addRecentOrg(orgId) {
    const next = [orgId, ...storage.getRecentOrgs().filter((id) => id !== orgId)].slice(0, 5);
    write(localStorage, 'nq-recent-orgs', next);
    return next;
  },

  // Origin location (session only; GPS fixes are never persisted)
  getLocation: () => read(sessionStorage, 'nq-location'),
  setLocation: (loc) => write(sessionStorage, 'nq-location', loc),

  // Last-used location preset id (e.g. 'demo', 'saved_home', 'lakeside', 'gps')
  // persisted in localStorage so the map re-opens at the same origin
  getLastLocationPreset: () => {
    try { return localStorage.getItem('nq-last-preset') || null; } catch { return null; }
  },
  setLastLocationPreset: (id) => {
    try {
      if (id) localStorage.setItem('nq-last-preset', id);
      else localStorage.removeItem('nq-last-preset');
    } catch { /* ignore */ }
  },

  // Preferred travel mode ('car' | 'bike' | 'walk')
  getTravelMode: () => {
    try { return localStorage.getItem('nq-travel-mode') || 'car'; } catch { return 'car'; }
  },
  setTravelMode: (mode) => {
    try { localStorage.setItem('nq-travel-mode', mode); } catch { /* ignore */ }
  },

  // User-chosen Home (explicitly saved by the user on this device)
  getSavedHome: () => read(localStorage, 'nq-saved-home'),
  setSavedHome: (home) => write(localStorage, 'nq-saved-home', home),

  // Theme: 'light' | 'dark' | 'system'
  getTheme() {
    try {
      const t = localStorage.getItem('nq-theme');
      return t === 'dark' || t === 'system' ? t : 'light';
    } catch {
      return 'light';
    }
  },
  setTheme(theme) {
    try {
      localStorage.setItem('nq-theme', theme);
    } catch {
      /* ignore */
    }
  },

  // Optional guest profile for form prefill (stays on this device)
  getGuestProfile: () => read(localStorage, 'nq-guest-profile'),
  setGuestProfile: (profile) => write(localStorage, 'nq-guest-profile', profile),

  // Settings
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...(read(localStorage, 'nq-settings', {}) || {}) }),
  setSettings(patch) {
    const next = { ...storage.getSettings(), ...patch };
    write(localStorage, 'nq-settings', next);
    window.dispatchEvent(new Event('nq-settings-changed'));
    return next;
  },

  // One-time dismissals
  isDismissed: (key) => !!read(localStorage, `nq-dismissed-${key}`, false),
  dismiss: (key) => write(localStorage, `nq-dismissed-${key}`, true),
  undismiss: (key) => write(localStorage, `nq-dismissed-${key}`, null),

  // Clear everything stored by the app on this device (keeps mock DB intact)
  clearAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('nq-') && !k.startsWith('nq-mock-db'))
        .forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith('nq-'))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event('nq-ticket-changed'));
    window.dispatchEvent(new Event('nq-settings-changed'));
  },
};
