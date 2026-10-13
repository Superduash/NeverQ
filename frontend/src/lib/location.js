import { useSyncExternalStore, useCallback } from 'react';
import { DEMO_HOME, LOCATION_PRESETS, isValidCoord } from './geo.js';
import { storage } from './storage.js';

// Shared origin-location store so Map, Hospital and Ticket always agree.
// Kinds: demo | preset | saved | pin | gps
// Only 'gps', 'saved' and 'pin' are treated as a real origin for distances.

function initial() {
  const stored = storage.getLocation();
  if (stored && isValidCoord(stored)) return stored;
  return DEMO_HOME;
}

let current = initial();
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());

export function getOrigin() {
  return current;
}

export function setOrigin(loc) {
  if (!loc || !isValidCoord(loc)) return;
  current = loc;
  storage.setLocation(loc);
  emit();
}

export function locationKind(loc) {
  return loc?.type || (loc?.isDemo ? 'demo' : 'preset');
}

export function hasRealOrigin(loc) {
  const k = locationKind(loc);
  return k === 'gps' || k === 'saved' || k === 'pin';
}

export function originDistanceText(loc, km) {
  switch (locationKind(loc)) {
    case 'gps': return `${km} km away`;
    case 'saved': return `${km} km from your saved home`;
    case 'pin': return `${km} km from your pin`;
    default: return null;
  }
}

export function makeGpsLocation(lat, lng) {
  return { id: 'gps', type: 'gps', lat, lng, label: 'Your location', isGPS: true };
}

export function makePinLocation(lat, lng) {
  return { id: 'custom', type: 'pin', lat, lng, label: 'Custom pin' };
}

export function makeSavedHome(lat, lng) {
  return { id: 'saved_home', type: 'saved', lat, lng, label: 'Home', isSaved: true };
}

export function listPresets() {
  const saved = storage.getSavedHome();
  return saved ? [saved, ...LOCATION_PRESETS] : LOCATION_PRESETS;
}

export function useOrigin() {
  const origin = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
    () => current
  );
  const set = useCallback((loc) => setOrigin(loc), []);
  return [origin, set];
}

// Requests geolocation. Must be called from a user gesture.
export function requestGps({ timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 'UNSUPPORTED' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = makeGpsLocation(pos.coords.latitude, pos.coords.longitude);
        setOrigin(loc);
        resolve(loc);
      },
      (err) => reject({ code: err.code === 1 ? 'DENIED' : 'FAILED' }),
      { timeout, enableHighAccuracy: true }
    );
  });
}
