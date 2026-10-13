// NeverQ Standard Message Catalogue & Error Code Mapping
// Per Phase B.2, NeverQ2 §9, §3.6, §4.5

export const ERROR_MESSAGES = {
  DUPLICATE_TICKET: 'You already have an active ticket for this hospital.',
  COOLDOWN: 'Remote joining paused (24h cooldown due to repeated no-shows). Walk-ins still accepted.',
  REMOTE_CAP: 'Remote queue capacity reached for this department. Please visit in person.',
  RATE_LIMIT: 'Too many requests. Please wait a moment before trying again.',
  OUT_OF_RANGE: 'You appear to be more than 300m away from the hospital.',
  NOT_FOUND: 'Ticket or resource not found.',
  INVALID_PIN: 'Invalid staff PIN. Please check and try again.',
  INVALID_PASSWORD: 'Incorrect admin password.',
  ALREADY_CALLED: 'Already called by another counter.',
  HOSPITAL_CLOSED: 'This hospital is currently closed.',
  REMOTE_DISABLED: 'Remote joining is currently disabled for this hospital.',
  COUNTER_NOT_OPEN: 'Cannot call tickets while counter is paused or closed.',
  NO_ARRIVED_TICKETS: 'No arrived patients waiting in queue.',
  NETWORK_ERROR: 'Unable to connect to server. Check your connection.',
  LOCATION_DENIED: 'Location permission was denied. Please pick a preset or choose on map.',
  LOCATION_TIMEOUT: 'Location request timed out. Please pick a preset or choose on map.',
  // F-24: missing codes added
  COUNTER_BUSY: 'This counter is currently serving a patient.',
  PHONE_BLOCKED: 'Joining is not available from this phone number.',
  INVALID_STATE: 'This action cannot be performed in the current ticket state.',
  INVALID_COORDS: 'Invalid or missing location coordinates.',
  INVALID_MODE: 'Invalid travel mode specified.',
  VALIDATION_ERROR: 'One or more fields are invalid. Please review and try again.',
  INTERNAL: 'An internal server error occurred. Please try again.',
  REQUEST_FAILED: 'Request failed. Please try again.',
  DEFAULT: 'An unexpected error occurred. Please try again.',
};

export const NOTIFICATION_MESSAGES = {
  // Customer & Location Outcomes
  TICKET_CREATED: (token) => `Ticket #${token} created successfully`,
  TICKET_CANCELLED: 'Ticket cancelled successfully',
  ARRIVED_SUCCESS: 'Arrival confirmed! You are now eligible to be called.',
  SAVED_ORG: (name) => `Saved ${name}`,
  UNSAVED_ORG: (name) => `Removed ${name} from saved`,
  LOCATION_SET: 'Origin location updated',
  LOCATION_DENIED: 'Location permission denied. Please pick a preset or map pin.',
  LOCATION_TIMEOUT: 'Location request timed out. Using fallback preset.',
  LINK_COPIED: 'Link copied to clipboard',
  ALERTS_ENABLED: 'Alerts unlocked: sound, vibration, and voice ready.',
  
  // Staff Actions
  TICKET_CALLED: (label, counter) => `Called ${label} to ${counter}`,
  CONSULTATION_STARTED: (label) => `Consultation started for ${label}`,
  CONSULTATION_DONE: (label) => `Consultation completed for ${label}`,
  TICKET_SKIPPED: (label) => `Skipped ${label}`,
  TICKET_REMOVED: (label) => `Removed ${label} from queue`,
  ARRIVAL_CONFIRMED: (label) => `Arrival confirmed for ${label}`,
  WALKIN_ADDED: (label) => `Walk-in added: #${label}`,
  URGENT_INSERTED: (label) => `Urgent case inserted: #${label}`,
  DELAY_SET: (min) => `Doctor delay set: +${min} min`,
  DELAY_CLEARED: 'Doctor delay cleared',
  COUNTER_STATE_CHANGED: (name, state) => `${name} is now ${state}`,
  
  // Admin & Demo Director
  HOSPITAL_CREATED: (name) => `Hospital "${name}" created`,
  HOSPITAL_UPDATED: (name) => `Hospital "${name}" updated`,
  DEMO_RESET: 'Demo data reset to initial seed state',
  DEMO_SIMULATED: (count, dept) => `Simulated ${count} patient(s) in ${dept}`,
  DEMO_FAST_FORWARD: (min) => `Demo clock advanced by +${min} minutes`,
  DEMO_RUSH_HOUR: (factor) => `Rush hour factor set to ×${factor}`,
  
  // System, Offline & PWA
  ONLINE: 'Back online',
  OFFLINE: 'Offline mode: showing cached queue data',
  RECONNECTING: 'Reconnecting to live queue updates...',
  RECONNECTED: 'Reconnected to live queue server',
  STALE_DATA: 'Queue data may be outdated. Reconnecting...',
  UPDATE_AVAILABLE: 'New update available. Reload to update.',
  PWA_INSTALLED: 'NeverQ installed successfully. Works offline.',
  BURST_SYNC: (count) => `Synced ${count} live queue updates`,
};

export function getErrorMessage(codeOrError) {
  if (!codeOrError) return ERROR_MESSAGES.DEFAULT;
  if (typeof codeOrError === 'string') {
    return ERROR_MESSAGES[codeOrError] || codeOrError;
  }
  if (codeOrError.code && ERROR_MESSAGES[codeOrError.code]) {
    return ERROR_MESSAGES[codeOrError.code];
  }
  return codeOrError.message || ERROR_MESSAGES.DEFAULT;
}
