// backend/src/lib/validate.js
import { z } from 'zod';

/**
 * Normalises an Indian phone number to +91XXXXXXXXXX.
 * Accepted inputs: 10 digits starting with 6-9, with or without +91 or 0 prefix,
 * with optional spaces, dashes, parentheses.
 * Returns normalised phone string or null if invalid.
 */
export function normalisePhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Strip spaces, dashes, dots, parentheses
  const cleaned = raw.replace(/[\s\-\.\(\)]/g, '');
  // Match +91 followed by 10 digits starting with 6-9
  if (/^\+91[6-9]\d{9}$/.test(cleaned)) return cleaned;
  // Match 91 followed by 10 digits starting with 6-9
  if (/^91[6-9]\d{9}$/.test(cleaned)) return `+${cleaned}`;
  // Match 0 followed by 10 digits starting with 6-9
  if (/^0[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned.slice(1)}`;
  // Match 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(cleaned)) return `+91${cleaned}`;
  return null;
}

export const normalizePhone = normalisePhone;

/**
 * Masks a normalised phone number for public or staff display.
 * E.g. "+919876543210" -> "+91 987•• ••210"
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '••••••••••';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 8) return '••••••••••';
  return `${clean.slice(0, 5)}•• ••${clean.slice(-3)}`;
}

/**
 * Sanitises patient display name: trimmed, 2-40 chars, removes control characters.
 */
export function sanitiseName(name, defaultFallback = 'Anonymous Patient') {
  if (!name || typeof name !== 'string') return defaultFallback;
  // Remove control characters (0x00 - 0x1F, 0x7F)
  const cleaned = name.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (cleaned.length < 2) return defaultFallback;
  return cleaned.slice(0, 40);
}

/**
 * Validates latitude and longitude values (§2.3)
 */
export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// ───────────── Zod Schemas ─────────────

export const phoneSchema = z.string().transform((val, ctx) => {
  const norm = normalisePhone(val);
  if (!norm) {
    ctx.addIssue({
      code: 'custom',
      message: 'Please enter a valid 10-digit Indian mobile number (starting with 6-9).',
    });
    return z.NEVER;
  }
  return norm;
});

export const deviceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, {
  message: 'Invalid deviceId format (8-64 alphanumeric, dash, or underscore chars).',
});

export const prioritySchema = z.enum(['none', 'senior', 'pregnant', 'disabled']).default('none');

export const coordsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
}).refine((c) => !(c.lat === 0 && c.lng === 0), {
  message: 'Coordinates cannot be (0, 0)',
});

export const pinSchema = z.string().regex(/^\d{4,8}$/, {
  message: 'PIN must be between 4 and 8 digits.',
});
