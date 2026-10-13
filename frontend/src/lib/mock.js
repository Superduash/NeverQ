/**
 * Backward-compatibility shim for lib/mock.js
 * Pages that haven't been fully migrated still import from here.
 * New code should import directly from lib/storage.js, lib/geo.js, lib/constants.js.
 */

// Storage — re-export from new location
export { storage } from './storage.js';

// Geo — re-export from new location
export {
  DEMO_HOME,
  LOCATION_PRESETS,
  estimateTravel,
  haversine,
  isValidCoord,
  directionsUrl,
} from './geo.js';

// Wait status — re-export from constants
export { waitStatus, WAIT_THRESHOLDS } from './constants.js';

// Mock engine — still lives at lib/mock/engine.js
export { mockEngine, mockEmitter } from './mock/engine.js';

// DEFAULT_SAVED_HOME: replaced by storage.getSavedHome() + makeSavedHome().
// Provide a fallback shape so old destructuring doesn't crash.
import { storage as _storage } from './storage.js';
import { DEMO_HOME as _DEMO_HOME } from './geo.js';

export const DEFAULT_SAVED_HOME = (() => {
  try {
    const saved = _storage.getSavedHome();
    return saved || { ..._DEMO_HOME, id: 'saved_home', type: 'saved', label: 'Home', isSaved: true };
  } catch {
    return { ..._DEMO_HOME, id: 'saved_home', type: 'saved', label: 'Home', isSaved: true };
  }
})();

// ALL_DEPARTMENTS: pages used this to build chip lists.
// Return the union of department names from the engine's seed orgs.
import { mockEngine as _engine } from './mock/engine.js';
export const ALL_DEPARTMENTS = (() => {
  try {
    const names = new Set();
    (_engine.db?.orgs || []).forEach((org) =>
      (org.departments || []).forEach((d) => names.add(d.name))
    );
    return ['All', ...names];
  } catch {
    return ['All', 'General OPD', 'Eye Clinic', 'Cardiology', 'Pharmacy', 'Orthopaedics'];
  }
})();
