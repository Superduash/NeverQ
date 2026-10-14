// backend/src/middleware/auth.js
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { Org, Settings } from '../db/models/index.js';
import { AppError } from '../lib/errors.js';

let cachedTokenEpoch = 1;
let lastTokenEpochFetch = 0;

export async function getTokenEpoch() {
  const now = Date.now();
  if (now - lastTokenEpochFetch < 5000) {
    return cachedTokenEpoch;
  }
  try {
    const settings = await Settings.findById('global').lean();
    if (settings?.tokenEpoch !== undefined) {
      cachedTokenEpoch = settings.tokenEpoch;
    }
    lastTokenEpochFetch = now;
  } catch (_err) {
    // Return cached on error
  }
  return cachedTokenEpoch;
}

export function resetTokenEpochCache() {
  lastTokenEpochFetch = 0;
}

/**
 * Sign a staff JWT for an org.
 * Expiry: 12 h real time
 */
export async function signStaffToken(orgId, pinVersion = 1) {
  const tokenEpoch = await getTokenEpoch();
  return jwt.sign(
    { role: 'staff', orgId, pv: pinVersion, te: tokenEpoch },
    env.JWT_SECRET,
    { expiresIn: env.STAFF_JWT_EXPIRES_IN || '12h' }
  );
}

/**
 * Sign an admin JWT.
 * Expiry: 8 h real time
 */
export async function signAdminToken() {
  const tokenEpoch = await getTokenEpoch();
  return jwt.sign(
    { role: 'admin', te: tokenEpoch },
    env.JWT_SECRET,
    { expiresIn: env.ADMIN_JWT_EXPIRES_IN || '8h' }
  );
}

function extractBearerToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

/**
 * Require Staff Authentication Middleware (§3.3)
 * Verifies JWT signature, role === 'staff', tokenEpoch match, and pinVersion match.
 */
export async function requireStaff(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(new AppError('AUTH_REQUIRED', 401, 'Staff authentication required.'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (payload.role !== 'staff') {
      return next(new AppError('FORBIDDEN', 403, 'Staff access only.'));
    }

    // Verify tokenEpoch
    const currentEpoch = await getTokenEpoch();
    if (payload.te !== undefined && payload.te !== currentEpoch) {
      return next(new AppError('AUTH_REQUIRED', 401, 'Session has expired due to platform reset.'));
    }

    // Verify pinVersion (changing a PIN logs staff out immediately)
    if (payload.orgId) {
      const org = await Org.findById(payload.orgId).select('pinVersion open').lean();
      if (!org) {
        return next(new AppError('NOT_FOUND', 404, 'Hospital facility not found.'));
      }
      if (payload.pv !== undefined && org.pinVersion !== undefined && payload.pv !== org.pinVersion) {
        return next(new AppError('AUTH_REQUIRED', 401, 'Staff PIN has changed. Please log in again.'));
      }
    }

    req.orgId = payload.orgId;
    req.staff = payload;
    next();
  } catch (err) {
    return next(new AppError('AUTH_REQUIRED', 401, 'Invalid or expired staff session.'));
  }
}

/**
 * Require Admin Authentication Middleware (§3.3)
 * Verifies JWT signature, role === 'admin', and tokenEpoch match.
 */
export async function requireAdmin(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(new AppError('AUTH_REQUIRED', 401, 'Admin authentication required.'));
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (payload.role !== 'admin') {
      return next(new AppError('FORBIDDEN', 403, 'Admin access only.'));
    }

    const currentEpoch = await getTokenEpoch();
    if (payload.te !== undefined && payload.te !== currentEpoch) {
      return next(new AppError('AUTH_REQUIRED', 401, 'Admin session expired. Please log in again.'));
    }

    req.admin = payload;
    next();
  } catch (err) {
    return next(new AppError('AUTH_REQUIRED', 401, 'Invalid or expired admin session.'));
  }
}
