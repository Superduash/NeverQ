// backend/src/lib/ids.js
import crypto from 'node:crypto';

/**
 * Generate a public unguessable ticket token: 16 random bytes base64url (22 chars).
 */
export function generateTicketToken() {
  return crypto.randomBytes(16).toString('base64url');
}

/**
 * Format a human-readable display label.
 * E.g., deptCode 'G', seq 15 -> 'G-015'
 * Urgent: seq 4 -> 'URG-004'
 */
export function formatTicketLabel(deptCode, seq, isUrgent = false) {
  const padded = String(seq).padStart(3, '0');
  if (isUrgent) {
    return `URG-${padded}`;
  }
  return `${deptCode.toUpperCase()}-${padded}`;
}

/**
 * Generate a slug or random ID for resources.
 */
export function generateId(prefix = 'id') {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
}
